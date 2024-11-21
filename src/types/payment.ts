import { Optional } from 'sequelize';
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
  processCreditCardPayment(request: CreditCardPaymentRequest): Promise<PaymentResponse>;
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

export interface PaymentCustomer {
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  requires_account?: boolean;
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


export interface PaymentDetails {
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
}

export interface ProcessedPaymentResponse extends PaymentResponse {
  paymentDetails: PaymentDetails;
}

export type OpenPayPaymentRequest = OpenPayBaseRequest | OpenPayCustomerRequest;

// Update the OpenPay customer type to match
export type OpenPayCustomer = PaymentCustomer;


// Base Gateway Configuration
export interface BaseGatewayConfig {
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  webhookUrl?: string;
  testMode?: boolean;
}

// Base payment request interface
export interface BasePaymentRequest {
  amount: number;
  currency: string;
  description: string;
  metadata?: {
    orderId?: string;
    [key: string]: any;
  };
}

export interface BaseCustomer {
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  requires_account?: boolean;
}

// Credit card payment request
export interface CreditCardPaymentRequest extends BasePaymentRequest {
  tokenId: string;
  deviceSessionId: string;
  customer: BaseCustomer;
}

// PSE payment request
export interface PSEPaymentRequest extends BasePaymentRequest {
  redirectUrl: string;
  customer: BaseCustomer & {
    address?: {
      department: string;
      city: string;
      additional: string;
    };
  };
}

// Payment response interface
export interface PaymentResponse {
  id: string;
  status: PaymentState;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  gatewayReference?: string;
  redirectUrl?: string;
  orderId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentAttributes {
  id: number;
  order_id: number;
  payment_method_id: number;
  transaction_id: string;
  reference: string;
  amount: number;
  currency: string;
  state: PaymentState;
  state_description: string;
  gateway: PaymentGateway;
  gateway_response: string | null;
  error_message: string | null;
  url: string | null;
  attempts: number;
  last_attempt_at: Date | null;
  external_reference: string | null;
  metadata: string | null;
  user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

// Payment Creation Attributes
export type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  'id' | 'created_at' | 'updated_at' | 'gateway_response' | 'error_message' | 'url' | 'external_reference' | 'metadata'
>;