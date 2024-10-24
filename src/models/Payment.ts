import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Order } from './Order';

export class Payment extends Model {
  public id!: number;
  public transaction_id!: string;
  public state!: string;
  public state_description!: string;
  public payment_gateway!: string;
  public payment_method_type!: string;
  public url!: string;
  public order_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly order?: Order;

  public static associations: {
    order: Association<Payment, Order>;
  };

  static initModel(sequelize: Sequelize): typeof Payment {
    Payment.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      transaction_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      state_description: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payment_gateway: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payment_method_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'payments',
      timestamps: true,
      underscored: true,
    });

    return Payment;
  }

  static associate(models: any) {
    Payment.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
  }

  // You can add query factory methods here
  static async findByOrder(orderId: number): Promise<Payment[]> {
    return this.findAll({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']]
    });
  }

  // You can add more methods here if needed
}