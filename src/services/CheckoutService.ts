// services/CheckoutService.ts

import { Op, Transaction, WhereOptions, Optional, FindOptions, ModelStatic, 
  InferAttributes,
  NonNullFindOptions} from 'sequelize';
import { Cart } from '../models/Cart';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { PaymentGatewayService } from './PaymentGatewayService';
import { GatewayConfig } from '../models/GatewayConfig';
import { CheckoutSession, OrderState, DeliveryType } from '../types/checkout';
import { Cache } from './Cache';
import { randomBytes } from 'crypto';
import { CartDetail } from '../models/CartDetail';
import { Product } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { OrderPriceHistory } from '../models/OrderPriceHistory';
import { OrderAttributes, OrderCreationAttributes } from '../types/order';
import { CartAttributes, CartSummary } from '../types/cart';
import { CartSessionManager } from './CartSessionManager';

import { 
  PaymentState,
  PaymentResponse,
  PSEPaymentRequest,
  CreditCardPaymentRequest,
  ProcessedPaymentResponse,
  PaymentMethodType,
  PaymentGateway,
  PaymentDetails
} from '../types/payment';


 interface BasePaymentRequestData {
  customer: {
    name: string;
    last_name: string;
    email: string;
    phone_number: string;
    requires_account?: boolean;
  };
}

interface CardPaymentRequestData extends BasePaymentRequestData {
  tokenId: string;
  deviceSessionId: string;
}

interface PSEPaymentRequestData extends BasePaymentRequestData {
  redirectUrl: string;
  customer: {
    name: string;
    last_name: string;
    email: string;
    phone_number: string;
    requires_account?: boolean;
    address?: {
      department: string;
      city: string;
      additional: string;
    };
  };
}

type PaymentRequestData = CardPaymentRequestData | PSEPaymentRequestData;

export interface PaymentMethodConfigAttributes {
  id: number;
  type: PaymentMethodType;
  name: string;
  description: string | null;
  enabled: boolean;
  min_amount: number | null;
  max_amount: number | null;
  payment_gateway: PaymentGateway;
  gateway_config_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentMethodConfigCreationAttributes
  extends Optional<PaymentMethodConfigAttributes, 'id' | 'created_at' | 'updated_at'> {}

export interface GatewayConfigAttributes {
  id: number;
  gateway: PaymentGateway;
  name: string;
  config: string;
  is_active: boolean;
  test_mode: boolean;
  created_at: Date;
  updated_at: Date;
}


export class CheckoutService {
  private static instance: CheckoutService;
  private readonly cache: Cache;
  private readonly SESSION_PREFIX = 'checkout_session:';
  private readonly SESSION_DURATION = 30 * 60; // 30 minutes
  private readonly gatewayService: PaymentGatewayService;

  private constructor() {
    this.cache = Cache.getInstance();
    this.gatewayService = PaymentGatewayService.getInstance();
  }
  public static getInstance(): CheckoutService {
    if (!CheckoutService.instance) {
      CheckoutService.instance = new CheckoutService();
    }
    return CheckoutService.instance;
  }

  private async generateSessionId(): Promise<string> {
    return new Promise((resolve, reject) => {
      randomBytes(16, (err, buf) => {
        if (err) reject(err);
        resolve(buf.toString('hex'));
      });
    });
  }

  public async createSession(cartId: number, userId: number): Promise<CheckoutSession> {
    const sessionId = await this.generateSessionId();
    const session: CheckoutSession = {
      id: sessionId,
      cart_id: cartId,
      user_id: userId,
      delivery_type: null,
      delivery_address_id: null,
      pickup_agency_id: null,
      payment_method_id: null,
      created_at: new Date(),
      expires_at: new Date(Date.now() + this.SESSION_DURATION * 1000)
    };

    await this.cache.set(
      `${this.SESSION_PREFIX}${sessionId}`,
      session,
      this.SESSION_DURATION
    );

    return session;
  }

  public async getSession(sessionId: string): Promise<CheckoutSession | null> {
    return this.cache.get<CheckoutSession>(`${this.SESSION_PREFIX}${sessionId}`);
  }

  public async updateSession(
    sessionId: string,
    data: Partial<CheckoutSession>
  ): Promise<CheckoutSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const updatedSession = {
      ...session,
      ...data
    };

