// Payment Method Types
export const PAYMENT_METHOD_TYPES = ['PSE', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH'] as const;
export type PaymentMethodType = typeof PAYMENT_METHOD_TYPES[number];


// Payment Gateways
export const PAYMENT_GATEWAYS = ['GOU', 'OPENPAY'] as const;
export type PaymentGateway = typeof PAYMENT_GATEWAYS[number];

// Payment States
export const PAYMENT_STATES = ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED','FAILED'] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

// Gateway Method Configuration
export interface PaymentMethodSettings {
  enabled: boolean;
  minAmount?: number;
  maxAmount?: number;
  supportedCurrencies: string[];
}

// Payment Method Mapping Type (using type instead of interface)
export type PaymentMethodMapping = Record<PaymentMethodType, PaymentMethodSettings>;

// Gateway Method Configuration
export interface PaymentMethodConfig {
  gateway: PaymentGateway;
  enabled: boolean;
  minAmount?: number;
  maxAmount?: number;
  supportedCurrencies: string[];
}

// Gateway Configuration Interface 
export interface GatewayConfig {
  provider: PaymentGateway;
  enabled: boolean;
  testMode: boolean;
  credentials: {
    apiKey: string;
    apiSecret: string;
    merchantId?: string;
    publicKey?: string;
    privateKey?: string;
  };
  endpoint: string;
  webhookUrl?: string;
  supportedMethods: PaymentMethodMapping;
}

// Generic Payment Response Interface
export interface PaymentResponse {
  id: string;
  status: PaymentState;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  gatewayReference?: string;
  redirectUrl?: string;
  orderId?: string;  // Add this field
  metadata?: Record<string, any>;
}

// PSE Bank Interface
export interface PSEBank {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
}

// Payment Gateway Interface
export interface PaymentGatewayInterface {
  getGatewayInfo(): Partial<GatewayConfig>;
  processPSEPayment(request: PSEPaymentRequest): Promise<PaymentResponse>;
  verifyTransaction(transactionId: string): Promise<PaymentResponse>;
  refundTransaction(transactionId: string, amount?: number): Promise<PaymentResponse>;
  getBanks(): Promise<PSEBank[]>;
  testConnection(): Promise<any>;
}

// Payer Information Interface
export interface Payer {
  documentType: string;
  documentNumber: string;
  name: string;
  surname: string;
  email: string;
  mobile?: string;
}

// Base Gateway Configuration Data
export interface GatewayConfigData {
  provider: PaymentGateway;
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  webhookUrl?: string;
  testMode?: boolean;
  [key: string]: any;
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

// Payment Method Database Model Interface
export interface PaymentMethodModel {
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

export interface OpenPayCustomer {
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  requires_account?: boolean;
}

export interface CustomerAddress {
  department: string;
  city: string;
  additional: string;
}

export interface PSECustomer {
  customerId?: string;  // For existing customers
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  requires_account?: boolean;
  address?: CustomerAddress;
}

export interface PSEPaymentRequest {
  amount: number;
  currency: string;
  description: string;
  redirectUrl: string;
  customer: PSECustomer;
  metadata?: Record<string, any>;
}

// Add OpenPay specific interfaces
export interface OpenPayBaseRequest {
  method: string;
  amount: number;
  currency: string;
  description: string;
  order_id: string;
  iva: string;
  redirect_url: string;
}

export interface OpenPayCustomerRequest extends OpenPayBaseRequest {
  customer: {
    name: string;
    last_name: string;
    email: string;
    phone_number: string;
    requires_account: boolean;
    customer_address: {
      department: string;
      city: string;
      additional: string;
    };
  };
}

export type OpenPayPaymentRequest = OpenPayBaseRequest | OpenPayCustomerRequest;
