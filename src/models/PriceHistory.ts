import { Model, DataTypes, Sequelize, Association, fn, col } from 'sequelize';
import { Product } from './Product';
import { roundToThousand } from '../utils/price';

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
          return value === null ? 0 : roundToThousand(Number(value));
        },
        set(value: number) {
          this.setDataValue('price', roundToThousand(value));
        }
      },
      min_final_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('min_final_price');
          return value === null ? 0 : roundToThousand(Number(value));
        },
        set(value: number) {
          this.setDataValue('min_final_price', roundToThousand(value));
        }
      },
      unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('unit_cost');
          return value === null ? 0 : roundToThousand(Number(value));
        },
        set(value: number) {
          this.setDataValue('unit_cost', roundToThousand(value));
        }
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'price_histories',
      timestamps: true,
      underscored: true,
      /*hooks: {
        beforeCreate: (instance: PriceHistory) => {
          // Ensure all price fields are rounded to thousands
          instance.price = roundToThousand(instance.price);
          instance.min_final_price = roundToThousand(instance.min_final_price);
          instance.unit_cost = roundToThousand(instance.unit_cost);
        },
        beforeUpdate: (instance: PriceHistory) => {
          // Ensure all price fields are rounded to thousands when updating
          if (instance.changed('price')) {
            instance.price = roundToThousand(instance.price);
          }
          if (instance.changed('min_final_price')) {
            instance.min_final_price = roundToThousand(instance.min_final_price);
          }
          if (instance.changed('unit_cost')) {
            instance.unit_cost = roundToThousand(instance.unit_cost);
          }
        }
      },*/
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