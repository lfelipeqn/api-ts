
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
import { BasePaymentGateway } from './BasePaymentGateway';

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

export class OpenPayPaymentGateway extends BasePaymentGateway {
  constructor(config: GatewayConfigData) {
    super(config);
    if (!config.apiKey || !config.apiSecret || !config.endpoint) {
      throw new Error('Missing required OpenPay gateway configuration');
    }
  }

  protected formatCardPaymentRequest(request: CreditCardPaymentRequest): any {
    return {
      method: 'card',
      source_id: request.tokenId,
      amount: request.amount,
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

  protected formatPSEPaymentRequest(request: PSEPaymentRequest): any {
    return {
      method: 'bank_account',
      amount: request.amount,
      currency: request.currency,
      description: request.description,
      order_id: request.metadata?.orderId,
      iva: "1900",
      redirect_url: request.redirectUrl,
      customer: {
        name: request.customer.name,
        last_name: request.customer.last_name,
        email: request.customer.email,
        phone_number: request.customer.phone_number,
        requires_account: request.customer.requires_account,
        customer_address: request.customer.address
      }
    };
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

  protected formatTransactionStatus(response: any): PaymentState {
    return this.mapStatus(response.status);
  }

  protected createRefundRequest(transactionId: string, amount?: number): any {
    return amount ? { amount } : {};
  }

  protected formatBanksResponse(response: OpenPayBankResponse[]): PSEBank[] {
    return response.map(bank => ({
      id: bank.id,
      name: bank.name,
      code: bank.bank_code,
      status: bank.status === 'active' ? 'active' : 'inactive'
    }));
  }

  protected async getRequestHeaders(): Promise<Headers> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    const authString = Buffer.from(`${this.config.apiSecret}:`).toString('base64');
    headers.append('Authorization', `Basic ${authString}`);
    
    return headers;
  }

  protected async handleErrorResponse(response: Response): Promise<Error> {
    const data = await response.json();
    if (this.isOpenPayError(data)) {
      return new Error(data.description || response.statusText);
    }
    return new Error(response.statusText);
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

  private mapOpenPayMethod(method: string): PaymentMethodType {
    const methodMap: Record<string, PaymentMethodType> = {
      'card': 'CREDIT_CARD',
      'bank_account': 'PSE',
      'store': 'CASH'
    };
    return methodMap[method] || 'CREDIT_CARD';
  }

  private async createCardToken(card: OpenPayCardData): Promise<any> {
    return this.makeRequest('/tokens', 'POST', card);
  }

}