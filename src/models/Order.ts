// models/Order.ts

import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Association,
  Transaction
} from 'sequelize';
import { ORDER_STATES, OrderState, DeliveryType, DELIVERY_TYPES } from '../types/checkout';
import { Payment } from './Payment';
import { User } from './User';
import { Address } from './Address';
import { Agency } from './Agency';
import { PaymentMethodConfig } from './PaymentMethodConfig';
import { Cart } from './Cart';
import { OrderPriceHistory } from './OrderPriceHistory';
import { Product } from './Product';
import { Promotion } from './Promotion';
import { CartStatus } from '../types/cart';
import { PriceHistory } from './PriceHistory';
import { OrderAttributes, OrderCreationAttributes } from '../types/order';


export class Order extends Model<OrderAttributes, OrderCreationAttributes> {
  declare id: number;
  declare user_id: number;
  declare cart_id: number;
  declare delivery_type: DeliveryType;
  declare delivery_address_id: number | null;
  declare pickup_agency_id: number | null;
  declare state: OrderState;
  declare total_amount: number;
  declare subtotal_amount: number;
  declare shipping_amount: number;
  declare discount_amount: number;
  declare tax_amount: number;
  declare currency: string;
  declare notes: string | null;
  declare tracking_number: string | null;
  declare estimated_delivery_date: Date | null;
  declare payment_method_id: number;
  declare last_payment_id: number | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Associations
  declare readonly user?: User;
  declare readonly cart?: Cart;
  declare readonly deliveryAddress?: Address;
  declare readonly pickupAgency?: Agency;
  declare readonly paymentMethod?: PaymentMethodConfig;
  declare readonly payments?: Payment[];
  declare readonly lastPayment?: Payment;
  declare readonly orderPriceHistories?: OrderPriceHistory[];

  public static associations: {
    user: Association<Order, User>;
    cart: Association<Order, Cart>;
    deliveryAddress: Association<Order, Address>;
    pickupAgency: Association<Order, Agency>;
    paymentMethod: Association<Order, PaymentMethodConfig>;
    payments: Association<Order, Payment>;
    lastPayment: Association<Order, Payment>;
    orderPriceHistories: Association<Order, OrderPriceHistory>;
  };

