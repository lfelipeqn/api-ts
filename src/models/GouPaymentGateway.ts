import { 
  PaymentGatewayInterface,
  GatewayConfigData,
  PaymentResponse,
  PSEPaymentRequest,
  PSEBank,
  PaymentState,
  PaymentMethodType,
  CreditCardPaymentRequest
} from '../types/payment';
import { randomBytes, createHash } from 'crypto';

interface GouStatusResponse {
  status: string;
  reason: string;
  message: string;
  date: string;
}

interface GouAmount {
  currency: string;
  total: string;
  taxes?: Array<{
    kind: string;
    amount: number;
    base: number;
  }>;
  details?: Array<{
    kind: string;
    amount: number;
  }>;
}

interface GouProcessorFields {
  id: string;
  b24: string;
}

interface GouErrorResponse {
  status: {
    status: string;
    reason: string;
    message: string;
    date: string;
  };
  error?: string;
}

interface GouAuthResponse {
  status: GouStatusResponse;
  provider: string;
  cardType?: string;
  cardTypes?: string[];
  displayInterest: boolean;
  requireOtp: boolean;
  requireCvv2: boolean;
  threeDS?: 'optional' | 'required' | 'none';
  credits?: Array<{
    description: string;
    code: string;
    groupCode: string;
    type: string;
    installments: number[];
  }>;
}

// API Response interfaces
interface GouStatusResponse {
  status: string;
  reason: string;
  message: string;
  date: string;
}

interface GouAmount {
  currency: string;
  total: string;
  taxes?: Array<{
    kind: string;
    amount: number;
    base: number;
  }>;
  details?: Array<{
    kind: string;
    amount: number;
  }>;
}

interface GouProcessorFields {
  id: string;
  b24: string;
}

interface GouErrorData {
  status: {
    status: string;
    reason: string;
    message: string;
    date: string;
  };
  error?: string;
}

interface GouRefundAPIResponse extends GouAPIResponse {
  type: 'REFUND';
  additional: {
    merchantCode: string;
    terminalNumber: string;
    bin: string;
    expiration: string;
    amountRefunded?: number;
  };
}

interface GouPaymentResponse extends PaymentResponse {
  lastDigits?: string;
  franchise?: string; 
  franchiseName?: string;
  issuerName?: string | null | undefined; // Changed from string | null
  receipt?: string;
  authorization?: string;
  processorFields?: {
    id: string;
    b24: string;
  };
  additional?: {
    merchantCode?: string;
    terminalNumber?: string;
    bin?: string;
    expiration?: string;
    credit?: {
      code: number;
      type: string;
      groupCode: string;
      installments: number;
    };
    totalAmount?: number;
    interestAmount?: number;
    installmentAmount?: number;
    iceAmount?: number;
  };
}

interface GouAPIResponse {
  status: GouStatusResponse;
  date: string;
  transactionDate: string;
  internalReference: number;
  reference: string;
  paymentMethod: string;
  franchise: string;
  franchiseName: string;
  issuerName?: string | null | undefined;  // Keep as null in API response
  amount: GouAmount;
  authorization?: string;
  receipt?: string;
  type: string;
  refunded: boolean;
  lastDigits?: string;
  provider: string;
  processorFields?: GouProcessorFields;
  additional?: Record<string, any>;
}


export class GouPaymentGateway implements PaymentGatewayInterface {
  private readonly baseUrl: string;
  private readonly login: string;
  private readonly secretKey: string;
  private readonly webhookUrl: string;
  private readonly testMode: boolean;

  constructor(config: GatewayConfigData) {
    if (!config.api_key || !config.api_secret || !config.endpoint) {
      throw new Error('Missing required GOU gateway configuration');
    }

    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.login = config.api_key;
    this.secretKey = config.api_secret;
    this.webhookUrl = config.webhook_url || '';
    this.testMode = config.test_mode || false;
  }

