export const PAYMENT_METHOD_TYPES = ['PSE', 'CREDIT_CARD', 'CREDIT', 'TRANSFER', 'CASH'] as const;
export type PaymentMethodType = typeof PAYMENT_METHOD_TYPES[number];

// Payment Gateway Types
export const PAYMENT_GATEWAYS = ['OPENPAY', 'GOU'] as const;
export type PaymentGateway = typeof PAYMENT_GATEWAYS[number];

// Payment States
export const PAYMENT_STATES = ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

// Payment Method Configuration Interface
export interface PaymentMethodConfig {
  id: number;
  type: PaymentMethodType;
  name: string;
  description?: string;
  enabled: boolean;
  min_amount?: number;
  max_amount?: number;
  payment_gateway: PaymentGateway;
  gateway_config_id: number;
  created_at: Date;
  updated_at: Date;
}

// Gateway Configuration Interface
export interface GatewayConfig {
  id: number;
  gateway: PaymentGateway;
  name: string;
  config: Record<string, any>;
  is_active: boolean;
  test_mode: boolean;
  created_at: Date;
  updated_at: Date;
}

// Payment Gateway Credentials Interface
export interface GatewayCredentials {
  api_key?: string;
  api_secret?: string;
  merchant_id?: string;
  public_key?: string;
  private_key?: string;
  webhook_key?: string;
  endpoint?: string;
  [key: string]: any;
}

// Payment Transaction Interface
export interface PaymentTransaction {
  id: number;
  order_id: number;
  payment_method_id: number;
  transaction_id: string;
  amount: number;
  currency: string;
  state: PaymentState;
  state_description: string;
  gateway_response?: Record<string, any>;
  error_message?: string;
  url?: string;
  created_at: Date;
  updated_at: Date;
}
