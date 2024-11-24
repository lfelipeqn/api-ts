
import { 
  PSEPaymentRequest, 
  GatewayConfigData,
  PaymentResponse,
  PSEBank,
  PaymentState,
  PaymentMethodType,
  CreditCardPaymentRequest,
  TokenizeCardRequest,
  TokenizationCapableGateway
} from '../types/payment';

import { BasePaymentGateway } from './BasePaymentGateway';

interface OpenPayAddress {
  city: string;
  country_code: string;
  postal_code: string;
  line1: string;
  line2?: string;
  line3?: string;
  state: string;
}

interface OpenPayCardData {
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  cvv2: string;
}

interface OpenPayCustomerAddress {
  department: string;
  city: string;
  additional: string;
}

interface OpenPayCustomer {
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  requires_account: boolean;
  customer_address?: OpenPayCustomerAddress;
}

interface OpenPayPSERequest {
  method: 'bank_account';
  amount: number;
  currency: 'COP';
  description: string;
  order_id: string;
  iva: string;
  redirect_url: string;
  customer: OpenPayCustomer;
}

interface OpenPayError {
  category?: string;
  description?: string;
  http_code?: number;
  error_code?: number;
  error_message?: string;
  request_id?: string;
  fraud_rules?: {
    name: string;
    input: string;
  }[];
}

interface OpenPayCardResponse {
  id: string;
  type: string;
  brand: string;
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  bank_name?: string;
  bank_code?: string;
}

interface OpenPayChargeResponse {
  id: string;
  authorization: string;
  operation_type: string;
  method: string;
  transaction_type: string;
  status: string;
  currency: string;
  amount: number;
  description: string;
  order_id?: string;
  payment_method?: {
    type: string;
    url?: string;
  };
  card?: OpenPayCardResponse;
  error_message?: string;
  created_at?: string;
}

interface OpenPayBankResponse {
  id: string;
  name: string;
  bank_code: string;
  status: string;
}

interface OpenPayError {
  category?: string;
  description?: string;
  http_code?: number;
  error_code?: number;
  request_id?: string;
}

interface OpenPayCardResponse {
  id: string;
  type: string;
  brand: string;
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  bank_name?: string;
  bank_code?: string;
}

interface OpenPayChargeResponse {
  id: string;
  authorization: string;
  operation_type: string;
  method: string;
  transaction_type: string;
  status: string;
  currency: string;
  amount: number;
  description: string;
  order_id?: string;
  payment_method?: {
    type: string;
    url?: string;
  };
  card?: OpenPayCardResponse;
  error_message?: string;
  created_at?: string;
}

interface OpenPayBankResponse {
  id: string;
  name: string;
  bank_code: string;
  status: string;
}

type OpenPayMethodType = 'card' | 'bank_account' | 'store';

interface OpenPayPSEResponse {
  id: string;
  status: string;
  authorization?: string;
  amount: number;
  currency: string;
  payment_method?: {
    type: string;
    url?: string;
    bank_name?: string;
    bank_code?: string;
    reference?: string;
  };
}

interface TokenResponse {
  id: string;
  card: {
    card_number: string;
    holder_name: string;
    expiration_year: string;
    expiration_month: string;
    bank_name?: string;
    bank_code?: string;
    type?: string;
    brand?: string;
  };
}

export class OpenPayPaymentGateway extends BasePaymentGateway implements TokenizationCapableGateway {
  private readonly merchantId: string;
  private readonly apiSecret: string;

  constructor(config: GatewayConfigData) {
    super(config);
    if (!config.apiKey || !config.apiSecret || !config.endpoint) {
      throw new Error('Missing required OpenPay gateway configuration');
    }
    this.merchantId = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  protected async getRequestHeaders(): Promise<Headers> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    const authString = Buffer.from(`${this.apiSecret}:`).toString('base64');
    headers.append('Authorization', `Basic ${authString}`);
    
    return headers;
  }

  protected async makeRequest(path: string, method: string, data?: any): Promise<any> {
    // Insert merchantId into the URL
    const url = `${this.config.endpoint}/v1/${this.merchantId}${path}`;
    const headers = await this.getRequestHeaders();

    // Log the formatted request data
    if (data && data.amount) {
      console.log('OpenPay request amount details:', {
        originalAmount: data.amount,
        currency: data.currency,
        formattedAmount: data.amount
      });
    }

    if (data && data.method === 'bank_account') {
      this.validatePSERequest(data);
    }

    console.log('Making OpenPay request:', {
      url,
      method,
      headers: Object.fromEntries(headers.entries()),
      data: data ? JSON.stringify(data) : undefined
    });

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      const error = await this.handleErrorResponse(response);
      // Add debugging info to error
      if (data && data.amount) {
        console.error('OpenPay amount error details:', {
          amount: data.amount,
          currency: data.currency,
          formattedAmount: Math.floor(data.amount)
        });
      }
      throw error;
    }