  static initModel(sequelize: Sequelize): typeof Order {
    Order.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        cart_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        delivery_type: {
          type: DataTypes.ENUM(...DELIVERY_TYPES),
          allowNull: false,
        },
        delivery_address_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
        },
        pickup_agency_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: 'agencies',
            key: 'id'
          }
        },
        state: {
          type: DataTypes.ENUM(...ORDER_STATES),
          allowNull: false,
          defaultValue: 'PENDING',
        },
        total_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        subtotal_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        shipping_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        discount_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        tax_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        currency: {
          type: DataTypes.STRING(3),
          allowNull: false,
          defaultValue: 'COP',
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        tracking_number: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        estimated_delivery_date: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        payment_method_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        last_payment_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updated_at: {
          type: DataTypes.DATE, 
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      },
      {
        sequelize,
        tableName: 'orders',
        timestamps: true,
        underscored: true
      }
    );

    return Order;
  }

  static associate(models: {
    User: typeof User;
    Cart: typeof Cart;
    Address: typeof Address;
    Agency: typeof Agency;
    PaymentMethodConfig: typeof PaymentMethodConfig;
    Payment: typeof Payment;
    OrderPriceHistory: typeof OrderPriceHistory;
  }): void {
    Order.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    Order.belongsTo(models.Cart, {
      foreignKey: 'cart_id',
      as: 'cart'
    });
    Order.belongsTo(models.Address, {
      foreignKey: 'delivery_address_id',
      as: 'deliveryAddress'
    });
    Order.belongsTo(models.Agency, {
      foreignKey: 'pickup_agency_id',
      as: 'pickupAgency',
      constraints: false
    });
    Order.belongsTo(models.PaymentMethodConfig, {
      foreignKey: 'payment_method_id',
      as: 'paymentMethod'
    });
    Order.hasMany(models.Payment, {
      foreignKey: 'order_id',
      as: 'payments'
    });
    Order.belongsTo(models.Payment, {
      foreignKey: 'last_payment_id',
      as: 'lastPayment'
    });
    Order.hasMany(models.OrderPriceHistory, {
      foreignKey: 'order_id',
      as: 'orderPriceHistories'
    });
  }

  // Helper methods for payment handling
  async updatePaymentState(
    state: OrderState,
    paymentId: number | null = null,
    transaction?: Transaction
  ): Promise<void> {
    const updateData: Partial<OrderAttributes> = { state };
    
    if (paymentId) {
      updateData.last_payment_id = paymentId;
    }

    await this.update(updateData, { transaction });
  }

  async getPayments(options: { limit?: number; offset?: number } = {}): Promise<Payment[]> {
    return Payment.findAll({
      where: { order_id: this.id },
      limit: options.limit,
      offset: options.offset,
      order: [['created_at', 'DESC']],
      include: ['paymentMethod']
    });
  }

  async getLastPayment(): Promise<Payment | null> {
    if (this.last_payment_id) {
      return Payment.findByPk(this.last_payment_id, {
        include: ['paymentMethod']
      });
    }
    return Payment.findOne({
      where: { order_id: this.id },
      order: [['created_at', 'DESC']],
      include: ['paymentMethod']
    });
  }

  async getPaymentSummary(): Promise<{
    totalPaid: number;
    remainingAmount: number;
    lastPaymentDate: Date | null;
    paymentStatus: string;
    attempts: number;
  }> {
    const payments = await this.getPayments();
    const successfulPayments = payments.filter(p => p.state === 'APPROVED');
    
    const totalPaid = successfulPayments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

    return {
      totalPaid,
      remainingAmount: Number(this.total_amount) - totalPaid,
      lastPaymentDate: payments[0]?.created_at || null,
      paymentStatus: this.state,
      attempts: payments.length
    };
  }

  // Order fulfillment methods
  async markAsShipped(
    trackingNumber: string,
    estimatedDeliveryDate: Date,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({
      state: 'SHIPPING',
      tracking_number: trackingNumber,
      estimated_delivery_date: estimatedDeliveryDate
    }, { transaction });
  }

  async markAsDelivered(transaction?: Transaction): Promise<void> {
    await this.update({
      state: 'DELIVERED'
    }, { transaction });
  }

  async markAsReadyForPickup(transaction?: Transaction): Promise<void> {
    if (this.delivery_type !== 'PICKUP') {
      throw new Error('Order is not configured for pickup');
    }
    await this.update({
      state: 'READY_FOR_PICKUP'
    }, { transaction });
  }

  async cancel(reason: string, transaction?: Transaction): Promise<void> {
    // Only allow cancellation in certain states
    const cancelableStates: OrderState[] = ['PENDING', 'PAYMENT_PENDING'];
    if (!cancelableStates.includes(this.state)) {
      throw new Error(`Cannot cancel order in state: ${this.state}`);
    }

    await this.update({
      state: 'CANCELLED',
      notes: reason
    }, { transaction });
  }

  // Getters for calculated values
  getTotalWithoutTax(): number {
    return Number(this.subtotal_amount) + Number(this.shipping_amount) - Number(this.discount_amount);
  }

  getTotalWithTax(): number {
    return this.getTotalWithoutTax() + Number(this.tax_amount);
  }

  // Status checks
  isPaymentComplete(): boolean {
    return this.state === 'PAYMENT_COMPLETED';
  }

  isShippable(): boolean {
    return this.state === 'PAYMENT_COMPLETED' && this.delivery_type === 'SHIPPING';
  }

  isPickupReady(): boolean {
    return this.state === 'PAYMENT_COMPLETED' && this.delivery_type === 'PICKUP';
  }

  isCancellable(): boolean {
    const cancelableStates: OrderState[] = ['PENDING', 'PAYMENT_PENDING'];
    return cancelableStates.includes(this.state);
  }

  // Delivery information
  // Delivery information
  async getDeliveryInfo(): Promise<{
    type: DeliveryType;
    address?: Address | null;  // Updated to allow null
    agency?: Agency | null;    // Updated to allow null
    trackingNumber?: string;
    estimatedDeliveryDate?: Date;
  }> {
    let address: Address | null = null;
    let agency: Agency | null = null;

    if (this.delivery_type === 'SHIPPING' && this.delivery_address_id) {
      address = await Address.findByPk(this.delivery_address_id);
    } else if (this.delivery_type === 'PICKUP' && this.pickup_agency_id) {
      agency = await Agency.findByPk(this.pickup_agency_id);
    }

    return {
      type: this.delivery_type,
      address: address || undefined,
      agency: agency || undefined,
      trackingNumber: this.tracking_number || undefined,
      estimatedDeliveryDate: this.estimated_delivery_date || undefined
    };
  }

  // Alternative approach with explicit null handling
  async getDeliveryInfoStrict(): Promise<{
    type: DeliveryType;
    address?: Address;
    agency?: Agency;
    trackingNumber?: string;
    estimatedDeliveryDate?: Date;
  }> {
    let address: Address | undefined;
    let agency: Agency | undefined;

    if (this.delivery_type === 'SHIPPING' && this.delivery_address_id) {
      const foundAddress = await Address.findByPk(this.delivery_address_id);
      if (foundAddress) {
        address = foundAddress;
      }
    } else if (this.delivery_type === 'PICKUP' && this.pickup_agency_id) {
      const foundAgency = await Agency.findByPk(this.pickup_agency_id);
      if (foundAgency) {
        agency = foundAgency;
      }
    }

    return {
      type: this.delivery_type,
      ...(address && { address }),
      ...(agency && { agency }),
      ...(this.tracking_number && { trackingNumber: this.tracking_number }),
      ...(this.estimated_delivery_date && { estimatedDeliveryDate: this.estimated_delivery_date })
    };
  }

  // Convert order to JSON with additional info
  async toDetailedJSON(): Promise<Record<string, any>> {
    const [paymentSummary, deliveryInfo] = await Promise.all([
      this.getPaymentSummary(),
      this.getDeliveryInfo()
    ]);

    return {
      ...this.toJSON(),
      payment_summary: paymentSummary,
      delivery_info: deliveryInfo,
      total_without_tax: this.getTotalWithoutTax(),
      total_with_tax: this.getTotalWithTax(),
      is_cancellable: this.isCancellable(),
      is_shippable: this.isShippable(),
      is_pickup_ready: this.isPickupReady()
    };
  }

  public async createFromCart(cart: Cart, transaction?: Transaction): Promise<void> {
    const t = transaction || await this.sequelize!.transaction();
  
    try {
      const cartDetails = await cart.getDetails({
        include: [{
          model: Product,
          as: 'product'
        }, {
          model: PriceHistory,
          as: 'priceHistory'
        }]
      });
  
      // Get cart summary first
      const summary = await cart.getSummary();
      console.log('Cart Summary:', JSON.stringify(summary, null, 2));
  
      // Calculate order amounts
      const orderData = {
        subtotal_amount: Number(summary.subtotal),
        discount_amount: Number(summary.totalDiscount),
        shipping_amount: 0, // Add shipping calculation if needed
        tax_amount: 0,     // Add tax calculation if needed
        total_amount: Number(summary.total)
      };
  
      // Update order with calculated amounts
      await this.update(orderData, { transaction: t });
  
      // Create order price histories
      for (const detail of cartDetails) {
        const itemSummary = await detail.getItemSummary();
        console.log('Creating order price history for item:', JSON.stringify(itemSummary, null, 2));
  
        await OrderPriceHistory.create({
          order_id: this.id,
          product_id: detail.product_id,
          price_history_id: detail.price_history_id,
          promotion_id: itemSummary.applied_promotion?.id || null,
          quantity: detail.quantity,
          unit_price: Number(itemSummary.price),
          subtotal: Number(itemSummary.subtotal),
          discount_amount: Number(itemSummary.discount),
          final_amount: Number(itemSummary.final_price),
          is_free: false,
          notes: itemSummary.applied_promotion ? 
            `Promotion applied: ${itemSummary.applied_promotion.type} - ${itemSummary.applied_promotion.discount}%` : 
            null
        }, { transaction: t });
      }
  
      // Update cart status
      await cart.update({ 
        status: 'ordered' as CartStatus 
      }, { transaction: t });
  
      if (!transaction) {
        await t.commit();
      }
    } catch (error) {
      console.error('Error creating order from cart:', error);
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  private formatNumber(value: number | string): number {
    return Number(parseFloat(value.toString()).toFixed(2));
  }
  

public async getOrderSummary(): Promise<{
  items: Array<{
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
  }>;
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
  };
}> {
  const histories = await OrderPriceHistory.findAll({
    where: { order_id: this.id },
    include: [
      {
        model: Product,
        as: 'product'
      },
      {
        model: Promotion,
        as: 'promotion'
      }
    ]
  });

  const items = await Promise.all(
    histories.map(history => history.getDetailedInfo())
  );

  return {
    items,
    totals: {
      subtotal: Number(this.subtotal_amount),
      discount: Number(this.discount_amount),
      shipping: Number(this.shipping_amount),
      tax: Number(this.tax_amount),
      total: Number(this.total_amount)
    }
  };
}

public async getTotalSavings(): Promise<{
  amount: number;
  percentage: number;
}> {
  const histories = await OrderPriceHistory.findAll({
    where: { order_id: this.id }
  });

  const totalDiscount = histories.reduce(
    (sum, history) => sum + Number(history.discount_amount),
    0
  );

  const totalBeforeDiscount = histories.reduce(
    (sum, history) => sum + Number(history.subtotal),
    0
  );

  return {
    amount: totalDiscount,
    percentage: totalBeforeDiscount > 0 ? 
      (totalDiscount / totalBeforeDiscount) * 100 : 0
  };
}

}