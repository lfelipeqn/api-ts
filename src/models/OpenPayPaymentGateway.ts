import { BasePaymentGateway } from './BasePaymentGateway';
import { GatewayConfigData } from '../types/payment';

interface OpenPayCard {
  card_number: string;           // Changed from number
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

interface OpenPayCardResponse {
  type: string;
  brand: string;
  card_number: string;          // Changed from number
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  allows_charges: boolean;
  bank_name: string;
  bank_code: string;
}

interface OpenPayResponse {
  id: string;
  authorization: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  operation_type: string;
  transaction_type: string;
  method: string;
  error_message: string | null;
  order_id: string;
  payment_method: any;
  creation_date: string;
  card?: OpenPayCardResponse;
}


interface OpenPayAuthCredentials {
  merchantId: string;
  privateKey: string;
}

interface OpenPayTokenInstrument {
  card?: {
    number: string;
    expiration_month: string;
    expiration_year: string;
    cvv2: string;
    holder_name: string;
  }
}

interface OpenPayTokenRequest {
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  cvv2: string;
}

interface OpenPayTokenResponse {
  id: string;
  card: {
    card_number: string;
    holder_name: string;
    expiration_year: string;
    expiration_month: string;
    brand: string;
    bank_name: string;
    type: string;
  };
}

interface OpenPayPaymentRequest {
  method: string;
  source_id: string;  // Required for card payments
  amount: number;
  description: string;
  order_id?: string;
  iva: string;
  currency: string;
  redirect_url?: string;
  device_session_id?: string;
  customer: {
    name: string;
    last_name?: string;
    email: string;
    phone_number?: string;
  };
}

export class OpenPayPaymentGateway extends BasePaymentGateway {
  private readonly merchantId: string;
  private readonly privateKey: string;
  private readonly baseUrl: string;
  private readonly webhookUrl: string;
  private readonly testMode: boolean;

  constructor(config: GatewayConfigData) {
    super(config);

    if (!config.api_key || !config.api_secret || !config.endpoint) {
      throw new Error('Missing required OpenPay gateway configuration');
    }

    this.merchantId = config.api_key; // merchant_id in OpenPay
    this.privateKey = config.api_secret; // private_key in OpenPay
    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.webhookUrl = config.webhook_url || '';
    this.testMode = config.test_mode || false;
  }

  private getAuthHeaders(): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    const authString = Buffer.from(`${this.privateKey}:`).toString('base64');
    headers.append('Authorization', `Basic ${authString}`);
    
    return headers;
  }

  private async makeRequest<T>(path: string, method: string, data?: any): Promise<T> {
    const url = `${this.baseUrl}/v1/${this.merchantId}${path}`;
    const response = await fetch(url, {
      method,
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      const errorData:any = await response.json();
      throw new Error(errorData.description || `OpenPay request failed: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async processPayment(payment: any): Promise<any> {
    try {
      let source_id = payment.source_id;

      // If card details are provided but no source_id, create a token first
      if (!source_id && payment.card) {
        source_id = await this.createCardToken({
          card_number: payment.card.card_number,
          holder_name: payment.card.holder_name,
          expiration_year: payment.card.expiration_year,
          expiration_month: payment.card.expiration_month,
          cvv2: payment.card.cvv2
        });
      }

      const request: OpenPayPaymentRequest = {
        method: 'card',
        amount: payment.amount,
        description: payment.description,
        order_id: payment.order_id,
        currency: payment.currency || 'COP',
        iva: payment.iva || '0',
        customer: {
          name: payment.payer.name,
          last_name: payment.payer.surname,
          email: payment.payer.email,
          phone_number: payment.payer.mobile,
        },
        source_id   // Use the token
      };

      if (payment.device_session_id) {
        request.device_session_id = payment.device_session_id;
      }

      const response = await this.makeRequest<OpenPayResponse>('/charges', 'POST', request);

      return {
        id: response.id,
        status: this.mapStatus(response.status),
        amount: response.amount,
        currency: response.currency,
        description: response.description,
        authorization: response.authorization,
        order_id: response.order_id,
        payment_method: response.payment_method,
        transaction_id: response.id,
        error_message: response.error_message,
        created_at: response.creation_date
      };
    } catch (error) {
      console.error('OpenPay payment processing error:', error);
      throw error;
    }
  }

  private mapStatus(openPayStatus: string): string {
    const statusMap: Record<string, string> = {
      'completed': 'COMPLETED',
      'in_progress': 'IN_PROGRESS',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED'
    };
    return statusMap[openPayStatus] || 'FAILED';
  }

  public async verifyTransaction(transactionId: string): Promise<any> {
    return this.makeRequest(`/charges/${transactionId}`, 'GET');
  }

  public async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    const data = amount ? { amount } : {};
    return this.makeRequest(`/charges/${transactionId}/refund`, 'POST', data);
  }

  private async createCardToken(card: OpenPayCard): Promise<string> {
    try {
      const tokenRequest = {
        card_number: card.card_number,
        holder_name: card.holder_name,
        expiration_year: card.expiration_year,
        expiration_month: card.expiration_month,
        cvv2: card.cvv2
      };

      const response = await this.makeRequest<{
        id: string;
        card: {
          card_number: string;
          holder_name: string;
          expiration_year: string;
          expiration_month: string;
          brand: string;
          bank_name: string;
        };
      }>('/tokens', 'POST', tokenRequest);

      return response.id;
    } catch (error) {
      console.error('Error creating card token:', error);
      throw new Error('Failed to create card token: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  public async testConnection(): Promise<any> {
    try {
      // Test card data
      const testCard = {
        card_number: '4111111111111111',
        holder_name: 'Test User',
        expiration_year: '25',
        expiration_month: '12',
        cvv2: '123'
      };

      // Step 1: Create a token for the test card
      console.log('Creating card token for test...');
      const tokenId = await this.createCardToken(testCard);
      console.log('Card token created:', tokenId);

      // Step 2: Create a test charge using the token
      const testCharge = {
        method: 'card',
        amount: 100,
        description: 'OpenPay Connection Test',
        currency: 'COP',
        iva: '19',
        device_session_id: 'test-session-id',
        customer: {
          name: 'Test User',
          email: 'test@test.com',
          phone_number: '5555555555'
        },
        source_id: tokenId  // Use the created token
      };

      console.log('Making test charge request...');
      const response = await this.makeRequest<OpenPayResponse>('/charges', 'POST', testCharge);
      
      return {
        status: 'success',
        connection: true,
        gateway: 'OPENPAY',
        response: {
          id: response.id,
          status: response.status,
          amount: response.amount,
          authorization: response.authorization,
          method: response.method,
          transaction_type: response.transaction_type,
          token: tokenId,
          card: {
            type: response.card?.type,
            brand: response.card?.brand,
            last_digits: response.card?.card_number?.slice(-4)
          }
        },
        merchant_id: this.merchantId,
        test_mode: this.testMode
      };
    } catch (error) {
      console.error('OpenPay connection test failed:', error);
      
      // Parse the error message if possible
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        if (error instanceof Error && error.message.includes('{')) {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.description || errorData.message || error.message;
        }
      } catch {
        // If JSON parsing fails, use the original error message
      }

      return {
        status: 'error',
        connection: false,
        gateway: 'OPENPAY',
        error: errorMessage,
        test_mode: this.testMode,
        timestamp: new Date().toISOString()
      };
    }
  }
}