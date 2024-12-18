// services/CheckoutService.ts

import { Transaction, Optional, Sequelize } from 'sequelize';
  import { getSequelize } from '../config/database';
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
import { OrderPriceHistory } from '../models/OrderPriceHistory';
import { CartSummary } from '../types/cart';
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

export interface CardPaymentRequestData extends BasePaymentRequestData {
  tokenId: string;
  deviceSessionId: string;
}

export interface PSEPaymentRequestData extends BasePaymentRequestData {
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
  private readonly sequelize: Sequelize;

  private constructor() {
    this.cache = Cache.getInstance();
    this.gatewayService = PaymentGatewayService.getInstance();
    this.sequelize = getSequelize();
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
    const invalidItems:any[] = [];
    
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
        iva: "19" // Colombian tax for PSE
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
    const t = await this.sequelize!.transaction();
    let isTransactionCommitted = false;
    let paymentDetails: PaymentDetails | null = null;
    let orderState: OrderState = 'PAYMENT_PENDING';
  
    try {
      const order = await this.getOrderWithPaymentConfig(orderId, t);
      const paymentMethod = order.paymentMethod!.type;
      const gateway = order.paymentMethod!.gatewayConfig!.gateway;
      const isPSE = paymentMethod === 'PSE';
  
      // Create initial payment record
      const payment = await Payment.create({
        order_id: orderId,
        payment_method_id: order.payment_method_id,
        transaction_id: `${Date.now()}`,
        reference: this.createOrderReference(order.id),
        amount: order.total_amount,
        currency: order.currency,
        state: 'PENDING',
        state_description: isPSE ? 'Awaiting bank redirect' : 'Payment initiated',
        gateway,
        attempts: 1,
        last_attempt_at: new Date(),
        user_id: order.user_id
      }, { transaction: t });
  
      let response;

      const gatewayService = await this.gatewayService.getGatewayForMethod(paymentMethod);
      const orderReference = this.createOrderReference(order.id);

      if (isPSE) {
        response = await gatewayService.processPSEPayment(
          this.createPSEPaymentRequest(order, paymentData as PSEPaymentRequestData, orderReference)
        );
  
        // For PSE, always use PAYMENT_PENDING
        orderState = 'PAYMENT_PENDING';
      } else if (paymentMethod === 'CREDIT_CARD') { 
        response = await gatewayService.processCreditCardPayment(
          this.createCardPaymentRequest(order, paymentData as CardPaymentRequestData, orderReference))
          orderState = this.mapPaymentStatusToOrderState(response.status, paymentMethod);
      } else {
        throw new Error(`Unsupported payment method: ${paymentMethod}`);
      }
      
      // Update payment record with response
      await payment.update({
        transaction_id: response.id,
        reference: response.gatewayReference || response.id,
        state: response.status,
        state_description: this.getPaymentStateDescription(response.status, paymentMethod),
        gateway_response: JSON.stringify(response.metadata || {}),
        external_reference: response.gatewayReference,
        url: response.redirectUrl,
        metadata: JSON.stringify({
          payment_method: response.paymentMethod,
          gateway_info: {
            provider: gateway,
            redirect_url: response.redirectUrl,
            reference: response.gatewayReference,
            created_at: new Date().toISOString()
          },
          ...response.metadata
        })
      }, { transaction: t });

      // Update order state
      await order.update({
        state: orderState,
        last_payment_id: payment.id
      }, { transaction: t });

      // Get updated payment details
      const updatedPayment = await Payment.findByPk(payment.id, {
        include: ['paymentMethod'],
        transaction: t
      });

      if (!updatedPayment) {
        throw new Error('Failed to retrieve updated payment record');
      }

      paymentDetails = this.formatPaymentDetails(updatedPayment, response);

      await t.commit();
      isTransactionCommitted = true;

      return {
        ...response,
        paymentDetails,
        orderId: order.id.toString(),
        orderState
      } as ProcessedPaymentResponse;
        
    } catch (error) {
      if (!isTransactionCommitted) {
        await t.rollback();
      }
      throw error;
    }
  }

