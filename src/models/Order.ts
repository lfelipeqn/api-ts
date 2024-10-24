import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Client } from './Client';
import { Agency } from './Agency';
import { Address } from './Address';
import { User } from './User';
import { File } from './File';
import { PriceHistory } from './PriceHistory';
import { Payment } from './Payment';
import { ComplementaryAgency } from './ComplementaryAgency';
import { Promotion } from './Promotion';
import { ClientReward } from './ClientReward';
import { ClientRewardSetting } from './ClientRewardSetting';
import { PointConfiguration } from './PointConfiguration';
import { Product } from './Product';
import { Vehicle } from './Vehicle';

export class Order extends Model {
  public id!: number;
  public document_prefix!: string;
  public document_number!: string;
  public document_number_magister!: string | null;
  public state!: string;
  public order_validated!: boolean;
  public payment_state!: string;
  public payment_method!: string;
  public billing_status!: string;
  public freight_value!: number | null;
  public delivery_date!: Date | null;
  public dispatch_date!: Date | null;
  public service_order_number!: string | null;
  public guide_number!: string | null;
  public logistic_operator!: string | null;
  public payment_company!: string | null;
  public automatic_agency_assignment_attempt!: boolean;
  public cancel_at!: Date | null;
  public client_id!: number;
  public agency_id!: number | null;
  public address_id!: number | null;
  public dispatch_agency_id!: number | null;
  public user_id!: number | null;
  public service_order_file_id!: number | null;
  public invoice_file_id!: number | null;
  public guide_file_id!: number | null;
  public notification_user_id!: number | null;
  public money_status!: string | null;
  public discount!: number;
  public observation!: string | null;
  public shipping_confirmed!: boolean;
  public delivery_confirmed!: boolean;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly client?: Client;
  public readonly agency?: Agency;
  public readonly address?: Address;
  public readonly dispatchAgency?: Agency;
  public readonly user?: User;
  public readonly serviceOrderFile?: File;
  public readonly invoiceFile?: File;
  public readonly guideFile?: File;
  public readonly notificationUser?: User;
  public readonly priceHistories?: PriceHistory[];
  public readonly payments?: Payment[];

  public static associations: {
    client: Association<Order, Client>;
    agency: Association<Order, Agency>;
    address: Association<Order, Address>;
    dispatchAgency: Association<Order, Agency>;
    user: Association<Order, User>;
    serviceOrderFile: Association<Order, File>;
    invoiceFile: Association<Order, File>;
    guideFile: Association<Order, File>;
    notificationUser: Association<Order, User>;
    priceHistories: Association<Order, PriceHistory>;
    payments: Association<Order, Payment>;
  };