  private mapPaymentMethod(gouPaymentMethod: string): PaymentMethodType {
    // Map GOU payment methods to standardized payment methods
    const paymentMethodMap: Record<string, PaymentMethodType> = {
      // PSE mappings
      'PSE': 'PSE',
      'BTN': 'PSE',
      'BTNBC': 'PSE',
      
      // Credit card mappings
      'CR_VS': 'CREDIT_CARD',
      'CR_MC': 'CREDIT_CARD',
      'CR_AM': 'CREDIT_CARD',
      'CR_DN': 'CREDIT_CARD',
      'CR_CR': 'CREDIT_CARD',
      
      // Debit card mappings
      'DB_VS': 'DEBIT_CARD',
      'DB_MC': 'DEBIT_CARD',
      'DB_AM': 'DEBIT_CARD',
      
      // Bank transfer mappings
      'BT': 'TRANSFER',
      'ACH': 'TRANSFER',
      
      // Cash/voucher mappings
      'CASH': 'CASH',
      'EFX': 'CASH',
      'BP': 'CASH'
    };

    const mappedMethod = paymentMethodMap[gouPaymentMethod];
    
    if (!mappedMethod) {
      console.warn(`Unknown GOU payment method: ${gouPaymentMethod}, defaulting to CREDIT_CARD`);
      return 'CREDIT_CARD';
    }

    return mappedMethod;
  }

  processPSEPayment(request: PSEPaymentRequest): Promise<PaymentResponse> {
    throw new Error('Method not implemented.');
  }
  getBanks(): Promise<PSEBank[]> {
    throw new Error('Method not implemented.');
  }

  private validateConfig(): void {
    if (!this.login || !this.secretKey || !this.baseUrl) {
      throw new Error('Invalid gateway configuration');
    }
  }

  public async generateAuth(): Promise<{
    login: string;
    tranKey: string;
    nonce: string;
    seed: string;
  }> {
    try {
      const nonce = await this.generateNonce();
      const seed = new Date().toISOString();
      const tranKey = this.generateTranKey(nonce.original, seed);

      const auth = {
        login: this.login,
        tranKey,
        nonce: nonce.base64,
        seed
      };

      return auth;
    } catch (error) {
      console.error('Error generating authentication:', error);
      throw new Error('Failed to generate authentication credentials');
    }
  }

  private async generateNonce(): Promise<{ original: Buffer; base64: string }> {
    return new Promise((resolve, reject) => {
      randomBytes(16, (err, buf) => {
        if (err) reject(err);
        else {
          resolve({
            original: buf,
            base64: buf.toString('base64')
          });
        }
      });
    });
  }

  private generateTranKey(nonce: Buffer, seed: string): string {
    const hash = createHash('sha256');
    const combined = Buffer.concat([
      nonce,
      Buffer.from(seed),
      Buffer.from(this.secretKey)
    ]);
    hash.update(combined);
    return hash.digest('base64');
  }

