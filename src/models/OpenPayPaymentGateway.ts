
import { 
  PSEPaymentRequest, 
  OpenPayBaseRequest, 
  OpenPayCustomerRequest,
  OpenPayPaymentRequest,
  PaymentGatewayInterface,
  GatewayConfigData,
  PaymentResponse,
  PSEBank,
  PaymentState,
  PaymentMethodType,
  CreditCardPaymentRequest
} from '../types/payment';

interface OpenPayCardData {
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  cvv2: string;
}

interface OpenPayCustomer {
  name: string;
  last_name?: string;
  email: string;
  phone_number?: string;
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

export class OpenPayPaymentGateway implements PaymentGatewayInterface {
  private readonly merchantId: string;
  private readonly privateKey: string;
  private readonly baseUrl: string;
  private readonly webhookUrl: string;
  private readonly testMode: boolean;

  constructor(config: GatewayConfigData) {
    if (!config.apiKey || !config.apiSecret || !config.endpoint) {
      throw new Error('Missing required OpenPay gateway configuration');
    }

    this.merchantId = config.apiKey; // merchant_id in OpenPay
    this.privateKey = config.apiSecret; // private_key in OpenPay
    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.webhookUrl = config.webhookUrl || '';
    this.testMode = config.testMode || false;
  }

