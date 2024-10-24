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

export class Brand extends Model<BrandAttributes, BrandCreationAttributes> {
  public id!: number;
  public name!: string;
  public for_vehicles!: boolean;
  public for_products!: boolean;
  public file_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

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
      through: 'brand_product_lines',
      foreignKey: 'brand_id',
      otherKey: 'product_line_id',
      as: 'productLines'
    });
    Brand.belongsTo(models.File, { foreignKey: 'file_id', as: 'file' });
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
        original_name: file.originalname,
        location: `brands/${this.id}`,
        mime_type: file.mimetype,
        size: file.size,
        metadata: {
          uploadedBy: 'brand',
          brandId: this.id,
          originalName: file.originalname,
          contentType: file.mimetype
        }
      }, { transaction });

      // Store the file in Google Cloud Storage
      await newFile.storeFile(file);

      // Generate image sizes if it's an image
      if (file.mimetype.startsWith('image/')) {
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
}