  public async processPayment(paymentData: any): Promise<GouPaymentResponse> {
    try {
      const auth = await this.generateAuth();
      
      const requestBody = {
        auth,
        locale: 'es_CO',
        payment: {
          reference: paymentData.reference,
          description: paymentData.description,
          amount: {
            currency: paymentData.currency,
            total: String(paymentData.amount)
          }
        },
        instrument: paymentData.instrument,
        payer: paymentData.payer,
        ipAddress: paymentData.ipAddress || '127.0.0.1',
        userAgent: paymentData.userAgent || 'PlaceToPay'
      };

      const response = await fetch(`${this.baseUrl}/gateway/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json() as GouErrorData;
        throw new Error(errorData.status?.message || `Payment failed: ${response.statusText}`);
      }

      const responseData = await response.json() as GouAPIResponse;

      return {
        id: responseData.internalReference.toString(),
        status: this.mapStatus(responseData.status.status),
        amount: parseFloat(responseData.amount.total),
        currency: responseData.amount.currency,
        paymentMethod: this.mapPaymentMethod(responseData.paymentMethod),
        gatewayReference: responseData.authorization,
        // GOU specific fields
        lastDigits: responseData.lastDigits,
        franchise: responseData.franchise,
        franchiseName: responseData.franchiseName,
        issuerName: responseData.issuerName,
        receipt: responseData.receipt,
        authorization: responseData.authorization,
        processorFields: responseData.processorFields,
        additional: responseData.additional,
        metadata: responseData
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
  }


  public async verifyTransaction(transactionId: string): Promise<GouPaymentResponse> {
    const auth = await this.generateAuth();
    
    const response = await fetch(`${this.baseUrl}/gateway/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth,
        internalReference: transactionId
      })
    });

    if (!response.ok) {
      const errorData = await response.json() as GouErrorData;
      throw new Error(errorData.status?.message || `Failed to verify transaction: ${response.statusText}`);
    }

    const data = await response.json() as GouAPIResponse;

    return {
      id: data.internalReference.toString(),
      status: this.mapStatus(data.status.status),
      amount: parseFloat(data.amount.total),
      currency: data.amount.currency,
      paymentMethod: this.mapPaymentMethod(data.paymentMethod),
      gatewayReference: data.authorization,
      lastDigits: data.lastDigits,
      franchise: data.franchise,
      franchiseName: data.franchiseName,
      issuerName: data.issuerName,
      receipt: data.receipt,
      authorization: data.authorization,
      processorFields: data.processorFields,
      additional: data.additional,
      metadata: data
    };
  }

  public async refundTransaction(transactionId: string, amount?: number): Promise<GouPaymentResponse> {
    const auth = await this.generateAuth();
    
    const requestBody = {
      auth,
      internalReference: transactionId,
      action: 'refund',
      ...(amount && {
        payment: {
          amount: {
            total: amount
          }
        }
      })
    };

    const response = await fetch(`${this.baseUrl}/gateway/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json() as GouErrorData;
      throw new Error(errorData.status?.message || `Refund failed: ${response.statusText}`);
    }

    const data = await response.json() as GouRefundAPIResponse;

    return {
      id: data.internalReference.toString(),
      status: this.mapStatus(data.status.status),
      amount: parseFloat(data.amount.total),
      currency: data.amount.currency,
      paymentMethod: this.mapPaymentMethod(data.paymentMethod),
      gatewayReference: data.authorization,
      lastDigits: data.lastDigits,
      franchise: data.franchise,
      franchiseName: data.franchiseName,
      issuerName: data.issuerName,
      receipt: data.receipt,
      authorization: data.authorization,
      processorFields: data.processorFields,
      additional: data.additional,
      metadata: data
    };
  }

  public getGatewayInfo(): Partial<GatewayConfigData> {
    return {
      provider: 'GOU',
      endpoint: this.baseUrl,
      webhook_url: this.webhookUrl,
      test_mode: this.testMode
    };
  }

  private mapStatus(gouStatus: string): PaymentState {
    const statusMap: Record<string, PaymentState> = {
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED', 
      'PENDING': 'PENDING',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED'
    };
    return statusMap[gouStatus] || 'FAILED';
  }

  public async testConnection(): Promise<any> {
    try {
      const auth = await this.generateAuth();
      
      const requestBody = {
        auth,
        locale: 'es_CO',
        payment: {
          reference: `TEST_${Date.now()}`,
          description: 'Test payment information',
          amount: {
            currency: 'USD',
            total: '1.00'
          }
        },
        instrument: {
          card: {
            number: '4110760000000008'
          }
        },
        ipAddress: '127.0.0.1',
        userAgent: 'PlaceToPay Test'
      };
  
      const response = await fetch(`${this.baseUrl}/gateway/information`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        const errorData = await response.json() as GouErrorResponse;
        throw new Error(errorData.status?.message || `Auth test failed: ${response.statusText}`);
      }
  
      const responseData = await response.json() as GouAuthResponse;
  
      return {
        status: 'success',
        auth,
        testResponse: responseData,
        debug: {
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timestampUTC: new Date().toUTCString(),
          baseUrl: this.baseUrl,
          login: this.login,
          hasSecretKey: Boolean(this.secretKey),
          config: {
            baseUrl: this.baseUrl,
            login: this.login,
            testMode: this.testMode
          }
        }
      };
    } catch (error) {
      console.error('Test connection error:', error);
      return {
        status: 'error', 
        connection: false,
        gateway: 'GOU',
        error: error instanceof Error ? error.message : 'Unknown error',
        test_mode: this.testMode
      };
    }
  }

  public async processCreditCardPayment(request: CreditCardPaymentRequest): Promise<PaymentResponse> {
    throw new Error('Credit card payments not supported by GOU gateway');
  }

}