    await this.cache.set(
      `${this.SESSION_PREFIX}${sessionId}`,
      updatedSession,
      this.SESSION_DURATION
    );

    return updatedSession;
  }

  public async validateDeliveryMethod(
    sessionId: string,
    type: DeliveryType,
    addressId?: number,
    agencyId?: number
  ): Promise<boolean> {
    if (type === 'SHIPPING' && !addressId) return false;
    if (type === 'PICKUP' && !agencyId) return false;

    if (addressId) {
      const address = await Address.findByPk(addressId);
      if (!address) return false;
    }

    if (agencyId) {
      const agency = await Agency.findByPk(agencyId);
      if (!agency) return false;
    }

    return true;
  }

  public async validatePaymentMethod(
    sessionId: string,
    paymentMethodId: number
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return { valid: false, error: 'Invalid checkout session' };
      }
  
      // Get cart to validate amounts
      const cart = await Cart.findByPk(session.cart_id);
      if (!cart) {
        return { valid: false, error: 'Cart not found' };
      }
  
      // Get payment method with gateway config
      const paymentMethod = await PaymentMethodConfig.findOne({
        where: { 
          id: paymentMethodId,
          enabled: true
        },
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          where: { is_active: true }
        }]
      });
  
      if (!paymentMethod) {
        return { valid: false, error: 'Payment method not found or inactive' };
      }
  
      if (!paymentMethod.gatewayConfig) {
        return { valid: false, error: 'Payment gateway configuration not found' };
      }
  
      // Validate cart amount against payment method limits
      const cartSummary = await cart.getSummary();
      
      if (paymentMethod.min_amount && cartSummary.total < paymentMethod.min_amount) {
        return { 
          valid: false, 
          error: `Order amount below minimum (${paymentMethod.min_amount})`
        };
      }
      
      if (paymentMethod.max_amount && cartSummary.total > paymentMethod.max_amount) {
        return { 
          valid: false, 
          error: `Order amount above maximum (${paymentMethod.max_amount})`
        };
      }
  
      return { valid: true };
        
    } catch (error) {
      console.error('Payment method validation error:', error);
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Payment method validation failed'
      };
    }
  }

  public async createOrder(sessionId: string): Promise<Order> {
    const session = await this.getSession(sessionId);
    if (!session || !session.user_id) {
      throw new Error('Invalid session or missing user ID');
    }
  
    const sequelize = await (await import('../config/database')).getSequelize();
    const transaction = await sequelize.transaction();
  
    try {
      const cart = await Cart.findOne({
        where: {
          id: session.cart_id,
          user_id: session.user_id,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }],
        transaction
      });
  
      if (!cart) {
        throw new Error('Cart not found');
      }
  
      const cartSummary = await cart.getSummary();
      const order = await Order.create({
        user_id: session.user_id,
        cart_id: session.cart_id,
        delivery_type: session.delivery_type!,
        delivery_address_id: session.delivery_address_id,
        pickup_agency_id: session.pickup_agency_id,
        state: 'PENDING',
        total_amount: Number(cartSummary.total),
        subtotal_amount: Number(cartSummary.subtotal),
        discount_amount: Number(cartSummary.totalDiscount),
        shipping_amount: 0,
        tax_amount: 0,
        currency: 'COP',
        payment_method_id: session.payment_method_id!,
      }, { transaction });
  
      // Create order history
      await OrderPriceHistory.create({
        order_id: order.id,
        product_id: cart.details![0].product_id,
        price_history_id: cart.details![0].price_history_id,
        promotion_id: cartSummary.items[0].applied_promotion?.id || null,
        quantity: cart.details![0].quantity,
        unit_price: Number(cartSummary.items[0].price),
        subtotal: Number(cartSummary.items[0].subtotal),
        discount_amount: Number(cartSummary.items[0].discount),
        final_amount: Number(cartSummary.items[0].final_price),
        is_free: false,
      }, { transaction });
  
      // Update cart status
      await cart.update({ status: 'ordered' }, { transaction });
  
      await transaction.commit();
  
      // Clean up sessions after successful commit
      const cartSessionManager = CartSessionManager.getInstance();
      await Promise.all([
        this.cache.del(`${this.SESSION_PREFIX}${sessionId}`),
        cartSessionManager.deleteSession(cart.session_id)
      ]);
  
      return order;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  
  private async validateCartStock(cart: Cart, transaction?: Transaction): Promise<{
    valid: boolean;
    invalidItems: Array<{
      product_id: number;
      requested: number;
      available: number;
    }>;
  }> {
    const invalidItems = [];
    
    for (const detail of cart.details || []) {
      const stockValidation = await detail.validateStock();
      if (!stockValidation.valid) {
        invalidItems.push(stockValidation.data);
      }
    }
  
    return {
      valid: invalidItems.length === 0,
      invalidItems
    };
  }
  
  private async createOrderDetails(
    order: Order,
    cart: Cart,
    cartSummary: CartSummary,
    transaction: Transaction
  ): Promise<void> {
    for (const item of cartSummary.items) {
      await OrderPriceHistory.create({
        order_id: order.id,
        product_id: item.product_id,
        price_history_id: cart.details![0].price_history_id,
        promotion_id: item.applied_promotion?.id || null,
        quantity: item.quantity,
        unit_price: Number(item.price),
        subtotal: Number(item.subtotal),
        discount_amount: Number(item.discount),
        final_amount: Number(item.final_price),
        is_free: false,
        notes: item.applied_promotion ? 
          `Promotion applied: ${item.applied_promotion.type} - ${item.applied_promotion.discount}%` : 
          null
      }, { transaction });
    }
  }
  
  private formatNumber(value: number): number {
    return Number(parseFloat(value.toString()).toFixed(2));
  }
  
  private createOrderReference(orderId: number): string {
    return `ORDER-${orderId}-${Date.now()}`;
  }

  private createCardPaymentRequest(
    order: Order, 
    paymentData: CardPaymentRequestData, 
    orderReference: string
  ): CreditCardPaymentRequest {
    return {
      amount: Number(order.total_amount),
      currency: order.currency,
      description: `Order #${order.id} payment`,
      tokenId: paymentData.tokenId,
      deviceSessionId: paymentData.deviceSessionId,
      metadata: {
        orderId: orderReference,
        iva: "19" // Colombia specific
      },
      customer: {
        name: paymentData.customer.name,
        last_name: paymentData.customer.last_name,
        email: paymentData.customer.email,
        phone_number: paymentData.customer.phone_number,
        requires_account: paymentData.customer.requires_account || false
      }
    };
  }

  private createPSEPaymentRequest(
    order: Order, 
    paymentData: PSEPaymentRequestData,
    orderReference: string
  ): PSEPaymentRequest {
    return {
      amount: Number(order.total_amount),
      currency: order.currency,
      description: `Order #${order.id} payment`,
      redirectUrl: paymentData.redirectUrl,
      metadata: {
        orderId: orderReference,
        iva: "1900" // Colombian tax for PSE
      },
      customer: {
        name: paymentData.customer.name,
        last_name: paymentData.customer.last_name,
        email: paymentData.customer.email,
        phone_number: paymentData.customer.phone_number,
        requires_account: paymentData.customer.requires_account || false,
        address: paymentData.customer.address || {
          department: '',
          city: '',
          additional: ''
        }
      }
    };
  }

  async processPayment(orderId: number, paymentData: PaymentRequestData): Promise<ProcessedPaymentResponse> {
    const sequelize = Order.sequelize!;
    const t = await sequelize.transaction();
    let isTransactionCommitted = false;
    let paymentDetails = null;
  
    try {
      const order = await Order.findByPk(orderId, {
        include: [{
          model: PaymentMethodConfig,
          as: 'paymentMethod'
        }],
        transaction: t
      });
  
      if (!order) {
        await t.rollback();
        throw new Error('Order not found');
      }
  
      // Create payment record
      const payment = await Payment.create({
        order_id: orderId,
        payment_method_id: order.payment_method_id,
        transaction_id: `${Date.now()}`,
        reference: this.createOrderReference(order.id),
        amount: order.total_amount,
        currency: order.currency,
        state: 'PENDING',
        state_description: 'Payment initiated',
        gateway: order.paymentMethod!.payment_gateway,
        attempts: 1,
        last_attempt_at: new Date(),
        user_id: order.user_id
      }, { transaction: t });
  
      let response;
      try {
        const gateway = await this.gatewayService.getGatewayForMethod(order.paymentMethod!.type);
        const orderReference = this.createOrderReference(order.id);
  
        // Process payment
        response = await gateway.processCreditCardPayment(
          this.createCardPaymentRequest(order, paymentData as CardPaymentRequestData, orderReference)
        );
  
        // Update payment record with response
        await payment.update({
          transaction_id: response.id,
          reference: response.gatewayReference || response.id,
          state: response.status,
          state_description: `Payment ${response.status.toLowerCase()}`,
          gateway_response: JSON.stringify(response.metadata || {}),
          external_reference: response.gatewayReference,
          url: response.redirectUrl,
          metadata: JSON.stringify({
            payment_method: response.paymentMethod,
            ...response.metadata
          })
        }, { transaction: t });
  
        // Update order state based on payment status
        const orderState = this.mapPaymentStatusToOrderState(response.status);
        await order.update({
          state: orderState,
          last_payment_id: payment.id
        }, { transaction: t });
  
        // Get payment details within the transaction
        const paymentWithDetails = await Payment.findOne({
          where: { id: payment.id },
          include: [{
            model: PaymentMethodConfig,
            as: 'paymentMethod'
          }],
          transaction: t
        });
  
        if (!paymentWithDetails) {
          throw new Error('Payment not found after creation');
        }
  
        paymentDetails = this.formatPaymentDetails(paymentWithDetails, response);
  
        // Commit the transaction
        await t.commit();
        isTransactionCommitted = true;
  
        // Return the response with payment details
        return {
          ...response,
          paymentDetails
        } as ProcessedPaymentResponse;
  
      } catch (error) {
        // Payment processing failed - update records and commit
        await payment.update({
          state: 'FAILED',
          state_description: error instanceof Error ? error.message : 'Payment processing failed',
          last_attempt_at: new Date(),
          attempts: payment.attempts + 1
        }, { transaction: t });
  
        await order.update({
          state: 'PAYMENT_FAILED',
          last_payment_id: payment.id
        }, { transaction: t });
  
        // Commit the failure state
        await t.commit();
        isTransactionCommitted = true;
  
        throw error;
      }
  
    } catch (error) {
      // Only rollback if we haven't committed
      if (!isTransactionCommitted) {
        try {
          await t.rollback();
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }

  private formatPaymentDetails(payment: Payment, response: any): PaymentDetails {
    return {
      id: payment.id,
      transaction_id: payment.transaction_id,
      reference: payment.reference,
      amount: Number(payment.amount),
      currency: payment.currency,
      state: payment.state as PaymentState,
      gateway_info: payment.gateway ? {
        provider: payment.gateway,
        reference: payment.external_reference || undefined,  // Convert null to undefined
        authorization: response.metadata?.authorization || undefined,
        transaction_date: response.metadata?.operation_date || undefined
      } : undefined,
      payment_method: payment.paymentMethod ? {
        id: payment.paymentMethod.id,
        type: payment.paymentMethod.type,
        name: payment.paymentMethod.name
      } : undefined,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : undefined
    };
  }
  

  private async handlePaymentResponse(
    order: Order,
    payment: Payment,
    response: PaymentResponse
  ): Promise<void> {
    const t = await (await import('../config/database')).getSequelize().transaction();
  
    try {
      // Update payment with gateway response data
      await payment.update({
        transaction_id: response.id,
        reference: response.gatewayReference || response.id,
        state: response.status,
        state_description: this.getPaymentStateDescription(response.status),
        gateway_response: JSON.stringify(response.metadata || {}),
        external_reference: response.gatewayReference,
        url: response.redirectUrl, // For PSE payments
        metadata: JSON.stringify({
          payment_method: response.paymentMethod,
          card_info: response.metadata?.card,
          customer_info: response.metadata?.customer,
          gateway_info: {
            transaction_date: response.metadata?.operation_date,
            authorization: response.metadata?.authorization,
            gateway_reference: response.gatewayReference
          }
        }),
        last_attempt_at: new Date()
      }, { transaction: t });
  
      // Update order state based on payment status
      await order.update({
        state: this.mapPaymentStatusToOrderState(response.status),
        last_payment_id: payment.id
      }, { transaction: t });
  
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  private getPaymentStateDescription(status: PaymentState): string {
    const descriptions: Record<PaymentState, string> = {
      'PENDING': 'Payment is being processed',
      'PROCESSING': 'Payment is being processed',
      'APPROVED': 'Payment was successful',
      'REJECTED': 'Payment was rejected',
      'FAILED': 'Payment failed',
      'CANCELLED': 'Payment was cancelled',
      'REFUNDED': 'Payment was refunded'
    };
  
    return descriptions[status] || 'Unknown payment state';
  }

  private mapPaymentStatusToOrderState(paymentStatus: PaymentState): OrderState {
    const statusMap: Record<PaymentState, OrderState> = {
      'APPROVED': 'PAYMENT_COMPLETED',
      'PENDING': 'PAYMENT_PENDING',
      'PROCESSING': 'PAYMENT_PROCESSING',
      'REJECTED': 'PAYMENT_FAILED',
      'FAILED': 'PAYMENT_FAILED',
      'CANCELLED': 'CANCELLED',
      'REFUNDED': 'REFUNDED'
    };
  
    return statusMap[paymentStatus] || 'PAYMENT_FAILED';
  }

  async processOrderPayment(
    orderId: number,
    paymentResponse: PaymentResponse
  ): Promise<Payment> {
    const t = await (await import('../config/database')).getSequelize().transaction();
  
    try {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) {
        throw new Error('Order not found');
      }
  
      // Create payment record with user_id
      const payment = await Payment.create({
        order_id: orderId,
        payment_method_id: order.payment_method_id,
        transaction_id: paymentResponse.id,
        reference: paymentResponse.gatewayReference || paymentResponse.id,
        amount: paymentResponse.amount,
        currency: paymentResponse.currency,
        state: paymentResponse.status,
        state_description: `Payment ${paymentResponse.status.toLowerCase()}`,
        gateway_response: JSON.stringify(paymentResponse.metadata),
        gateway: 'OPENPAY', // Or get from payment method config
        attempts: 1,
        last_attempt_at: new Date(),
        external_reference: paymentResponse.gatewayReference,
        metadata: JSON.stringify({
          card_info: paymentResponse.metadata?.card,
          customer_info: paymentResponse.metadata?.customer
        }),
        user_id: order.user_id, // Add the user_id from order
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });
  
      // Update order status based on payment status
      const orderState = this.mapPaymentStatusToOrderState(paymentResponse.status);
      await order.update({
        state: orderState,
        last_payment_id: payment.id
      }, { transaction: t });
  
      await t.commit();
      return payment;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  private async handlePaymentFailure(order: Order, error: any): Promise<void> {
    const t = await (await import('../config/database')).getSequelize().transaction();
  
    try {
      // Create failed payment record with user_id
      await Payment.create({
        order_id: order.id,
        payment_method_id: order.payment_method_id,
        transaction_id: `FAILED_${Date.now()}`,
        reference: `FAILED_${order.id}`,
        amount: order.total_amount,
        currency: order.currency,
        state: 'FAILED',
        state_description: error instanceof Error ? error.message : 'Payment processing failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        gateway: 'OPENPAY', // Or get from payment method config
        attempts: 1,
        last_attempt_at: new Date(),
        user_id: order.user_id, // Add the user_id from order
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });
  
      // Update order status
      await order.update({
        state: 'PAYMENT_FAILED'
      }, { transaction: t });
  
      await t.commit();
    } catch (err) {
      await t.rollback();
      console.error('Error handling payment failure:', err);
    }
  }

  private async validatePaymentGateway(
    methodType: PaymentMethodType,
    gatewayConfig?: GatewayConfig
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Get gateway for method type
      const gateway = await this.gatewayService.getGatewayForMethod(methodType);
      if (!gateway) {
        return { 
          valid: false, 
          error: `No payment gateway configured for ${methodType}` 
        };
      }
  
      // If we have a specific gateway config, validate it
      if (gatewayConfig) {
        const configInfo = gateway.getGatewayInfo();
        if (configInfo.provider !== gatewayConfig.gateway) {
          return { 
            valid: false, 
            error: 'Gateway configuration mismatch' 
          };
        }
      }
  
      // Test gateway connection
      const testResult = await gateway.testConnection();
      if (!testResult.connection) {
        return { 
          valid: false, 
          error: testResult.error || 'Gateway connection test failed'
        };
      }
  
      return { valid: true };
    } catch (error) {
      console.error('Payment gateway validation error:', error);
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Gateway validation failed'
      };
    }
  }
}