  private formatPaymentDetails(payment: Payment, response: PaymentResponse): PaymentDetails {
    return {
      id: payment.id,
      transaction_id: payment.transaction_id,
      reference: payment.reference,
      amount: Number(payment.amount),
      currency: payment.currency,
      state: payment.state as PaymentState,
      gateway_info: payment.gateway ? {
        provider: payment.gateway,
        reference: payment.external_reference || undefined,
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
    const t = await this.sequelize.transaction();
    
    try {
      if (!order.paymentMethod) {
        throw new Error('Payment method not configured for order');
      }
  
      const paymentMethod = order.paymentMethod.type;
      const isPSE = paymentMethod === 'PSE';

      // Update payment with gateway response data
      await payment.update({
        transaction_id: response.id,
        reference: response.gatewayReference || response.id,
        state: response.status,
        state_description: this.getPaymentStateDescription(response.status, paymentMethod),
        gateway_response: JSON.stringify(response.metadata || {}),
        external_reference: response.gatewayReference,
        url: response.redirectUrl,
        metadata: JSON.stringify({
          payment_method: response.paymentMethod,
          gateway_info: {
            provider: payment.gateway,
            redirect_url: response.redirectUrl,
            reference: response.gatewayReference,
            created_at: new Date().toISOString()
          },
          ...response.metadata
        }),
        last_attempt_at: new Date()
      }, { transaction: t });

      // For PSE payments, always set order state to PAYMENT_PENDING when status is PENDING
      const orderState = isPSE && response.status === 'PENDING' 
        ? 'PAYMENT_PENDING'
        : this.mapPaymentStatusToOrderState(response.status, paymentMethod);
  
      await order.update({
        state: orderState,
        last_payment_id: payment.id
      }, { transaction: t });
  
      await t.commit();

      // Log the state transition
      this.logStateTransition(
        order.id,
        order.state,
        orderState,
        paymentMethod,
        response.status as PaymentState
      );

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }


  private getPaymentStateDescription(status: PaymentState, paymentMethod: PaymentMethodType): string {
    const descriptions: Record<PaymentMethodType, Record<PaymentState, string>> = {
      'PSE': {
        'PENDING': 'Awaiting bank payment completion',
        'PROCESSING': 'Processing bank payment',
        'APPROVED': 'Bank payment completed successfully',
        'REJECTED': 'Bank payment was rejected',
        'FAILED': 'Bank payment failed',
        'CANCELLED': 'Bank payment was cancelled',
        'REFUNDED': 'Bank payment was refunded'
      },
      'CREDIT_CARD': {
        'PENDING': 'Verifying card information',
        'PROCESSING': 'Processing card payment',
        'APPROVED': 'Card payment approved',
        'REJECTED': 'Card payment was rejected',
        'FAILED': 'Card payment failed',
        'CANCELLED': 'Card payment was cancelled',
        'REFUNDED': 'Card payment was refunded'
      },
      'DEBIT_CARD': {
        'PENDING': 'Verifying card information',
        'PROCESSING': 'Processing debit card payment',
        'APPROVED': 'Debit card payment approved',
        'REJECTED': 'Debit card payment was rejected',
        'FAILED': 'Debit card payment failed',
        'CANCELLED': 'Debit card payment was cancelled',
        'REFUNDED': 'Debit card payment was refunded'
      },
      'TRANSFER': {
        'PENDING': 'Awaiting transfer',
        'PROCESSING': 'Processing transfer',
        'APPROVED': 'Transfer completed',
        'REJECTED': 'Transfer rejected',
        'FAILED': 'Transfer failed',
        'CANCELLED': 'Transfer cancelled',
        'REFUNDED': 'Transfer refunded'
      },
      'CASH': {
        'PENDING': 'Awaiting cash payment',
        'PROCESSING': 'Processing cash payment',
        'APPROVED': 'Cash payment received',
        'REJECTED': 'Cash payment rejected',
        'FAILED': 'Cash payment failed',
        'CANCELLED': 'Cash payment cancelled',
        'REFUNDED': 'Cash payment refunded'
      }
    };
  
    // Get the descriptions for the payment method, fallback to credit card if not found
    const methodDescriptions = descriptions[paymentMethod] || descriptions['CREDIT_CARD'];
    
    // Get the specific status description, fallback to generic if not found
    return methodDescriptions[status] || `Payment ${status.toLowerCase()}`;
  }
  

  private mapPaymentStatusToOrderState(paymentStatus: PaymentState, paymentMethod: PaymentMethodType): OrderState {
    console.log('Mapping payment status:', { paymentStatus, paymentMethod });
  
    switch (paymentMethod) {
      case 'PSE':
        switch (paymentStatus) {
          case 'PENDING':
            return 'PAYMENT_PENDING';  // Waiting for bank redirect
          case 'PROCESSING':
            return 'PAYMENT_PROCESSING';  // In bank process
          case 'APPROVED':
            return 'PAYMENT_COMPLETED';
          case 'REJECTED':
            return 'PAYMENT_FAILED';
          case 'FAILED':
            return 'PAYMENT_FAILED';
          case 'CANCELLED':
            return 'CANCELLED';
          case 'REFUNDED':
            return 'REFUNDED';
          default:
            return 'PAYMENT_PENDING';
        }
  
      case 'CREDIT_CARD':
        switch (paymentStatus) {
          case 'PENDING':
            return 'PAYMENT_PENDING';  // Card verification
          case 'PROCESSING':
            return 'PAYMENT_PROCESSING';  // Processing with bank
          case 'APPROVED':
            return 'PAYMENT_COMPLETED';
          case 'REJECTED':
            return 'PAYMENT_FAILED';  // Card declined
          case 'FAILED':
            return 'PAYMENT_FAILED';  // Processing error
          case 'CANCELLED':
            return 'CANCELLED';  // User cancelled
          case 'REFUNDED':
            return 'REFUNDED';
          default:
            return 'PAYMENT_FAILED';  // Safer default for cards
        }
  
      default:
        // Default mapping for unknown payment methods
        const defaultStatusMap: Record<PaymentState, OrderState> = {
          'PENDING': 'PAYMENT_PENDING',
          'PROCESSING': 'PAYMENT_PROCESSING',
          'APPROVED': 'PAYMENT_COMPLETED',
          'REJECTED': 'PAYMENT_FAILED',
          'FAILED': 'PAYMENT_FAILED',
          'CANCELLED': 'CANCELLED',
          'REFUNDED': 'REFUNDED'
        };
        return defaultStatusMap[paymentStatus] || 'PAYMENT_FAILED';
    }
  }
  
  private getStatusReason(status: PaymentState, paymentMethod: PaymentMethodType): string {
    const statusReasons: Record<PaymentMethodType, Record<PaymentState, string>> = {
      'CREDIT_CARD': {
        'PENDING': 'Card validation in progress',
        'PROCESSING': 'Transaction being processed by the bank',
        'APPROVED': 'Transaction successfully completed',
        'REJECTED': 'Transaction rejected by issuing bank',
        'FAILED': 'Transaction processing error',
        'CANCELLED': 'Transaction cancelled by user or system',
        'REFUNDED': 'Transaction amount refunded'
      },
      'PSE': {
        'PENDING': 'Awaiting bank selection and confirmation',
        'PROCESSING': 'Bank transfer in progress',
        'APPROVED': 'Bank transfer confirmed',
        'REJECTED': 'Bank transfer rejected',
        'FAILED': 'Bank transfer failed',
        'CANCELLED': 'Bank transfer cancelled',
        'REFUNDED': 'Bank transfer refunded'
      },
      'DEBIT_CARD': {
        'PENDING': 'Awaiting bank selection and confirmation',
        'PROCESSING': 'Bank transfer in progress',
        'APPROVED': 'Bank transfer confirmed',
        'REJECTED': 'Bank transfer rejected',
        'FAILED': 'Bank transfer failed',
        'CANCELLED': 'Bank transfer cancelled',
        'REFUNDED': 'Bank transfer refunded'
      },
      'TRANSFER': {
        'PENDING': 'Awaiting bank selection and confirmation',
        'PROCESSING': 'Bank transfer in progress',
        'APPROVED': 'Bank transfer confirmed',
        'REJECTED': 'Bank transfer rejected',
        'FAILED': 'Bank transfer failed',
        'CANCELLED': 'Bank transfer cancelled',
        'REFUNDED': 'Bank transfer refunded'
      },
      'CASH': {
        'PENDING': 'Awaiting bank selection and confirmation',
        'PROCESSING': 'Bank transfer in progress',
        'APPROVED': 'Bank transfer confirmed',
        'REJECTED': 'Bank transfer rejected',
        'FAILED': 'Bank transfer failed',
        'CANCELLED': 'Bank transfer cancelled',
        'REFUNDED': 'Bank transfer refunded'
      }
    };
  
    const methodReasons = statusReasons[paymentMethod] || statusReasons['CREDIT_CARD'];
    return methodReasons[status] || 'Unknown status reason';
  }

  async processOrderPayment(
    orderId: number,
    paymentResponse: PaymentResponse
  ): Promise<Payment> {
    const t = await (await import('../config/database')).getSequelize().transaction();
  
    try {
      const order = await Order.findOne({
        where: { id: orderId },
        include: [{
          model: PaymentMethodConfig,
          as: 'paymentMethod',
          include: [{
            model: GatewayConfig,
            as: 'gatewayConfig',
            attributes: ['gateway']
          }]
        }],
        transaction: t
      });
      if (!order || !order.paymentMethod) {
        throw new Error('Order not found or payment method not configured');
      }
  
      
      const paymentMethod = order.paymentMethod!.type;
      
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
        gateway: order.paymentMethod!.payment_gateway,
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
      const orderState = this.mapPaymentStatusToOrderState(paymentResponse.status, paymentMethod);
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

  private async handlePaymentFailure(orderId: number, error: any): Promise<void> {
    const t = await (await import('../config/database')).getSequelize().transaction();
  
    try {
      // Get order with complete payment configuration
      const order = await this.getOrderWithPaymentConfig(orderId, t);
  
      const paymentMethod = order.paymentMethod!.type;
      const gateway = order.paymentMethod!.payment_gateway;
  
      // Create failed payment record
      const payment = await Payment.create({
        order_id: order.id,
        payment_method_id: order.payment_method_id,
        transaction_id: `FAILED_${Date.now()}`,
        reference: `FAILED_${order.id}`,
        amount: order.total_amount,
        currency: order.currency,
        state: 'FAILED',
        state_description: error instanceof Error ? error.message : 'Payment processing failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        gateway,
        attempts: 1,
        last_attempt_at: new Date(),
        user_id: order.user_id,
        metadata: JSON.stringify({
          error_details: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: error instanceof Error ? error.constructor.name : 'Unknown',
            timestamp: new Date().toISOString()
          },
          payment_method: paymentMethod,
          gateway_info: {
            gateway,
            environment: process.env.NODE_ENV
          }
        }),
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });
  
      // Update order status based on payment method
      const orderState = this.mapPaymentStatusToOrderState('FAILED', paymentMethod);
      await order.update({
        state: orderState,
        last_payment_id: payment.id
      }, { transaction: t });
  
      await t.commit();
  
      // Log failure for monitoring
      console.error('Payment failure processed:', {
        orderId: order.id,
        paymentId: payment.id,
        paymentMethod,
        gateway,
        error: error instanceof Error ? {
          message: error.message,
          type: error.constructor.name,
          stack: error.stack
        } : error
      });
  
    } catch (err) {
      await t.rollback();
      console.error('Error handling payment failure:', {
        originalError: error,
        handlingError: err,
        orderId
      });
      throw err;  // Re-throw to ensure the error is handled by the caller
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

  private async handleOrderStateTransition(
    order: Order,
    newState: OrderState,
    transaction?: Transaction
  ): Promise<void> {
    const validTransitions: Record<OrderState, OrderState[]> = {
      'PENDING': ['PAYMENT_PENDING', 'CANCELLED'],
      'PAYMENT_PENDING': ['PAYMENT_PROCESSING', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'CANCELLED'],
      'PAYMENT_PROCESSING': ['PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'CANCELLED'],
      'PAYMENT_COMPLETED': ['PROCESSING', 'REFUNDED', 'CANCELLED'],
      'PAYMENT_FAILED': ['PAYMENT_PENDING', 'CANCELLED'],
      'PROCESSING': ['READY_FOR_PICKUP', 'SHIPPING', 'CANCELLED'],
      'READY_FOR_PICKUP': ['DELIVERED', 'CANCELLED'],
      'SHIPPING': ['DELIVERED', 'CANCELLED'],
      'DELIVERED': ['REFUNDED'],
      'CANCELLED': [],
      'REFUNDED': []
    };
  
    // Validate state transition
    if (!validTransitions[order.state].includes(newState)) {
      throw new Error(
        `Invalid state transition from ${order.state} to ${newState}`
      );
    }
  
    // Update order state
    await order.update({ state: newState }, { transaction });
  
    // Handle additional actions based on new state
    /*switch (newState) {
      case 'PAYMENT_COMPLETED':
        // Additional actions after successful payment
        break;
      case 'CANCELLED':
        // Handle order cancellation
        break;
      case 'REFUNDED':
        // Handle refund processing
        break;
      // Add other state-specific actions as needed
    }*/
  }

  // Helper method to get order with payment method
  private async getOrderWithPaymentConfig(orderId: number, transaction?: Transaction): Promise<Order> {
    const order = await Order.findOne({
      where: { id: orderId },
      include: [{
        model: PaymentMethodConfig,
        as: 'paymentMethod',
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          attributes: ['gateway']
        }]
      }],
      transaction
    });
  
    if (!order?.paymentMethod?.gatewayConfig) {
      throw new Error('Order not found or payment configuration incomplete');
    }
  
    return order;
  }

  private logStateTransition(
    orderId: number, 
    currentState: OrderState,
    newState: OrderState,
    paymentMethod: PaymentMethodType,
    paymentStatus: PaymentState
  ): void {
    console.log('Payment state transition:', {
      orderId,
      paymentMethod,
      currentState,
      newState,
      paymentStatus,
      timestamp: new Date().toISOString(),
      reason: this.getStatusReason(paymentStatus, paymentMethod)
    });
  }
}