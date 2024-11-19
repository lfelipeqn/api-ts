// models/OrderPriceHistory.ts

import { Model, DataTypes, Sequelize, Association, Transaction } from 'sequelize';
import { Order } from './Order';
import { Product } from './Product';
import { Promotion } from './Promotion';
import { PriceHistory } from './PriceHistory';
import { CartDetail } from './CartDetail';

interface OrderPriceHistoryAttributes {
  id: number;
  order_id: number;
  product_id: number;
  price_history_id: number;
  promotion_id: number | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
  final_amount: number;
  is_free: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface OrderPriceHistoryCreationAttributes extends Omit<OrderPriceHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class OrderPriceHistory extends Model<OrderPriceHistoryAttributes, OrderPriceHistoryCreationAttributes> {
  declare id: number;
  declare order_id: number;
  declare product_id: number;
  declare price_history_id: number;
  declare promotion_id: number | null;
  declare quantity: number;
  declare unit_price: number;
  declare subtotal: number;
  declare discount_amount: number;
  declare final_amount: number;
  declare is_free: boolean;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Associations
  declare readonly order?: Order;
  declare readonly product?: Product;
  declare readonly priceHistory?: PriceHistory;
  declare readonly promotion?: Promotion;

  public static associations: {
    order: Association<OrderPriceHistory, Order>;
    product: Association<OrderPriceHistory, Product>;
    priceHistory: Association<OrderPriceHistory, PriceHistory>;
    promotion: Association<OrderPriceHistory, Promotion>;
  };

  static initModel(sequelize: Sequelize): typeof OrderPriceHistory {
    OrderPriceHistory.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      price_history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      promotion_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      final_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      is_free: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE,
    }, {
      sequelize,
      tableName: 'orders_price_histories',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['order_id']
        },
        {
          fields: ['product_id']
        },
        {
          fields: ['price_history_id']
        },
        {
          fields: ['promotion_id']
        }
      ]
    });

    return OrderPriceHistory;
  }

  static associate(models: {
    Order: typeof Order;
    Product: typeof Product;
    PriceHistory: typeof PriceHistory;
    Promotion: typeof Promotion;
  }): void {
    OrderPriceHistory.belongsTo(models.Order, {
      foreignKey: 'order_id',
      as: 'order'
    });
    OrderPriceHistory.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product'
    });
    OrderPriceHistory.belongsTo(models.PriceHistory, {
      foreignKey: 'price_history_id',
      as: 'priceHistory'
    });
    OrderPriceHistory.belongsTo(models.Promotion, {
      foreignKey: 'promotion_id',
      as: 'promotion'
    });
  }

  // Helper method to create order history items from cart details
  static async createFromCartDetails(
    orderId: number,
    cartDetails: CartDetail[],
    transaction?: Transaction
  ): Promise<OrderPriceHistory[]> {
    const histories: OrderPriceHistory[] = [];

    for (const detail of cartDetails) {
      const summary = await detail.getItemSummary();
      
      const history = await OrderPriceHistory.create({
        order_id: orderId,
        product_id: detail.product_id,
        price_history_id: detail.price_history_id,
        promotion_id: summary.applied_promotion?.id || null,
        quantity: detail.quantity,
        unit_price: summary.price,
        subtotal: summary.subtotal,
        discount_amount: summary.discount,
        final_amount: summary.final_price,
        is_free: false,
        notes: summary.applied_promotion ? 
          `Promotion applied: ${summary.applied_promotion.type} - ${summary.applied_promotion.discount}` : 
          null
      }, { transaction });

      histories.push(history);
    }

    return histories;
  }

  // Method to get detailed information about the order item
  async getDetailedInfo(): Promise<{
    id: number;
    product: {
      id: number;
      name: string;
      reference: string;
    };
    quantity: number;
    pricing: {
      unit_price: number;
      subtotal: number;
      discount: number;
      final_amount: number;
    };
    promotion?: {
      id: number;
      name: string;
      type: string;
      discount: number;
    };
  }> {
    await this.reload({
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'reference']
        },
        {
          model: Promotion,
          as: 'promotion',
          attributes: ['id', 'name', 'type', 'discount']
        }
      ]
    });

    return {
      id: this.id,
      product: {
        id: this.product!.id,
        name: this.product!.name,
        reference: this.product!.reference
      },
      quantity: this.quantity,
      pricing: {
        unit_price: Number(this.unit_price),
        subtotal: Number(this.subtotal),
        discount: Number(this.discount_amount),
        final_amount: Number(this.final_amount)
      },
      ...(this.promotion && {
        promotion: {
          id: this.promotion.id,
          name: this.promotion.name,
          type: this.promotion.type,
          discount: Number(this.promotion.discount)
        }
      })
    };
  }

  // Method to calculate savings percentage
  getSavingsPercentage(): number {
    if (this.subtotal === 0) return 0;
    return (Number(this.discount_amount) / Number(this.subtotal)) * 100;
  }
}