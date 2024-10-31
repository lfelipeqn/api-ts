import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { PAYMENT_STATES, PaymentState } from '../types/payment';
import { PaymentMethodConfig } from './PaymentMethodConfig';

interface PaymentAttributes {
  id: number;
  order_id: number;
  payment_method_id: number;
  transaction_id: string;
  amount: number;
  currency: string;
  state: PaymentState;
  state_description: string;
  gateway_response: string | null; // Store as JSON string
  error_message: string | null;
  url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentCreationAttributes extends Omit<PaymentAttributes, 'id' | 'created_at' | 'updated_at'> {}


export class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> {
  declare id: number;
  declare order_id: number;
  declare payment_method_id: number;
  declare transaction_id: string;
  declare amount: number;
  declare currency: string;
  declare state: PaymentState;
  declare state_description: string;
  declare gateway_response: string | null;
  declare error_message: string | null;
  declare url: string | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Associations
  declare readonly order?: any; // Replace with Order type when available
  declare readonly paymentMethod?: PaymentMethodConfig;

  public static associations: {
    order: Association<Payment, any>;
    paymentMethod: Association<Payment, PaymentMethodConfig>;
  };

  // Helper methods for gateway response
  getGatewayResponse(): Record<string, any> | null {
    const value = this.getDataValue('gateway_response');
    return value ? JSON.parse(value) : null;
  }

  setGatewayResponse(value: Record<string, any> | null): void {
    this.setDataValue('gateway_response', value ? JSON.stringify(value) : null);
  }

  static initModel(sequelize: Sequelize): typeof Payment {
    Payment.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      payment_method_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      transaction_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'COP',
      },
      state: {
        type: DataTypes.ENUM(...PAYMENT_STATES),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      state_description: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      gateway_response: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          return this.getGatewayResponse();
        },
        set(value: Record<string, any> | null) {
          this.setGatewayResponse(value);
        }
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE,
    }, {
      sequelize,
      tableName: 'payments',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['order_id']
        },
        {
          fields: ['transaction_id'],
          unique: true
        },
        {
          fields: ['state']
        }
      ]
    });

    return Payment;
  }

  static associate(models: any) {
    Payment.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    Payment.belongsTo(models.PaymentMethodConfig, { 
      foreignKey: 'payment_method_id', 
      as: 'paymentMethod' 
    });
  }

  static async findByOrder(orderId: number): Promise<Payment[]> {
    return this.findAll({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']],
      include: ['paymentMethod']
    });
  }

  async updateState(
    state: PaymentState, 
    description: string, 
    gatewayResponse?: Record<string, any>
  ): Promise<void> {
    await this.update({
      state,
      state_description: description,
      gateway_response: gatewayResponse ? JSON.stringify(gatewayResponse) : this.gateway_response
    });
  }
}