  static initModel(sequelize: Sequelize): typeof Order {
    Order.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      document_prefix: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      document_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      document_number_magister: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      order_validated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      payment_state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      billing_status: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      freight_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      delivery_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      dispatch_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      service_order_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      guide_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      logistic_operator: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      payment_company: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      automatic_agency_assignment_attempt: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cancel_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      address_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      dispatch_agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      service_order_file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      invoice_file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      guide_file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      notification_user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      money_status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      observation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      shipping_confirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      delivery_confirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    }, {
      sequelize,
      tableName: 'orders',
      timestamps: true,
      underscored: true,
    });

    return Order;
  }

  static associate(models: any) {
    Order.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    Order.belongsTo(models.Agency, { foreignKey: 'agency_id', as: 'agency' });
    Order.belongsTo(models.Address, { foreignKey: 'address_id', as: 'address' });
    Order.belongsTo(models.Agency, { foreignKey: 'dispatch_agency_id', as: 'dispatchAgency' });
    Order.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Order.belongsTo(models.File, { foreignKey: 'service_order_file_id', as: 'serviceOrderFile' });
    Order.belongsTo(models.File, { foreignKey: 'invoice_file_id', as: 'invoiceFile' });
    Order.belongsTo(models.File, { foreignKey: 'guide_file_id', as: 'guideFile' });
    Order.belongsTo(models.User, { foreignKey: 'notification_user_id', as: 'notificationUser' });
    Order.belongsToMany(models.PriceHistory, { 
      through: 'orders_price_histories',
      foreignKey: 'order_id',
      otherKey: 'price_history_id',
      as: 'priceHistories'
    });
    Order.hasMany(models.Payment, { foreignKey: 'order_id', as: 'payments' });
  }

  async getInfo(): Promise<Order> {
    const order = await Order.findByPk(this.id, {
      include: [
        'client', 'agency', 'address', 'dispatchAgency', 'user', 
        'serviceOrderFile', 'invoiceFile', 'guideFile', 'notificationUser', 
        'priceHistories', 'payments'
      ]
    });
    if (order) {
      order.setDataValue('last_payment', await order.lastPayment());
    }
    return order!;
  }

  async arrayFullData(): Promise<any> {
    const value = await this.value();
    if (this.user) {
      await this.user.$get('person');
    }

    const attachments = await this.$get('attachments');

    for (const attachment of attachments) {
      attachment.url = `${process.env.APP_URL}/api/order/${this.id}/attachment/${attachment.id}`;
    }

    // ... (rest of the method implementation)
  }

  async value(): Promise<number> {
    let total = 0;
    const priceHistories = await this.$get('priceHistories');
    const clientRewards = await this.$get('clientRewards');
    
    // ... (implementation of value calculation)

    return total - this.discount;
  }

  async assignElements(elements: any[], vehicle_id: number | null = null, is_free: boolean = false): Promise<void> {
    const promotions = await Promotion.findAll({ where: { is_active: true } });
    const vehicle = vehicle_id ? await Vehicle.findByPk(vehicle_id) : null;
    const mileageHistory = vehicle ? await vehicle.lastMileageHistory() : null;

    for (const data of elements) {
      const amount = data.amount;
      const element = await Product.findByPk(data.element_id);

      if (element) {
        const appliedPromotion = is_free ? null : await element.appliedPromotion(promotions);

        await this.$add('priceHistories', element.price_history_id, {
          through: {
            amount: amount,
            promotion_id: appliedPromotion ? appliedPromotion.id : null,
            mileage_history_id: mileageHistory ? mileageHistory.id : null,
            free: is_free ? 1 : 0
          }
        });

        if (this.agency_id) {
          const priceHistory = await this.$get('priceHistories', { 
            where: { id: element.price_history_id } 
          });
          await ComplementaryAgency.create({
            amount: amount,
            state: 'ED',
            order_price_history_id: priceHistory[0].OrderPriceHistory.id,
            agency_id: this.agency_id,
          });
        }
      }
    }
  }

  // ... (other methods implementation)

  async handleChargeFailed(transactionId: string, errorMessage: string): Promise<void> {
    await this.update({
      payment_state: 'F',
      state: 'R',
    });
    const lastPayment = await this.lastPayment();
    if (lastPayment) {
      await lastPayment.update({
        transaction_id: transactionId,
        state: 'E',
        state_description: 'La transacción no se pudo completar, para mayor información contacta a tu banco.',
      });
    }
  }

  async handleChargeCancelled(transactionId: string): Promise<void> {
    await this.update({
      payment_state: 'F',
      state: 'R',
    });
    const lastPayment = await this.lastPayment();
    if (lastPayment) {
      await lastPayment.update({
        transaction_id: transactionId,
        state: 'D',
        state_description: 'Transacción cancelada por el usuario',
      });
    }
  }

  async handleChargeSucceeded(transactionId: string): Promise<void> {
    await this.update({
      payment_state: 'R',
      state: 'DP',
    });
    const lastPayment = await this.lastPayment();
    if (lastPayment) {
      await lastPayment.update({
        transaction_id: transactionId,
        state: 'A',
        state_description: 'Pago procesado con éxito',
      });
    }
  }
}