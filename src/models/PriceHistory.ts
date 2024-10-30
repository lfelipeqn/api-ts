import { Model, DataTypes, Sequelize, Association, fn, col } from 'sequelize';
import { Product } from './Product';

interface PriceHistoryAttributes {
  id: number;
  product_id: number;
  price: number;
  min_final_price: number;
  unit_cost: number;
  created_at: Date;
  updated_at: Date;
}

interface PriceHistoryCreationAttributes extends Omit<PriceHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class PriceHistory extends Model<PriceHistoryAttributes, PriceHistoryCreationAttributes> {
  get id(): number { return this.getDataValue('id'); }
  get product_id(): number { return this.getDataValue('product_id'); }
  get price(): number { 
    const value = this.getDataValue('price');
    return value === null ? 0 : Number(value);
  }
  get min_final_price(): number { 
    const value = this.getDataValue('min_final_price');
    return value === null ? 0 : Number(value);
  }
  get unit_cost(): number { 
    const value = this.getDataValue('unit_cost');
    return value === null ? 0 : Number(value);
  }
  get created_at(): Date { return this.getDataValue('created_at'); }
  get updated_at(): Date { return this.getDataValue('updated_at'); }

  // Associations
  declare readonly product?: Product;
  // public readonly user?: User;  // Commented out user association

  public static associations: {
    product: Association<PriceHistory, Product>;
    // user: Association<PriceHistory, User>;  // Commented out user association
  };

  static initModel(sequelize: Sequelize): typeof PriceHistory {
    PriceHistory.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('price');
          return value === null ? 0 : Number(value);
        }
      },
      min_final_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('min_final_price');
          return value === null ? 0 : Number(value);
        }
      },
      unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('unit_cost');
          return value === null ? 0 : Number(value);
        }
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'price_histories',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['product_id']
        },
        {
          fields: ['created_at']
        }
      ]
    });

    return PriceHistory;
  }

  static associate(models: {
    Product: typeof Product;
  }) {
    if (!models.Product) {
      throw new Error('Product model not provided to PriceHistory.associate');
    }

    PriceHistory.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product',
      onDelete: 'CASCADE',
    });

    // Commented out User association
    // PriceHistory.belongsTo(models.User, {
    //   foreignKey: 'user_id',
    //   as: 'user',
    // });
  }

  // Helper methods
  static async getLatestPrice(productId: number): Promise<PriceHistory | null> {
    return this.findOne({
      where: { product_id: productId },
      order: [['created_at', 'DESC']],
      logging: console.log
    });
  }

  static async getPriceHistory(
    productId: number,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ rows: PriceHistory[]; count: number }> {
    return PriceHistory.findAndCountAll({
      where: { product_id: productId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
  }

  static async getAveragePrice(productId: number): Promise<number | null> {
    const result = await PriceHistory.findOne({
      where: { product_id: productId },
      attributes: [
        [fn('AVG', col('price')), 'averagePrice']
      ],
      raw: true
    });

    return result ? (result as any).averagePrice : null;
  }

  static async getPriceRange(productId: number): Promise<{ min: number; max: number } | null> {
    const result = await PriceHistory.findOne({
      where: { product_id: productId },
      attributes: [
        [fn('MIN', col('price')), 'minPrice'],
        [fn('MAX', col('price')), 'maxPrice']
      ],
      raw: true
    });

    return result ? {
      min: (result as any).minPrice,
      max: (result as any).maxPrice
    } : null;
  }
}