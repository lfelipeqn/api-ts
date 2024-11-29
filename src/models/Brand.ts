import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Association,
  Optional,
  Transaction 
} from 'sequelize';
import { Product } from './Product';
import { ProductLine } from './ProductLine';
import { File } from './File';
import { FileWithDetails, ImageSizes } from '../types/file';


// Interfaces
interface BrandAttributes {
  id: number;
  name: string;
  for_vehicles: boolean;
  for_products: boolean;
  file_id: number | null;
  created_at?: Date;
  updated_at?: Date;
}

interface BrandCreationAttributes extends Optional<BrandAttributes, 'id' | 'created_at' | 'updated_at'> {}

interface BrandUpdate {
  name?: string;
  for_vehicles?: boolean;
  for_products?: boolean;
  productLines?: ProductLine[] | number[];
  file?: Express.Multer.File;
}

interface BrandWithImage extends BrandAttributes {
  image?: {
    url: string;
    sizes?: ImageSizes;
  };
}

export class Brand extends Model<BrandAttributes, BrandCreationAttributes> {
  declare id: number;
  declare name: string;
  declare for_vehicles: boolean;
  declare for_products: boolean;
  declare file_id: number | null;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  public readonly products?: Product[];
  public readonly productLines?: ProductLine[];
  public readonly file?: File;

  public static associations: {
    products: Association<Brand, Product>;
    productLines: Association<Brand, ProductLine>;
    file: Association<Brand, File>;
  };

  static initModel(sequelize: Sequelize): typeof Brand {
    Brand.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      for_vehicles: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      for_products: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'brands',
      timestamps: true,
      underscored: true,
    });

    return Brand;
  }

  static associate(models: any) {
    Brand.hasMany(models.Product, { foreignKey: 'brand_id', as: 'products' });
    Brand.belongsToMany(models.ProductLine, {
      through: 'brands_product_lines',
      foreignKey: 'brand_id',
      otherKey: 'product_line_id',
      as: 'productLines'
    });
    Brand.belongsTo(models.File, { foreignKey: 'file_id', as: 'file' });
  }

  async getImageDetails(): Promise<{ url: string; sizes: ImageSizes } | null> {
    if (!this.file_id) return null;

    const file = await File.findByPk(this.file_id);
    if (!file) return null;

    const fileInstance = new File();
    const processedFile = await fileInstance.processFileDetails({
      id: file.id,
      name: file.name,
      location: file.location,
      created_at: file.created_at,
      updated_at: file.updated_at,
      products_files: { principal: true }
    });

    return {
      url: processedFile.url,
      sizes: processedFile.sizes
    };
  }

  async toDetailedJSON(): Promise<BrandWithImage> {
    const imageDetails = await this.getImageDetails();
    
    return {
      ...this.toJSON(),
      image: imageDetails || undefined
    };
  }

  // Methods
  async updateFull(data: BrandUpdate, transaction?: Transaction) {
    const t = transaction || await this.sequelize!.transaction();

    try {
      // Update basic fields
      await this.update({
        name: data.name,
        for_vehicles: data.for_vehicles,
        for_products: data.for_products,
      }, { transaction: t });

      // Update product lines if provided
      if (data.productLines) {
        const productLineIds = Array.isArray(data.productLines)
          ? data.productLines.map(pl => typeof pl === 'number' ? pl : pl.id)
          : [];
        await this.assignProductLines(productLineIds, t);
      }

      // Handle file if provided
      if (data.file) {
        await this.assignAndStoreFile(data.file, t);
      }

      if (!transaction) {
        await t.commit();
      }
    } catch (error) {
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  async assignProductLines(productLineIds: number[], transaction?: Transaction) {
    try {
      await (this as any).setProductLines(productLineIds, { transaction });
    } catch (error) {
      console.error('Error assigning product lines:', error);
      throw new Error('Failed to assign product lines');
    }
  }

  async assignAndStoreFile(file: Express.Multer.File, transaction?: Transaction) {
    try {
      if (this.file_id) {
        // Get existing file
        const existingFile = await File.findByPk(this.file_id);
        if (existingFile) {
          // Replace existing file
          await existingFile.replaceFile(file, transaction);
          return;
        }
      }

      // Create new file
      const newFile = await File.create({
        name: file.originalname,
        location: `brands/${this.id}`,
      }, { transaction });

      // Store the file in Google Cloud Storage
      await newFile.storeFile(file);

      // Generate image sizes if it's an image
      if (this.isImage(file.originalname)) {
        await newFile.generateImageSizes();
      }

      // Update brand with new file ID
      await this.update({ file_id: newFile.id }, { transaction });
    } catch (error) {
      console.error('Error handling file:', error);
      throw new Error('Failed to handle file upload');
    }
  }

  // Helper method to get file URL
  async getFileUrl(): Promise<string | null> {
    if (!this.file_id) return null;
    
    const file = await File.findByPk(this.file_id);
    return file ? file.getUrl() : null;
  }

  // Helper method to get file with all sizes
  async getFileWithSizes(): Promise<{
    url: string;
    sizes?: Record<string, string>;
  } | null> {
    if (!this.file_id) return null;
    
    const file = await File.findByPk(this.file_id);
    if (!file) return null;

    return {
      url: file.getUrl(),
      sizes: file.getImageSizesUrl()
    };
  }

  private isImage(filename: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
  }
}