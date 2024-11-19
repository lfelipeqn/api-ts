// types/checkout.ts
import { PaymentState, PaymentGateway } from "./payment";

export const ORDER_STATES = [
    'PENDING',             // Initial state when order is created
    'PAYMENT_PENDING',     // Waiting for payment
    'PAYMENT_PROCESSING',  // Payment is being processed
    'PAYMENT_FAILED',      // Payment attempt failed
    'PAYMENT_COMPLETED',   // Payment successful
    'PROCESSING',          // Order is being processed
    'READY_FOR_PICKUP',    // Order is ready for pickup at agency
    'SHIPPING',           // Order is being shipped
    'DELIVERED',          // Order has been delivered
    'CANCELLED',          // Order was cancelled
    'REFUNDED'            // Order was refunded
  ] as const;
  
  export type OrderState = typeof ORDER_STATES[number];
  
  export const DELIVERY_TYPES = ['SHIPPING', 'PICKUP'] as const;
  export type DeliveryType = typeof DELIVERY_TYPES[number];
  
  export interface CheckoutSession {
    id: string;
    cart_id: number;
    user_id: number | null;
    delivery_type: DeliveryType | null;
    delivery_address_id: number | null;
    pickup_agency_id: number | null;
    payment_method_id: number | null;
    created_at: Date;
    expires_at: Date;
  }
  
  // Update Payment Model
  interface PaymentTransactionAttributes {
    id: number;
    order_id: number;
    payment_method_id: number;
    transaction_id: string;
    amount: number;
    currency: string;
    state: PaymentState;
    state_description: string;
    gateway_response: string | null;
    error_message: string | null;
    url: string | null;
    reference: string;
    gateway: PaymentGateway;
    attempts: number;
    last_attempt_at: Date | null;
    external_reference: string | null;
    metadata: string | null;
    created_at: Date;
    updated_at: Date;
  }
  
  // Update Order Model
  interface OrderAttributes {
    id: number;
    user_id: number;
    cart_id: number;
    delivery_type: DeliveryType;
    delivery_address_id: number | null;
    pickup_agency_id: number | null;
    state: OrderState;
    total_amount: number;
    subtotal_amount: number;
    shipping_amount: number;
    discount_amount: number;
    tax_amount: number;
    currency: string;
    notes: string | null;
    tracking_number: string | null;
    estimated_delivery_date: Date | null;
    payment_method_id: number;
    last_payment_id: number | null;
    created_at: Date;
    updated_at: Date;
  }