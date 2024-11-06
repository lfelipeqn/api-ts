import { BasePaymentGateway } from './BasePaymentGateway';
import { GatewayConfigData, Payer} from '../types/payment';
import { randomBytes, createHash } from 'crypto';

interface GouAuthCredentials {
  login: string;
  tranKey: string;
  nonce: string;
  seed: string;
}

interface GouAuthRequest {
  auth: {
    login: string;
    tranKey: string;
    nonce: string;
    seed: string;
  };
}

interface GouTokenResponse {
  status: {
    status: string;
    reason: string;
    message: string;
    date: string;
  };
  token: string;
  subtoken?: string;
  franchise: string;
  franchiseName: string;
  lastDigits: string;
  validUntil: string;
}

interface GouInvalidateResponse {
  status: {
    status: string;
    reason: string;
    message: string;
    date: string;
  }
}

interface TokenInstrument {
  card?:{
    number: string;
    expiration: string;
    cvv: string;
    installments: string;
  }
  account?: {
    bankCode: string;
    bankName: string;
    accountType: string;
    accountNumber: string;
    franchise?: string | undefined;
    verificationCode?: string | undefined;
  }
}

// Helper Types
interface PaymentRequest {
  type: string;
  payment: {
    reference: string;
    description: string;
    amount: {
      currency: string;
      total: number;
    }
  };
  instrument: {
    card?: {
      number: string;
      expiration: string;
      cvv: string;
      installments: string;
    }
  };
  payer: Payer;
  ipAddress: string;
  userAgent: string;
}

interface PaymentResponse {
  status: PaymentState;
  statusCode: string;
  message: string;
  transactionId: string;
  authorizationCode?: string;
  receiptNumber?: string;
  lastDigits?: string;
  paymentMethod: string;
  processorFields: any;
  responseData: any;
}

interface TokenizeRequest {
  type: 'CREDIT_CARD' | 'PSE';
  payer: {
    name: string;
    surname: string;
    email: string;
  };
  ipAddress: string;
  userAgent: string;
  instrument: TokenInstrument;
}

interface TokenResponse {
  token: string;
  subtoken?: string;
  franchise: string;
  franchiseName: string;
  lastDigits: string;
  validUntil: string;
}

interface GouAuthDebug extends GouAuthRequest {
  debug: {
    timestamp: string;
    timezone: string;
    timestampUTC: string;
  };
}

type PaymentState = 'APPROVED' | 'REJECTED' | 'PENDING' | 'FAILED';

export class GouPaymentGateway extends BasePaymentGateway {
  private readonly baseUrl: string;
  private readonly login: string;
  private readonly secretKey: string;
  private readonly webhookUrl: string;
  private readonly testMode: boolean;

  constructor(config: GatewayConfigData) {
    super(config);

    if (!config.api_key || !config.api_secret || !config.endpoint) {
      throw new Error('Missing required GOU gateway configuration');
    }

    this.baseUrl = config.endpoint.replace(/\/$/, '');
    this.login = config.api_key;
    this.secretKey = config.api_secret;
    this.webhookUrl = config.webhook_url || '';
    this.testMode = config.test_mode || false;
  }

  private validateConfig(): void {
    if (!this.login || !this.secretKey || !this.baseUrl) {
      throw new Error('Invalid gateway configuration');
    }
    console.log('Gateway configuration validated:', {
      baseUrl: this.baseUrl,
      login: this.login,
      hasSecretKey: Boolean(this.secretKey),
      testMode: this.testMode
    });
  }

