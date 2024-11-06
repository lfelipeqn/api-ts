export const PAYMENT_METHOD_TYPES = ['PSE', 'CREDIT_CARD', 'CREDIT', 'TRANSFER', 'CASH'] as const;
export type PaymentMethodType = typeof PAYMENT_METHOD_TYPES[number];

// Updated Payment Gateway Types
export const PAYMENT_GATEWAYS = ['OPENPAY', 'GOU'] as const;
export type PaymentGateway = typeof PAYMENT_GATEWAYS[number];

// Payment States
export const PAYMENT_STATES = ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

export interface PaymentGatewayInterface {
  getGatewayInfo(): Partial<GatewayConfigData>;
  processPayment(payment: any): Promise<any>;
  verifyTransaction(transactionId: string): Promise<any>;
  refundTransaction(transactionId: string, amount?: number): Promise<any>;
  testConnection(): Promise<any>;
}

export interface GatewayConfig {
  provider: PaymentGateway;
  api_key: string;
  api_secret: string;
  endpoint: string;
  webhook_url?: string;
  test_mode?: boolean;
}

export interface GatewayConfigData extends GatewayConfig {
  [key: string]: any;
}

export interface PaymentResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  authorization?: string;
  order_id: string;
  payment_method: any;
  transaction_id: string;
  error_message?: string | null;
  created_at: string;
}

export interface GouGatewayConfig extends GatewayConfigData {
  provider: 'GOU';
}

export interface OpenPayGatewayConfig extends GatewayConfigData {
  provider: 'OPENPAY';
}

export interface Payer {
  name: string;
  surname: string;
  email: string;
  documentType: string;
  document: string;
  mobile?: string;
}

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
