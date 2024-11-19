// services/CheckoutService.ts

import { Op,
  Transaction, WhereOptions } from 'sequelize';
import { Cart } from '../models/Cart';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { PaymentGatewayService } from './PaymentGatewayService';
import { CheckoutSession, OrderState, DeliveryType } from '../types/checkout';
import { Cache } from './Cache';
import { randomBytes } from 'crypto';
import { CartDetail } from '../models/CartDetail';
import { Product } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { OrderPriceHistory } from '../models/OrderPriceHistory';
import { OrderAttributes, OrderCreationAttributes } from '../types/order';
import { CartAttributes } from '../types/cart';
import { PaymentState,
  PaymentResponse,
  PSEPaymentRequest,
  CreditCardPaymentRequest,
  ProcessedPaymentResponse,
  PaymentMethodType,
  PaymentGateway,
  PaymentCustomer,
  PSECustomer
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


export class CheckoutService {
  private static instance: CheckoutService;
  private readonly cache: Cache;
  private readonly SESSION_PREFIX = 'checkout_session:';
  private readonly SESSION_DURATION = 30 * 60; // 30 minutes

  private constructor() {
    this.cache = Cache.getInstance();
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
    if (!userId) {
      throw new Error('User ID is required for checkout');
    }
  
    const sessionId = await this.generateSessionId();
    const session: CheckoutSession = {
      id: sessionId,
      cart_id: cartId,
      user_id: userId, // Always set user_id
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
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const cart = await Cart.findByPk(session.cart_id);
    if (!cart) return false;

    const paymentMethod = await PaymentMethodConfig.findByPk(paymentMethodId);
    if (!paymentMethod || !paymentMethod.enabled) return false;

    const cartSummary = await cart.getSummary();
    
    // Validate amount limits if configured
    if (paymentMethod.min_amount && cartSummary.total < paymentMethod.min_amount) {
      return false;
    }
    if (paymentMethod.max_amount && cartSummary.total > paymentMethod.max_amount) {
      return false;
    }

    return true;
  }

  public async createOrder(
    sessionId: string,
    transaction?: Transaction
  ): Promise<Order | null> {
    const session = await this.getSession(sessionId);
    if (!session || !session.user_id) {
      throw new Error('Invalid session or missing user ID');
    }
  
    const t = transaction || await (await import('../config/database')).getSequelize().transaction();
  
    try {
      // Find cart with details
      const cart = await Cart.findOne({
        where: {
          id: session.cart_id,
          user_id: session.user_id,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }]
      });
  
      if (!cart) {
        throw new Error('Cart not found');
      }
  
      const cartSummary = await cart.getSummary();
      const now = new Date();
  
      // Create order with properly typed data
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
        created_at: now,
        updated_at: now
      }, { transaction: t });
  
      // Create order details
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
          is_free: false
        }, { transaction: t });
      }
  
      // Update cart status
      await cart.update({ status: 'ordered' }, { transaction: t });
  
      // Clear checkout session
      await this.cache.del(`${this.SESSION_PREFIX}${sessionId}`);
  
      await t.commit();
      return order;
  
    } catch (error) {
      await t.rollback();
      console.error('Error creating order:', error);
      throw error;
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
      },
      metadata: {
        order_id: orderReference,
        iva: "1900" // Colombian tax for PSE
      }
    };
  }

  async processPayment(
    checkoutOrderId: number, 
    paymentData: PaymentRequestData
  ): Promise<ProcessedPaymentResponse> {
    try {
      const order = await Order.findByPk(checkoutOrderId, {
        include: [{
          model: PaymentMethodConfig,
          as: 'paymentMethod'
        }]
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (!order.paymentMethod?.type) {
        throw new Error('Payment method not configured for order');
      }

      const gatewayService = PaymentGatewayService.getInstance();
      const gateway = await gatewayService.getGatewayForMethod(order.paymentMethod.type);
      const orderReference = this.createOrderReference(order.id);

      // Create initial payment record
      const payment = await Payment.create({
        order_id: order.id,
        payment_method_id: order.payment_method_id,
        transaction_id: `${Date.now()}`,
        reference: orderReference,
        amount: order.total_amount,
        currency: order.currency,
        state: 'PENDING',
        state_description: 'Payment initiated',
        gateway: gateway.getGatewayInfo().provider as PaymentGateway,
        attempts: 1,
        last_attempt_at: new Date(),
        user_id: order.user_id
      });

      try {
        let response: PaymentResponse;

        if (order.paymentMethod.type === 'CREDIT_CARD' && 'tokenId' in paymentData) {
          const cardRequest = this.createCardPaymentRequest(
            order,
            paymentData,
            orderReference
          );
          response = await gateway.processCreditCardPayment(cardRequest);
        } 
        else if (order.paymentMethod.type === 'PSE' && 'redirectUrl' in paymentData) {
          const pseRequest = this.createPSEPaymentRequest(
            order,
            paymentData,
            orderReference
          );
          response = await gateway.processPSEPayment(pseRequest);
        } 
        else {
          throw new Error('Invalid payment method or request data');
        }

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
            card_info: response.metadata?.card,
            customer_info: response.metadata?.customer,
            gateway_info: {
              transaction_date: response.metadata?.operation_date,
              authorization: response.metadata?.authorization,
              gateway_reference: response.gatewayReference
            }
          })
        });

        // Update order status
        await order.updatePaymentState(
          this.mapPaymentStatusToOrderState(response.status),
          payment.id
        );

        const paymentDetails = await payment.getPaymentDetails();

        return {
          ...response,
          paymentDetails
        };

      } catch (error) {
        await payment.updateState(
          'FAILED',
          error instanceof Error ? error.message : 'Payment processing failed'
        );
        await order.updatePaymentState('PAYMENT_FAILED', payment.id);
        throw error;
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
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
  
      // Create payment record
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
      // Create failed payment record
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
}