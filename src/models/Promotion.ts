import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Product } from './Product';
import { Brand } from './Brand';
import { ProductLine } from './ProductLine';
import { File } from './File';
import { OrderPriceHistory } from './OrderPriceHistory';
import { User } from './User';

export class Promotion extends Model {
  public id!: number;
  public name!: string;
  public discount!: number;
  public state!: string;
  public type!: string;
  public automatically_generated!: boolean;
  public applies_to_products!: string | null;
  public applies_to_services!: string | null;
  public start_date!: Date;
  public end_date!: Date;
  public user_id!: number;
  public product_line_id!: number | null;
  public service_line_id!: number | null;
  public file_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly products?: Product[];
  public readonly brands?: Brand[];
  public readonly productLine?: ProductLine;
  public readonly file?: File;
  public readonly ordersPriceHistories?: OrderPriceHistory[];
  public readonly user?: User;

  public static associations: {
    products: Association<Promotion, Product>;
    brands: Association<Promotion, Brand>;
    productLine: Association<Promotion, ProductLine>;
    file: Association<Promotion, File>;
    ordersPriceHistories: Association<Promotion, OrderPriceHistory>;
    user: Association<Promotion, User>;
  };

  static initModel(sequelize: Sequelize): typeof Promotion {
    Promotion.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      discount: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      automatically_generated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      applies_to_products: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      applies_to_services: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      start_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      end_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      service_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'promotions',
      timestamps: true,
      underscored: true,
    });

    return Promotion;
  }

  static associate(models: any) {
    Promotion.belongsToMany(models.Product, { through: 'promotion_products', foreignKey: 'promotion_id', as: 'products' });
    Promotion.belongsToMany(models.Brand, { through: 'promotion_brands', foreignKey: 'promotion_id', as: 'brands' });
    Promotion.belongsTo(models.ProductLine, { foreignKey: 'product_line_id', as: 'productLine' });
    Promotion.belongsTo(models.File, { foreignKey: 'file_id', as: 'file' });
    Promotion.hasMany(models.OrderPriceHistory, { foreignKey: 'promotion_id', as: 'ordersPriceHistories' });
    Promotion.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  }

  async getInfo(): Promise<Promotion> {
    await this.reload({
      include: ['products', 'brands', 'productLine', 'file', 'ordersPriceHistories']
    });
    if (this.file) {
      (this.file as any).url = this.file.getUrl();
    }
    return this;
  }

  async updateFull(data: any, file?: Express.Multer.File): Promise<void> {
    await this.update({ ...data, product_line_id: null });

    await this.$remove('products', await this.$get('products'));
    await this.$remove('brands', await this.$get('brands'));

    if (data.applies_to_products === 'PS' && data.products) {
      await this.$add('products', JSON.parse(data.products));
    } else if (data.applies_to_products === 'PM' && data.brands) {
      await this.$add('brands', JSON.parse(data.brands));
    } else if (data.applies_to_products === 'PL') {
      await this.update({ product_line_id: data.product_line || null });
    }

    if (data.applies_to_services === 'SS' && data.services) {
      await this.$add('products', JSON.parse(data.services));
    } else if (data.applies_to_services === 'SL') {
      await this.update({ service_line_id: data.service_line || null });
    }

    await this.assignAndStoreFile(file);
  }

  async assignAndStoreFile(file?: Express.Multer.File): Promise<void> {
    if (file) {
      if (this.file_id) {
        const existingFile = await File.findByPk(this.file_id);
        if (existingFile) {
          await existingFile.fullDelete();
        }
      }

      const fileObject = await File.create({
        name: file.originalname,
        location: `promotions/${this.id}`
      });

      await this.update({ file_id: fileObject.id });
      await fileObject.storeFile(file);
      await fileObject.generateImageSizes();
    }
  }

  async getImage(size: keyof File['img_sizes'] = 'md'): Promise<Buffer | null> {
    const file = await this.$get('file');
    if (file) {
      return file.downloadImageResize(size);
    }
    throw new Error('Image not found');
  }

  currencyValue(price: number): number {
    let value = 0;
    if (this.type === 'D') {
      value = this.discount;
    } else if (this.type === 'P') {
      value = (price * this.discount) / 100;
    }
    return Math.floor(value);
  }
}