  private isOpenPayError(data: unknown): data is OpenPayError {
    return typeof data === 'object' && data !== null && 'description' in data;
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

  public async processPSEPayment(request: PSEPaymentRequest): Promise<PaymentResponse> {
    try {
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Base payment request
      const baseRequest: OpenPayBaseRequest = {
        method: 'bank_account',
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        order_id: orderId,
        iva: '1900', // Colombian tax amount
        redirect_url: request.redirectUrl
      };
  
      let paymentRequest: OpenPayPaymentRequest;
      let endpoint: string;
  
      // If we have an existing customer_id, use it
      if ('customerId' in request.customer && request.customer.customerId) {
        endpoint = `/customers/${request.customer.customerId}/charges`;
        paymentRequest = baseRequest;
      } else {
        // For new customer, include customer information
        endpoint = '/charges';
        paymentRequest = {
          ...baseRequest,
          customer: {
            name: request.customer.name,
            last_name: request.customer.last_name,
            email: request.customer.email,
            phone_number: request.customer.phone_number,
            requires_account: request.customer.requires_account ?? false,
            customer_address: {
              department: request.customer.address?.department || '',
              city: request.customer.address?.city || '',
              additional: request.customer.address?.additional || ''
            }
          }
        } as OpenPayCustomerRequest;
      }
  
      console.log('Sending PSE payment request to OpenPay:', {
        ...paymentRequest,
        endpoint,
        customer: 'customer' in paymentRequest ? {
          ...paymentRequest.customer,
          phone_number: '***'
        } : undefined
      });
  
      const response = await this.makeRequest<OpenPayPSEResponse>(endpoint, 'POST', paymentRequest);
  
      if (!this.isOpenPayChargeResponse(response)) {
        throw new Error('Invalid response from OpenPay');
      }
  
      // Return payment response with orderId
      const paymentResponse: PaymentResponse = {
        id: response.id,
        status: this.mapStatus(response.status),
        amount: request.amount,
        currency: request.currency,
        paymentMethod: 'PSE',
        gatewayReference: response.authorization,
        orderId: orderId,
        redirectUrl: response.payment_method?.url,
        metadata: {
          ...response,
          ...request.metadata
        }
      };
  
      return paymentResponse;
    } catch (error) {
      console.error('OpenPay PSE payment error details:', error);
      throw error;
    }
  }
  

  public async processCreditCardPayment(request: CreditCardPaymentRequest): Promise<PaymentResponse> {
    try {
      const paymentRequest = {
        method: 'card',
        source_id: request.tokenId,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        device_session_id: request.deviceSessionId,
        customer: {
          name: request.customer.name,
          last_name: request.customer.last_name,
          email: request.customer.email,
          phone_number: request.customer.phone_number,
          requires_account: request.customer.requires_account
        },
        iva: "19", // Required for Colombian transactions
        use_3d_secure: false,
        redirect_url: "https://myecommerce.co/success" // Optional, for 3D secure flows
      };

      console.log('Sending payment request to OpenPay:', {
        ...paymentRequest,
        source_id: '***',
        device_session_id: '***'
      });

      const response = await this.makeRequest<OpenPayChargeResponse>('/charges', 'POST', paymentRequest);
      
      if (!this.isOpenPayChargeResponse(response)) {
        throw new Error('Invalid response from OpenPay');
      }

      return {
        id: response.id,
        status: this.mapStatus(response.status),
        amount: request.amount,
        currency: request.currency,
        paymentMethod: 'CREDIT_CARD',
        gatewayReference: response.authorization,
        metadata: {
          card: response.card ? {
            last4: response.card.card_number.slice(-4),
            brand: response.card.brand,
            type: response.card.type
          } : undefined,
          ...response
        }
      };
    } catch (error) {
      console.error('OpenPay credit card payment error details:', error);
      throw error;
    }
  }

private async makeRequest<T>(path: string, method: string, data?: any): Promise<T> {
    const url = `${this.baseUrl}/v1/${this.merchantId}${path}`;
    
    console.log('Making OpenPay request:', {
      url,
      method,
      data: data ? {
        ...data,
        source_id: data.source_id ? '***' : undefined,
        device_session_id: data.device_session_id ? '***' : undefined
      } : undefined
    });

    const response = await fetch(url, {
      method,
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });

    const responseData = await response.json();
    console.log('OpenPay response:', {
      status: response.status,
      statusText: response.statusText,
      data: responseData
    });

    if (!response.ok) {
      if (this.isOpenPayError(responseData)) {
        throw new Error(responseData.description || `OpenPay request failed: ${response.statusText}`);
      }
      throw new Error(`OpenPay request failed: ${response.statusText}`);
    }

    return responseData as T;
  }

  public async verifyTransaction(transactionId: string): Promise<PaymentResponse> {
    try {
      const response = await this.makeRequest<OpenPayChargeResponse>(`/charges/${transactionId}`, 'GET');

      if (!this.isOpenPayChargeResponse(response)) {
        throw new Error('Invalid response from OpenPay');
      }

      return {
        id: response.id,
        status: this.mapStatus(response.status),
        amount: response.amount,
        currency: response.currency,
        paymentMethod: this.mapOpenPayMethod(response.method),
        gatewayReference: response.authorization,
        metadata: response
      };
    } catch (error) {
      console.error('OpenPay transaction verification error:', error);
      throw error;
    }
  }

  public async refundTransaction(transactionId: string, amount?: number): Promise<PaymentResponse> {
    try {
      const data = amount ? { amount } : {};
      const response = await this.makeRequest<OpenPayChargeResponse>(
        `/charges/${transactionId}/refund`, 
        'POST', 
        data
      );

      if (!this.isOpenPayChargeResponse(response)) {
        throw new Error('Invalid response from OpenPay');
      }

      return {
        id: response.id,
        status: this.mapStatus(response.status),
        amount: response.amount,
        currency: response.currency,
        paymentMethod: this.mapOpenPayMethod(response.method),
        gatewayReference: response.authorization,
        metadata: response
      };
    } catch (error) {
      console.error('OpenPay refund error:', error);
      throw error;
    }
  }

  public async getBanks(): Promise<PSEBank[]> {
    try {
      const response = await this.makeRequest<OpenPayBankResponse[]>('/pse/banks', 'GET');

      if (!Array.isArray(response) || !response.every(this.isOpenPayBankResponse)) {
        throw new Error('Invalid response from OpenPay');
      }

      return response.map(bank => ({
        id: bank.id,
        name: bank.name,
        code: bank.bank_code,
        status: bank.status === 'active' ? 'active' : 'inactive'
      }));
    } catch (error) {
      console.error('OpenPay get banks error:', error);
      throw error;
    }
  }

  private mapOpenPayMethod(method: string): PaymentMethodType {
    const methodMap: Record<string, PaymentMethodType> = {
      'card': 'CREDIT_CARD',
      'bank_account': 'PSE',
      'store': 'CASH'
    };
    return methodMap[method] || 'CREDIT_CARD';
  }

  // ... (remaining methods stay the same)
  private getAuthHeaders(): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    const authString = Buffer.from(`${this.privateKey}:`).toString('base64');
    headers.append('Authorization', `Basic ${authString}`);
    
    return headers;
  }



  private async createCardToken(card: OpenPayCardData): Promise<any> {
    return this.makeRequest('/tokens', 'POST', card);
  }

  public getGatewayInfo(): Partial<GatewayConfigData> {
    return {
      provider: 'OPENPAY',
      endpoint: this.baseUrl,
      webhookUrl: this.webhookUrl,
      testMode: this.testMode
    };
  }

  public async testConnection(): Promise<any> {
    try {
      // Test with a minimal card token creation
      const testCard = {
        card_number: '4111111111111111',
        holder_name: 'Test User',
        expiration_year: '25',
        expiration_month: '12',
        cvv2: '123'
      };

      const tokenResponse = await this.createCardToken(testCard);

      return {
        status: 'success',
        connection: true,
        gateway: 'OPENPAY',
        data: {
          tokenCreated: true,
          merchantId: this.merchantId,
          testMode: this.testMode,
          token: tokenResponse.id
        }
      };
    } catch (error) {
      return {
        status: 'error',
        connection: false,
        gateway: 'OPENPAY',
        error: error instanceof Error ? error.message : 'Unknown error',
        testMode: this.testMode
      };
    }
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
}