    return response.json();
  }

  protected formatTokenRequest(request: TokenizeCardRequest): any {
    return {
      card_number: request.card_number,
      holder_name: request.holder_name,
      expiration_year: request.expiration_year,
      expiration_month: request.expiration_month,
      cvv2: request.cvv2,
      address: {
        city: request.address.city,
        country_code: request.address.country_code,
        postal_code: request.address.postal_code,
        line1: request.address.line1,
        line2: request.address.line2,
        line3: request.address.line3,
        state: request.address.state
      }
    };
  }

  protected formatCardPaymentRequest(request: CreditCardPaymentRequest): any {
    // Format amount - remove decimals for COP currency
    const amount = request.currency === 'COP' ? 
      Math.floor(request.amount) : 
      request.amount;

    return {
      method: 'card',
      source_id: request.tokenId,
      amount,
      currency: request.currency,
      description: request.description,
      device_session_id: request.deviceSessionId,
      order_id: request.metadata?.orderId,
      iva: "19", // Colombia specific
      customer: {
        name: request.customer.name,
        last_name: request.customer.last_name,
        email: request.customer.email,
        phone_number: request.customer.phone_number,
        requires_account: request.customer.requires_account
      }
    };
  }

  protected formatPSEPaymentRequest(request: PSEPaymentRequest): OpenPayPSERequest {
    // Format amount - remove decimals for COP currency
    const amount = request.currency === 'COP' ? 
      Math.floor(request.amount) : 
      request.amount;
  
    // Create the customer object first
    const customer: OpenPayCustomer = {
      name: request.customer.name,
      last_name: request.customer.last_name,
      email: request.customer.email,
      phone_number: request.customer.phone_number,
      requires_account: false
    };
  
    // Add customer_address if present
    if (request.customer.address) {
      customer.customer_address = {
        department: request.customer.address.department,
        city: request.customer.address.city,
        additional: request.customer.address.additional
      };
    }
  
    // Create the formatted request
    const formattedRequest: OpenPayPSERequest = {
      method: 'bank_account',
      amount,
      currency: 'COP',
      description: request.description,
      order_id: request.metadata?.orderId || `order-${Date.now()}`,
      iva: '19',
      redirect_url: request.redirectUrl,
      customer
    };
  
    // Log the formatted request
    console.log('Formatted PSE request:', JSON.stringify(formattedRequest, null, 2));
  
    return formattedRequest;
  }

  protected formatPSEResponse(response: OpenPayPSEResponse): PaymentResponse {
    return {
      id: response.id,
      status: this.mapStatus(response.status),
      amount: response.amount,
      currency: response.currency,
      paymentMethod: 'PSE',
      gatewayReference: response.authorization,
      redirectUrl: response.payment_method?.url,
      metadata: {
        bank: response.payment_method,
        ...response
      }
    };
  }

  protected formatBanksResponse(response: OpenPayBankResponse[]): PSEBank[] {
    return response.map(bank => ({
      id: bank.id,
      name: bank.name,
      code: bank.bank_code,
      status: bank.status === 'active' ? 'active' : 'inactive'
    }));
  }

  protected formatTransactionStatus(response: any): PaymentState {
    return this.mapStatus(response.status);
  }

  protected formatCardResponse(response: any): PaymentResponse {
    return {
      id: response.id,
      status: this.mapStatus(response.status),
      amount: response.amount,
      currency: response.currency,
      paymentMethod: 'CREDIT_CARD',
      gatewayReference: response.authorization,
      redirectUrl: response.payment_method?.url,
      metadata: {
        card: response.card,
        customer: response.customer,
        operation_date: response.operation_date,
        authorization: response.authorization
      }
    };
  }

  protected formatTokenResponse(response: any): TokenResponse {
    return {
      id: response.id,
      card: {
        card_number: response.card.card_number,
        holder_name: response.card.holder_name,
        expiration_year: response.card.expiration_year,
        expiration_month: response.card.expiration_month,
        bank_name: response.card.bank_name,
        bank_code: response.card.bank_code,
        type: response.card.type,
        brand: response.card.brand
      }
    };
  }

  protected createRefundRequest(transactionId: string, amount?: number): any {
    return amount ? { amount } : {};
  }

  private mapStatus(openPayStatus: string): PaymentState {
    const statusMap: Record<string, PaymentState> = {
      completed: 'APPROVED',
      in_progress: 'PENDING',
      failed: 'REJECTED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED'
    };
    return statusMap[openPayStatus] || 'REJECTED';
  }

  private isOpenPayError(data: unknown): data is OpenPayError {
    const error = data as OpenPayError;
    return (
      typeof data === 'object' &&
      data !== null &&
      (
        'description' in error ||
        'error_message' in error ||
        'error_code' in error ||
        'category' in error
      )
    );
  }

  private isOpenPayBankResponse(data: unknown): data is OpenPayBankResponse {
    return typeof data === 'object' && data !== null && 'bank_code' in data;
  }

  private isOpenPayChargeResponse(response: any): response is OpenPayPSEResponse {
    return response 
      && typeof response.id === 'string'
      && typeof response.status === 'string'
      && typeof response.amount === 'number'
      && typeof response.currency === 'string';
  } 

  private mapOpenPayMethod(method: string): PaymentMethodType {
    const methodMap: Record<string, PaymentMethodType> = {
      'card': 'CREDIT_CARD',
      'bank_account': 'PSE',
      'store': 'CASH'
    };
    return methodMap[method] || 'CREDIT_CARD';
  }

  public async createCardToken(request: TokenizeCardRequest): Promise<TokenResponse> {
    try {
      const tokenRequest = this.formatTokenRequest(request);
      const response = await this.makeRequest(`/tokens`, 'POST', tokenRequest);
      return this.formatTokenResponse(response);
    } catch (error) {
      console.error('Error creating card token:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create card token');
    }
  }

  private validatePSERequest(request: OpenPayPSERequest): void {
    // Log request details for debugging
    console.log('Validating PSE request:', {
      requestFields: Object.keys(request),
      amount: request.amount,
      currency: request.currency,
      method: request.method,
      customerFields: request.customer ? Object.keys(request.customer) : null
    });
  
    // Validate method field specifically
    if (request.method !== 'bank_account') {
      throw new Error(`Invalid payment method. Expected 'bank_account', got '${request.method}'`);
    }
  
    // Validate required fields and their types
    const validations = [
      { field: 'amount', type: 'number' },
      { field: 'currency', value: 'COP' },
      { field: 'description', type: 'string' },
      { field: 'order_id', type: 'string' },
      { field: 'iva', type: 'string' },
      { field: 'redirect_url', type: 'string' }
    ];
  
    for (const validation of validations) {
      if (!request[validation.field as keyof OpenPayPSERequest]) {
        throw new Error(`Missing required field: ${validation.field}`);
      }
  
      if (validation.type && typeof request[validation.field as keyof OpenPayPSERequest] !== validation.type) {
        throw new Error(
          `Invalid type for field ${validation.field}. Expected ${validation.type}, got ${
            typeof request[validation.field as keyof OpenPayPSERequest]
          }`
        );
      }
  
      if (validation.value && request[validation.field as keyof OpenPayPSERequest] !== validation.value) {
        throw new Error(
          `Invalid value for field ${validation.field}. Expected ${validation.value}, got ${
            request[validation.field as keyof OpenPayPSERequest]
          }`
        );
      }
    }
  
    // Validate customer object and its required fields
    if (!request.customer || typeof request.customer !== 'object') {
      throw new Error('Missing or invalid customer object');
    }
  
    const requiredCustomerFields = {
      name: 'string',
      last_name: 'string',
      email: 'string',
      phone_number: 'string'
    };
  
    for (const [field, type] of Object.entries(requiredCustomerFields)) {
      if (!request.customer[field as keyof typeof requiredCustomerFields]) {
        throw new Error(`Missing required customer field: ${field}`);
      }
      if (typeof request.customer[field as keyof typeof requiredCustomerFields] !== type) {
        throw new Error(
          `Invalid type for customer field ${field}. Expected ${type}, got ${
            typeof request.customer[field as keyof typeof requiredCustomerFields]
          }`
        );
      }
    }
  
    // Validate customer_address if present
    if (request.customer.customer_address) {
      const requiredAddressFields: Array<keyof OpenPayCustomerAddress> = ['department', 'city', 'additional'];
      for (const field of requiredAddressFields) {
        if (!request.customer.customer_address[field]) {
          throw new Error(`Missing required customer_address field: ${field}`);
        }
        if (typeof request.customer.customer_address[field] !== 'string') {
          throw new Error(
            `Invalid type for customer_address field ${field}. Expected string, got ${
              typeof request.customer.customer_address[field]
            }`
          );
        }
      }
    }
  }

  protected async handleErrorResponse(response: Response): Promise<Error> {
    try {
      const data: unknown = await response.json();
      
      // Log raw error data for debugging
      console.error('OpenPay API Error:', {
        status: response.status,
        statusText: response.statusText,
        data
      });

      if (this.isOpenPayError(data)) {
        // Extract error message from OpenPay error structure
        const errorMessage = 
          data.description ||
          data.error_message ||
          `OpenPay error (${data.error_code}): ${data.category || 'Unknown error'}`;

        // Create detailed error message if fraud rules are present
        if (data.fraud_rules && data.fraud_rules.length > 0) {
          const fraudDetails = data.fraud_rules
            .map(rule => `${rule.name}: ${rule.input}`)
            .join(', ');
          return new Error(`${errorMessage} - Fraud Rules: [${fraudDetails}]`);
        }

        return new Error(errorMessage);
      }

      // Fallback error message if response isn't in expected format
      return new Error(`OpenPay request failed: ${response.statusText}`);
    } catch (parseError) {
      // Handle cases where response isn't valid JSON
      console.error('Error parsing OpenPay error response:', parseError);
      return new Error(`Failed to parse OpenPay error response: ${response.statusText}`);
    }
  }

}