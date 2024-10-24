import { Model, DataTypes, Sequelize, Transaction } from 'sequelize';
import { Storage, Bucket, File as GCSFile } from '@google-cloud/storage';
import sharp from 'sharp';
import path from 'path';
import mime from 'mime-types';

// Interfaces
interface ImageSizes {
  xs: number;
  sm: number;
  md: number;
  lg: number;
}

interface FileAttributes {
  id: number;
  name: string;
  location: string;
  mime_type: string;
  size: number;
  original_name: string;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

interface FileMetadata {
  originalName?: string;
  size?: number;
  resizedFrom?: string;
  resizeType?: string;
  contentType?: string;
  [key: string]: any;
}

interface FileCreationAttributes extends Omit<FileAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class File extends Model<FileAttributes, FileCreationAttributes> {
  public id!: number;
  public name!: string;
  public location!: string;
  public mime_type!: string;
  public size!: number;
  public original_name!: string;
  public metadata!: Record<string, any>;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  private static storage: Storage = new Storage();
  private static readonly bucketName: string = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'batericars-storage';
  private static bucket: Bucket = File.storage.bucket(File.bucketName);

  public readonly img_sizes: ImageSizes = {
    xs: 120,
    sm: 300,
    md: 600,
    lg: 1200,
  };

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
      mime_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      size: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      original_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      },
      created_at: '',
      updated_at: ''
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

  static associate(models: any) {
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
      if (file.mimetype.startsWith('image/')) {
        await this.validateImage(file.buffer);
      }

      const blob = this.getBlob();
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          size: file.size,
        },
      });

      this.mime_type = file.mimetype;
      this.size = file.size;
      this.original_name = file.originalname;
      await this.save();
    } catch (error:any) {
      console.error('Error storing file:', error);
      throw new Error(`Failed to store file: ${error.message}`);
    }
  }

  async replaceFile(file: Express.Multer.File | string | any, transaction?: Transaction): Promise<void> {
    try {
      const blob = this.getBlob();
      
      // Delete existing file
      try {
        await blob.delete();
      } catch (error) {
        console.log("Original file not found", `${this.location}/${this.name}`);
      }

      // Remove existing image sizes
      await this.removeImageSizes();

      // Store new file
      if (typeof file === 'string') {
        await blob.save(file);
        this.mime_type = mime.lookup(this.name) || 'application/octet-stream';
        this.size = Buffer.from(file).length;
      } else {
        if (file.mimetype.startsWith('image/')) {
          await this.validateImage(file.buffer);
        }
        await blob.save(file.buffer, {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            size: file.size,
          },
        });
        this.mime_type = file.mimetype;
        this.size = file.size;
        this.original_name = file.originalname;
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
    if (!this.mime_type.startsWith('image/')) {
      throw new Error('File is not an image');
    }
  
    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      
      let compressedImage: Buffer;
      
      switch(this.mime_type) {
        case 'image/jpeg':
          compressedImage = await image.jpeg({ quality }).toBuffer();
          break;
        case 'image/png':
          compressedImage = await image.png({ quality }).toBuffer();
          break;
        case 'image/webp':
          compressedImage = await image.webp({ quality }).toBuffer();
          break;
        default:
          throw new Error('Unsupported image format for compression');
      }
  
      await this.replaceFile(compressedImage);
    } catch (error: any) {
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

  async generateImageSizes(sizes: Partial<ImageSizes> | null = null, omit: (keyof ImageSizes)[] = []): Promise<void> {
    if (!this.mime_type.startsWith('image/')) {
      throw new Error('File is not an image');
    }

    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      const targetSizes = sizes || this.img_sizes;

      await Promise.all(
        Object.entries(targetSizes).map(async ([sizeName, size]) => {
          if (!omit.includes(sizeName as keyof ImageSizes)) {
            const resizedImage = await image
              .resize(size, size, { fit: 'inside', withoutEnlargement: true })
              .toBuffer();
            
            const blob = this.getBlob(`${sizeName}_${this.name}`);
            await blob.save(resizedImage, {
              contentType: this.mime_type,
              metadata: {
                originalName: this.original_name,
                size: resizedImage.length,
                resizedFrom: this.name,
                resizeType: sizeName
              },
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
    if (!this.mime_type.startsWith('image/')) {
      throw new Error('File is not an image');
    }
  
    try {
      const fileContent = await this.downloadFile();
      const image = sharp(fileContent);
      
      let convertedImage: Buffer;
      let newMimeType: string;
      
      switch(format) {
        case 'jpeg':
          convertedImage = await image.jpeg(options).toBuffer();
          newMimeType = 'image/jpeg';
          break;
        case 'png':
          convertedImage = await image.png(options).toBuffer();
          newMimeType = 'image/png';
          break;
        case 'webp':
          convertedImage = await image.webp(options).toBuffer();
          newMimeType = 'image/webp';
          break;
      }
  
      // Update file extension
      const newName = `${path.parse(this.name).name}.${format}`;
      this.name = newName;
      this.mime_type = newMimeType;
  
      await this.replaceFile(convertedImage);
    } catch (error: any) {
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

      // Also set visibility for image sizes if they exist
      if (this.mime_type.startsWith('image/')) {
        await Promise.all(
          Object.keys(this.img_sizes).map(async (sizeName) => {
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
    const targetSizes = sizes || Object.keys(this.img_sizes);
    return targetSizes.reduce((urls, size) => ({
      ...urls,
      [size]: this.getUrl(size as keyof ImageSizes)
    }), {});
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

  async removeImageSizes(sizes: (keyof ImageSizes)[] | null = null, omit: (keyof ImageSizes)[] = []): Promise<void> {
    try {
      const targetSizes = sizes || Object.keys(this.img_sizes);
      
      await Promise.all(
        targetSizes.map(async (sizeName) => {
          if (!omit.includes(sizeName as keyof ImageSizes)) {
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
    if (!this.mime_type.startsWith('image/')) {
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
    } catch (error: any) {
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

}