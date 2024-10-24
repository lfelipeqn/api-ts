import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Order } from './Order';
import { PriceHistory } from './PriceHistory';
import { Promotion } from './Promotion';

export class OrderPriceHistory extends Model {
  public id!: number;
  public amount!: number;
  public free!: boolean;
  public stock_sync!: boolean;
  public observation!: string | null;
  public order_id!: number;
  public price_history_id!: number;
  public promotion_id!: number | null;

  // Associations
  public readonly order?: Order;
  public readonly priceHistory?: PriceHistory;
  public readonly promotion?: Promotion;

  public static associations: {
    order: Association<OrderPriceHistory, Order>;
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
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      free: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stock_sync: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      observation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      order_id: {
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
    }, {
      sequelize,
      tableName: 'orders_price_histories',
      timestamps: false,
    });

    return OrderPriceHistory;
  }

  static associate(models: any) {
    OrderPriceHistory.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    OrderPriceHistory.belongsTo(models.PriceHistory, { foreignKey: 'price_history_id', as: 'priceHistory' });
    OrderPriceHistory.belongsTo(models.Promotion, { foreignKey: 'promotion_id', as: 'promotion' });
  }

  // You can add query factory methods here
  static async findByOrder(orderId: number): Promise<OrderPriceHistory[]> {
    return this.findAll({
      where: { order_id: orderId },
      include: ['priceHistory', 'promotion']
    });
  }

  // You can add more methods here if needed
}