// models/Payment.ts

import { Model, DataTypes, Sequelize, Association, Transaction } from 'sequelize';
import { PAYMENT_STATES, PaymentState, PaymentGateway, PAYMENT_GATEWAYS } from '../types/payment';
import { PaymentMethodConfig } from './PaymentMethodConfig';
import { Order } from './Order';
import { User } from './User';

interface PaymentAttributes {
  id: number;
  order_id: number;
  payment_method_id: number;
  transaction_id: string;
  reference: string;
  amount: number;
  currency: string;
  state: PaymentState;
  state_description: string;
  gateway_response: string | null;
  error_message: string | null;
  url: string | null;
  gateway: PaymentGateway;
  attempts: number;
  last_attempt_at: Date | null;
  external_reference: string | null;
  metadata: string | null;
  user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentCreationAttributes extends Omit<PaymentAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> {
  declare id: number;
  declare order_id: number;
  declare payment_method_id: number;
  declare transaction_id: string;
  declare reference: string;
  declare amount: number;
  declare currency: string;
  declare state: PaymentState;
  declare state_description: string;
  declare gateway_response: string | null;
  declare error_message: string | null;
  declare url: string | null;
  declare gateway: PaymentGateway;
  declare attempts: number;
  declare last_attempt_at: Date | null;
  declare external_reference: string | null;
  declare metadata: string | null;
  declare user_id: number | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Associations
  declare readonly order?: Order;
  declare readonly paymentMethod?: PaymentMethodConfig;
  declare readonly user?: User;

  public static associations: {
    order: Association<Payment, Order>;
    paymentMethod: Association<Payment, PaymentMethodConfig>;
    user: Association<Payment, User>;
  };

  // Helper methods for gateway response
  getGatewayResponse(): Record<string, any> | null {
    try {
      const value = this.getDataValue('gateway_response');
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error parsing gateway response:', error);
      return null;
    }
  }

  setGatewayResponse(value: Record<string, any> | null): void {
    this.setDataValue('gateway_response', value ? JSON.stringify(value) : null);
  }

  getMetadata(): Record<string, any> | null {
    try {
      const value = this.getDataValue('metadata');
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error parsing metadata:', error);
      return null;
    }
  }

  setMetadata(value: Record<string, any> | null): void {
    this.setDataValue('metadata', value ? JSON.stringify(value) : null);
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
      reference: {
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
      gateway: {
        type: DataTypes.ENUM(...PAYMENT_GATEWAYS),
        allowNull: false,
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_attempt_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      external_reference: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          return this.getMetadata();
        },
        set(value: Record<string, any> | null) {
          this.setMetadata(value);
        }
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
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
          fields: ['transaction_id']
        },
        {
          fields: ['reference']
        },
        {
          fields: ['state']
        },
        {
          fields: ['user_id']
        }
      ]
    });

    return Payment;
  }

  static associate(models: {
    Order: typeof Order;
    PaymentMethodConfig: typeof PaymentMethodConfig;
    User: typeof User;
  }): void {
    Payment.belongsTo(models.Order, { 
      foreignKey: 'order_id', 
      as: 'order' 
    });
    Payment.belongsTo(models.PaymentMethodConfig, { 
      foreignKey: 'payment_method_id', 
      as: 'paymentMethod' 
    });
    Payment.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  }

  async updateState(
    state: PaymentState,
    description: string,
    gatewayResponse?: Record<string, any>,
    transaction?: Transaction
  ): Promise<void> {
    const updateData: Partial<PaymentAttributes> = {
      state,
      state_description: description,
      last_attempt_at: new Date(),
      attempts: this.attempts + 1
    };

    if (gatewayResponse) {
      updateData.gateway_response = JSON.stringify(gatewayResponse);
    }

    await this.update(updateData, { transaction });
  }

  static async findByOrder(orderId: number): Promise<Payment[]> {
    return this.findAll({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']],
      include: ['paymentMethod']
    });
  }

  static async findLatestByOrder(orderId: number): Promise<Payment | null> {
    return this.findOne({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']],
      include: ['paymentMethod']
    });
  }

  static async getPaymentStats(orderId: number): Promise<{
    totalAttempts: number;
    lastAttempt: Date | null;
    successfulPayments: number;
    failedPayments: number;
  }> {
    const payments = await this.findAll({
      where: { order_id: orderId }
    });

    return {
      totalAttempts: payments.reduce((sum, payment) => sum + payment.attempts, 0),
      lastAttempt: payments.length > 0 ? payments[0].last_attempt_at : null,
      successfulPayments: payments.filter(p => p.state === 'APPROVED').length,
      failedPayments: payments.filter(p => ['FAILED', 'REJECTED'].includes(p.state)).length
    };
  }

  async getPaymentDetails(): Promise<{
    id: number;
    transaction_id: string;
    reference: string;
    amount: number;
    currency: string;
    state: PaymentState;
    gateway_info?: {
      provider: string;
      reference?: string;
      authorization?: string;
      transaction_date?: string;
    };
    payment_method?: {
      id: number;
      type: string;
      name: string;
    };
    metadata?: any;
  }> {
    await this.reload({
      include: [{
        model: PaymentMethodConfig,
        as: 'paymentMethod',
        attributes: ['id', 'type', 'name']
      }]
    });
  
    const gatewayResponse = this.gateway_response ? JSON.parse(this.gateway_response) : null;
    const metadata = this.metadata ? JSON.parse(this.metadata) : null;
  
    return {
      id: this.id,
      transaction_id: this.transaction_id,
      reference: this.reference,
      amount: Number(this.amount),
      currency: this.currency,
      state: this.state,
      gateway_info: {
        provider: this.gateway,
        reference: this.external_reference || undefined,
        authorization: gatewayResponse?.authorization,
        transaction_date: gatewayResponse?.operation_date
      },
      payment_method: this.paymentMethod ? {
        id: this.paymentMethod.id,
        type: this.paymentMethod.type,
        name: this.paymentMethod.name
      } : undefined,
      metadata
    };
  }
  
}