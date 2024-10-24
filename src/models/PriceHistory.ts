import { Model, DataTypes, Sequelize, Association, fn, col } from 'sequelize';
import { Product } from './Product';
// import { User } from './User';  // Commented out User import

interface PriceHistoryAttributes {
  id: number;
  product_id: number;
  price: number;
  min_final_price: number;
  unit_cost: number;
  user_id: number; // Keeping for database compatibility
  created_at: Date;
  updated_at: Date;
}

interface PriceHistoryCreationAttributes extends Omit<PriceHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class PriceHistory extends Model<PriceHistoryAttributes, PriceHistoryCreationAttributes> {
  public id!: number;
  public product_id!: number;
  public price!: number;
  public min_final_price!: number;
  public unit_cost!: number;
  public user_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly product?: Product;
  // public readonly user?: User;  // Commented out user association

  public static associations: {
    product: Association<PriceHistory, Product>;
    // user: Association<PriceHistory, User>;  // Commented out user association
  };

  static initModel(sequelize: Sequelize): typeof PriceHistory {
    PriceHistory.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),  // Adjust precision and scale as needed
          allowNull: false,
          get() {
            const value = this.getDataValue('price');
            return value === null ? null : parseFloat(value.toString());
          }
        },
        min_final_price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          get() {
            const value = this.getDataValue('min_final_price');
            return value === null ? null : parseFloat(value.toString());
          }
        },
        unit_cost: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          get() {
            const value = this.getDataValue('unit_cost');
            return value === null ? null : parseFloat(value.toString());
          }
        },
        product_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        user_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 1, // Temporary default value
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: 'price_histories',
        timestamps: true,
        underscored: true,
        indexes: [
          {
            fields: ['product_id'],
          },
          {
            fields: ['created_at'],
          },
        ],
      }
    );

    return PriceHistory;
  }

  static associate(models: {
    Product: typeof Product;
    // User: typeof User;  // Commented out User type
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
  static async getLatestPrice(productId: number): Promise<number | null> {
    const latestPrice = await PriceHistory.findOne({
      where: { product_id: productId },
      order: [['created_at', 'DESC']],
    });

    return latestPrice ? latestPrice.price : null;
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