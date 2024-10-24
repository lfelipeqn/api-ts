import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Transaction, 
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  QueryTypes
} from 'sequelize'
import { Storage, Bucket, File as GCSFile } from '@google-cloud/storage';
import sharp from 'sharp';
import path from 'path';
import mime from 'mime-types';
import { Product } from './Product';
import { FileMetadata, 
  FileWithDetails, 
  FileWithPrincipal, 
  RawFileWithPrincipal, 
  ImageSizes } from '../types/file';


export class File extends Model<InferAttributes<File>, InferCreationAttributes<File>>  {
  declare id: CreationOptional<number>;
  declare name: string;
  declare location: string;
  declare readonly created_at: CreationOptional<Date>;
  declare readonly updated_at: CreationOptional<Date>;

  private static readonly DEFAULT_IMAGE_SIZES = ['xs', 'sm', 'md', 'lg', 'original'] as const;

  private static storage: Storage = new Storage();
  private static readonly bucketName: string = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'batericars-storage';
  private static bucket: Bucket = File.storage.bucket(File.bucketName);

  static initModel(sequelize: Sequelize): typeof File {
    File.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE,
    } , {
      sequelize,
      tableName: 'files',
      timestamps: true,
      underscored: true,
      hooks: {
        beforeDestroy: async (instance: File) => {
          await instance.fullDelete();
        }
      }
    });

    return File;
  }

  static associate(models: { Product: typeof Product }) {
    File.belongsToMany(models.Product, {
      through: 'products_files',
      foreignKey: 'file_id',
      otherKey: 'product_id',
      as: 'products'
    });
  }

  private getBlob(filename?: string): GCSFile {
    const fullPath = filename 
      ? `${this.location}/${filename}`
      : `${this.location}/${this.name}`;
    return File.bucket.file(fullPath);
  }

  private getMetadataFromFile(file: Express.Multer.File): FileMetadata {
    return {
      mimeType: file.mimetype,
      size: file.size,
      originalName: file.originalname
    };
  }

  private isImage(filename: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
  }

  private async validateImage(buffer: Buffer): Promise<void> {
    try {
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format || !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
        throw new Error('Invalid image format');
      }
    } catch (error) {
      throw new Error('Invalid image file');
    }
  }

  async storeFile(file: Express.Multer.File): Promise<void> {
    try {
      if (this.isImage(file.originalname)) {
        await this.validateImage(file.buffer);
      }

      const metadata = this.getMetadataFromFile(file);
      const blob = this.getBlob();
      
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        metadata
      });

      await this.save();
    } catch (error:any) {
      console.error('Error storing file:', error);
      throw new Error(`Failed to store file: ${error.message}`);
    }
  }

  async replaceFile(file: Express.Multer.File | string | Buffer, transaction?: Transaction): Promise<void> {
    try {
      const blob = this.getBlob();
      
      // Delete existing file and sizes
      try {
        await blob.delete();
        await this.removeImageSizes();
      } catch (error) {
        console.log("Original file not found", `${this.location}/${this.name}`);
      }

      // Handle different input types
      if (typeof file === 'string') {
        const buffer = Buffer.from(file);
        await blob.save(buffer, {
          contentType: mime.lookup(this.name) || 'application/octet-stream',
          metadata: {
            size: buffer.length
          }
        });
      } else if (Buffer.isBuffer(file)) {
        await blob.save(file, {
          contentType: mime.lookup(this.name) || 'application/octet-stream',
          metadata: {
            size: file.length
          }
        });
      } else {
        if (this.isImage(file.originalname)) {
          await this.validateImage(file.buffer);
        }
        
        const metadata = this.getMetadataFromFile(file);
        await blob.save(file.buffer, {
          contentType: file.mimetype,
          metadata
        });
      }

      await this.save({ transaction });
    } catch (error:any) {
      console.error('Error replacing file:', error);
      throw new Error(`Failed to replace file: ${error.message}`);
    }
  }

  /**
 * Compress an image file
 */
  async compressImage(quality: number = 80): Promise<void> {
    if (!this.isImage(this.name)) {
      throw new Error('File is not an image');
    }

    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      const format = path.extname(this.name).toLowerCase().slice(1);
      let compressedImage: Buffer;

      switch(format) {
        case 'jpg':
        case 'jpeg':
          compressedImage = await image.jpeg({ quality }).toBuffer();
          break;
        case 'png':
          compressedImage = await image.png({ quality }).toBuffer();
          break;
        case 'webp':
          compressedImage = await image.webp({ quality }).toBuffer();
          break;
        default:
          throw new Error('Unsupported image format for compression');
      }

      await this.replaceFile(compressedImage);
    } catch (error:any) {
      console.error('Error compressing image:', error);
      throw new Error(`Failed to compress image: ${error.message}`);
    }
  }

  async fullDelete(): Promise<void> {
    try {
      const blob = this.getBlob();
      
      try {
        await blob.delete();
      } catch (error) {
        console.log("File not found during deletion", `${this.location}/${this.name}`);
      }
  
      await this.removeImageSizes();
      
      // Check if the instance exists in the database before destroying
      if (!this.isNewRecord && this.id) {
        // Use raw query to avoid recursive calls
        await (this.constructor as typeof File).destroy({
          where: { id: this.id },
          force: true // Use force: true to avoid soft delete if you're using it
        });
      }
    } catch (error:any) {
      console.error('Error during full delete:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async downloadFile(): Promise<Buffer> {
    try {
      const blob = this.getBlob();
      const [fileContent] = await blob.download();
      return fileContent;
    } catch (error:any) {
      console.error('Error downloading file:', error);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  async generateImageSizes(sizes?: { [key: string]: number }, omit: string[] = []): Promise<void> {
    if (!this.isImage(this.name)) {
      throw new Error('File is not an image');
    }

    const defaultSizes = {
      xs: 120,
      sm: 300,
      md: 600,
      lg: 1200
    };

    const targetSizes = sizes || defaultSizes;

    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      const format = path.extname(this.name).toLowerCase().slice(1);
      const mimeType = mime.lookup(this.name) || 'image/jpeg';

      await Promise.all(
        Object.entries(targetSizes).map(async ([sizeName, size]) => {
          if (!omit.includes(sizeName)) {
            const resizedImage = await image
              .resize(size, size, { fit: 'inside', withoutEnlargement: true })
              .toBuffer();

            const blob = this.getBlob(`${sizeName}_${this.name}`);
            await blob.save(resizedImage, {
              contentType: mimeType,
              metadata: {
                size: resizedImage.length,
                resizedFrom: this.name,
                sizeVariant: sizeName
              }
            });
          }
        })
      );
    } catch (error:any) {
      console.error('Error generating image sizes:', error);
      throw new Error(`Failed to generate image sizes: ${error.message}`);
    }
  }

  /**
 * Convert image to another format
 */
  async convertFormat(format: 'jpeg' | 'png' | 'webp', options: sharp.OutputOptions = {}): Promise<void> {
    if (!this.isImage(this.name)) {
      throw new Error('File is not an image');
    }

    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      let convertedImage: Buffer;
      
      switch(format) {
        case 'jpeg':
          convertedImage = await image.jpeg(options).toBuffer();
          break;
        case 'png':
          convertedImage = await image.png(options).toBuffer();
          break;
        case 'webp':
          convertedImage = await image.webp(options).toBuffer();
          break;
      }

      // Update file name with new extension
      const newName = `${path.parse(this.name).name}.${format}`;
      this.name = newName;

      // Replace the file with converted version
      await this.replaceFile(convertedImage);
    } catch (error:any) {
      console.error('Error converting image format:', error);
      throw new Error(`Failed to convert image format: ${error.message}`);
    }
  }

  

  async setVisibility(isPublic: boolean): Promise<void> {
    try {
      const blob = this.getBlob();
      await blob.setMetadata({
        predefinedAcl: isPublic ? 'publicRead' : 'private'
      });

      // Handle visibility for image sizes if it's an image
      if (this.isImage(this.name)) {
        const defaultSizes = ['xs', 'sm', 'md', 'lg'];
        await Promise.all(
          defaultSizes.map(async (sizeName) => {
            const sizedBlob = this.getBlob(`${sizeName}_${this.name}`);
            try {
              await sizedBlob.setMetadata({
                predefinedAcl: isPublic ? 'publicRead' : 'private'
              });
            } catch (error) {
              console.log(`Size variant not found: ${sizeName}_${this.name}`);
            }
          })
        );
      }
    } catch (error:any) {
      console.error('Error setting visibility:', error);
      throw new Error(`Failed to set visibility: ${error.message}`);
    }
  }


  getUrl(size?: keyof ImageSizes): string {
    const cdnUrl = process.env.CDN_URL || `https://storage.googleapis.com/${File.bucketName}`;
    const filename = size ? `${size}_${this.name}` : this.name;
    return `${cdnUrl}/${this.location}/${filename}`;
  }

  getImageSizesUrl(sizes?: (keyof ImageSizes)[]): Record<string, string> {
    const defaultSizes = ['xs', 'sm', 'md', 'lg', 'original'];
    const targetSizes = sizes || defaultSizes;
    const baseUrl = process.env.CDN_URL || `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}`;

    return targetSizes.reduce((urls, size) => ({
      ...urls,
      [size]: size === 'original' 
        ? `${baseUrl}/${this.location}/${this.name}`
        : `${baseUrl}/${this.location}/${size}_${this.name}`
    }), {} as Record<string, string>);
  }


  // New utility methods
  static async isValidFileType(mimetype: string, allowedTypes: string[]): Promise<boolean> {
    return allowedTypes.includes(mimetype);
  }

  static async getFileStats(location: string): Promise<{exists: boolean; size?: number}> {
    try {
      const [exists] = await File.bucket.file(location).exists();
      if (!exists) return { exists: false };
      
      const [metadata]:any = await File.bucket.file(location).getMetadata();
      return { exists: true, size: parseInt(metadata.size) };
    } catch (error) {
      console.error('Error getting file stats:', error);
      return { exists: false };
    }
  }

  async removeImageSizes(sizes?: string[] | null, omit: string[] = []): Promise<void> {
    try {
      const defaultSizes = ['xs', 'sm', 'md', 'lg'];
      const targetSizes = sizes || defaultSizes;

      await Promise.all(
        targetSizes.map(async (sizeName) => {
          if (!omit.includes(sizeName)) {
            const blob = this.getBlob(`${sizeName}_${this.name}`);
            try {
              await blob.delete();
            } catch (error) {
              console.log(`Size variant not found: ${sizeName}_${this.name}`);
            }
          }
        })
      );
    } catch (error:any) {
      console.error('Error removing image sizes:', error);
      throw new Error(`Failed to remove image sizes: ${error.message}`);
    }
  }

  /**
 * Get image dimensions
 */
  async getImageDimensions(): Promise<{ width: number; height: number }> {
    if (!this.isImage(this.name)) {
      throw new Error('File is not an image');
    }

    try {
      const fileContent = await this.downloadFile();
      const metadata = await sharp(fileContent).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Unable to get image dimensions');
      }

      return {
        width: metadata.width,
        height: metadata.height
      };
    } catch (error:any) {
      console.error('Error getting image dimensions:', error);
      throw new Error(`Failed to get image dimensions: ${error.message}`);
    }
  }

  /**
 * Check if file exists in storage
 */
  async exists(): Promise<boolean> {
    try {
      const [exists] = await this.getBlob().exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  async getProductFiles(productId: number): Promise<FileWithPrincipal[]> {
    try {
      const sequelize = this.sequelize!;
      const query = `
        SELECT 
          f.id,
          f.name,
          f.location,
          f.created_at,
          f.updated_at,
          CAST(pf.principal AS UNSIGNED) as principal
        FROM files f
        JOIN products_files pf ON f.id = pf.file_id
        WHERE pf.product_id = :productId
      `;

      const results = await sequelize.query<RawFileWithPrincipal>(query, {
        replacements: { productId },
        type: QueryTypes.SELECT
      });

      return results.map((file) => ({
        ...file,
        products_files: {
          principal: Boolean(file.principal)
        }
      }));
    } catch (error) {
      console.error('Error getting product files:', error);
      throw error;
    }
  }

  private createFileWithPrincipal(data: RawFileWithPrincipal): FileWithPrincipal {
    return {
      id: data.id,
      name: data.name,
      location: data.location,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      products_files: {
        principal: Boolean(data.principal)
      }
    };
  }

  async processFileDetails(file: FileWithPrincipal): Promise<FileWithDetails> {
    try {
      const baseUrl = process.env.CDN_URL || `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}`;
      const fileUrl = `${baseUrl}/${file.location}/${file.name}`;
      
      const sizes: ImageSizes = {
        xs: fileUrl,
        sm: fileUrl,
        md: fileUrl,
        lg: fileUrl,
        original: fileUrl
      };

      // For image files, construct different size URLs
      if (file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        sizes.xs = `${baseUrl}/${file.location}/xs_${file.name}`;
        sizes.sm = `${baseUrl}/${file.location}/sm_${file.name}`;
        sizes.md = `${baseUrl}/${file.location}/md_${file.name}`;
        sizes.lg = `${baseUrl}/${file.location}/lg_${file.name}`;
      }

      return {
        ...file,
        url: fileUrl,
        sizes,
        products_files: file.products_files
      };
    } catch (error) {
      console.error('Error processing file details:', error);
      throw error;
    }
  }


  static async getByProductId(productId: number): Promise<FileWithPrincipal[]> {
    const file = new this();
    return file.getProductFiles(productId);
  }
}