  public async generateAuth(): Promise<GouAuthCredentials> {
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

      console.log('Generated auth credentials:', auth);
      return auth;
    } catch (error) {
      console.error('Error generating authentication:', error);
      throw new Error('Failed to generate authentication credentials');
    }
  }

  private generateRandomBytes(size: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      randomBytes(size, (err, buf) => {
        if (err) reject(err);
        resolve(buf);
      });
    });
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


  public async processPayment(payment: any): Promise<any> {
    try {
      const auth = await this.generateAuth();
      
      const requestBody = {
        auth,
        locale: 'es_CO',
        payment: {
          reference: payment.payment.reference,
          description: payment.payment.description,
          amount: {
            currency: payment.payment.amount.currency,
            total: String(payment.payment.amount.total)
          }
        },
        instrument: payment.instrument,
        payer: payment.payer,
        ipAddress: payment.ipAddress || '127.0.0.1',
        userAgent: payment.userAgent || 'PlaceToPay'
      };

      const response = await fetch(`${this.baseUrl}/gateway/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseData:any = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.status?.message || `Payment failed: ${response.statusText}`);
      }

      return responseData;
    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
  }

  public async verifyTransaction(transactionId: string): Promise<any> {
    const auth = await this.generateAuth();
    
    const response = await fetch(`${this.baseUrl}/gateway/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth,
        internalReference: transactionId
      })
    });

    return this.handleResponse(await response.json());
  }

  public async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    const auth = await this.generateAuth();
    
    const response = await fetch(`${this.baseUrl}/gateway/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth,
        internalReference: transactionId,
        action: 'refund',
        ...(amount && { amount })
      })
    });

    return this.handleResponse(await response.json());
  }

  private handleResponse(response: any): PaymentResponse {
    const status = this.mapStatus(response.status.status);
    
    return {
      status,
      statusCode: response.status.reason,
      message: response.status.message,
      transactionId: response.internalReference,
      authorizationCode: response.authorization,
      receiptNumber: response.receipt,
      lastDigits: response.lastDigits,
      paymentMethod: response.paymentMethod,
      processorFields: response.processorFields,
      responseData: response
    };
  }

  private mapStatus(gouStatus: string): PaymentState {
    const statusMap: Record<string, PaymentState> = {
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED',
      'PENDING': 'PENDING',
      'FAILED': 'FAILED'
    };
    return statusMap[gouStatus] || 'FAILED';
  }


  private buildTokenInstrument(request: TokenizeRequest): TokenInstrument {
    if (request.type === 'CREDIT_CARD') {
      return {
        card: {
          number: request.instrument.card?.number!,
          expiration: request.instrument.card?.expiration!,
          cvv: request.instrument.card?.cvv!,
          installments: request.instrument.card?.installments || '1'
        }
      };
    } else if (request.type === 'PSE') {
      return {
        account: {
          bankCode: request.instrument.account?.bankCode!,
          bankName: request.instrument.account?.bankName!,
          accountType: request.instrument.account?.accountType!,
          accountNumber: request.instrument.account?.accountNumber!
        }
      };
    }
    throw new Error('Unsupported payment type');
  }

  async createToken(paymentInstrument: TokenizeRequest): Promise<TokenResponse> {
    const auth = await this.generateAuth();
    
    const response = await fetch(`${this.baseUrl}/gateway/tokenize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth,
        instrument: this.buildTokenInstrument(paymentInstrument),
        payer: paymentInstrument.payer,
        ipAddress: paymentInstrument.ipAddress,
        userAgent: paymentInstrument.userAgent
      })
    });

    const tokenResponse = await response.json() as GouTokenResponse;

    if (tokenResponse.status.status !== 'OK') {
      throw new Error(tokenResponse.status.message || 'Failed to create token');
    }

    return {
      token: tokenResponse.token,
      subtoken: tokenResponse.subtoken,
      franchise: tokenResponse.franchise,
      franchiseName: tokenResponse.franchiseName,
      lastDigits: tokenResponse.lastDigits,
      validUntil: tokenResponse.validUntil
    };
  }

  async invalidateToken(token: string): Promise<boolean> {
    const auth = await this.generateAuth();
    
    const response = await fetch(`${this.baseUrl}/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth,
        instrument: {
          token: {
            token
          }
        }
      })
    });

    const result = await response.json() as GouInvalidateResponse;
    return result.status.status === 'OK';
  }

  public async testAuth(): Promise<any> {
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
            number: '4110760000000008' // Test card number
          }
        },
        ipAddress: '127.0.0.1',
        userAgent: 'PlaceToPay Test'
      };

      console.log('Test auth request:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseUrl}/gateway/information`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData:any = await response.json();
        throw new Error(errorData.status?.message || `Auth test failed: ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('Auth test response:', JSON.stringify(responseData, null, 2));

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
      console.error('Test auth error:', error);
      throw error;
    }
  }

  public async testInformation(): Promise<any> {
    try {
      const authData = await this.generateAuth();
      
      const requestBody = {
        ...authData,
        locale: 'es_CO',
        payment: {
          reference: `TEST_${Date.now()}`,
          description: 'Test payment information',
          amount: {
            currency: 'USD',
            total: 1.00
          }
        },
        instrument: {
          card: {
            number: '4110760000000008'
          }
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
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
        const errorData:any = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      return {
        request: requestBody,
        response: responseData
      };
    } catch (error) {
      console.error('Information test error:', error);
      throw error;
    }
  }

  public async testConnection(): Promise<any> {
    try {
      return await this.testAuth();
    } catch (error) {
      console.error('GOU connection test failed:', error);
      return {
        status: 'error',
        connection: false,
        gateway: 'GOU',
        error: error instanceof Error ? error.message : 'Unknown error',
        test_mode: this.testMode
      };
    }
  }
}