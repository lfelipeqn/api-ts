import { 
  PaymentGateway,
  GatewayConfigData,
  PaymentState,
  PSEBank,
  BaseGatewayConfig,
  CreditCardPaymentRequest,
  PSEPaymentRequest,
  PaymentResponse,
  TokenizeCardRequest,
  TokenResponse,
  BasePaymentGatewayInterface
} from '../types/payment';
  
  
  // Abstract base class for payment gateways
  export abstract class BasePaymentGateway implements BasePaymentGatewayInterface {
    protected config: BaseGatewayConfig;
    protected gatewayName: PaymentGateway;
  
    constructor(config: GatewayConfigData) {
      this.config = {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        endpoint: config.endpoint,
        webhookUrl: config.webhookUrl,
        testMode: config.testMode
      };
      this.gatewayName = config.provider;
    }
  
    // Gateway-specific implementations must provide these methods
    protected abstract formatCardPaymentRequest(request: CreditCardPaymentRequest): any;
    protected abstract formatPSEPaymentRequest(request: PSEPaymentRequest): any;
    protected abstract formatCardResponse(response: any): PaymentResponse;
    protected abstract formatPSEResponse(response: any): PaymentResponse;
    protected abstract formatTransactionStatus(response: any): PaymentState;
    protected abstract createRefundRequest(transactionId: string, amount?: number): any;
    protected abstract formatBanksResponse(response: any): PSEBank[];
    protected abstract getRequestHeaders(): Promise<Headers>;
    protected abstract handleErrorResponse(response: Response): Promise<Error>;
    protected abstract formatTokenRequest(request: TokenizeCardRequest): any;
    protected abstract formatTokenResponse(response: any): TokenResponse;
  
    public getGatewayInfo(): Partial<GatewayConfigData> {
      return {
        provider: this.gatewayName,
        endpoint: this.config.endpoint,
        webhookUrl: this.config.webhookUrl,
        testMode: this.config.testMode
      };
    }
  
    public async processCreditCardPayment(request: CreditCardPaymentRequest): Promise<PaymentResponse> {
      try {
        const gatewayRequest = this.formatCardPaymentRequest(request);
        const response = await this.makeRequest('/charges', 'POST', gatewayRequest);
        return this.formatCardResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} credit card payment error:`, error);
        throw error;
      }
    }
  
    public async processPSEPayment(request: PSEPaymentRequest): Promise<PaymentResponse> {
      try {
        console.log('Processing PSE payment request:', JSON.stringify(request, null, 2));
        const gatewayRequest = this.formatPSEPaymentRequest(request);
        console.log('Formatted PSE request:', JSON.stringify(gatewayRequest, null, 2));
        const response = await this.makeRequest('/charges', 'POST', gatewayRequest);
        console.log('PSE payment response:', JSON.stringify(response, null, 2));
        return this.formatPSEResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} PSE payment error:`, error);
        throw error;
      }
    }
  
    public async verifyTransaction(transactionId: string): Promise<PaymentResponse> {
      try {
        const response = await this.makeRequest(`/charges/${transactionId}`, 'GET');
        const status = this.formatTransactionStatus(response);
        return this.formatCardResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} transaction verification error:`, error);
        throw error;
      }
    }
  
    public async refundTransaction(transactionId: string, amount?: number): Promise<PaymentResponse> {
      try {
        const refundRequest = this.createRefundRequest(transactionId, amount);
        const response = await this.makeRequest(`/charges/${transactionId}/refund`, 'POST', refundRequest);
        return this.formatCardResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} refund error:`, error);
        throw error;
      }
    }
  
    public async getBanks(): Promise<PSEBank[]> {
      try {
        const response = await this.makeRequest('/pse/banks', 'GET');
        return this.formatBanksResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} get banks error:`, error);
        throw error;
      }
    }
  
    protected async makeRequest(
      path: string, 
      method: string, 
      data?: any
    ): Promise<any> {
      const url = `${this.config.endpoint}${path}`;
      const headers = await this.getRequestHeaders();
  
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined
      });
  
      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }
  
      return response.json();
    }

    public async createCardToken(request: TokenizeCardRequest): Promise<TokenResponse> {
      try {
        const tokenRequest = this.formatTokenRequest(request);
        const response = await this.makeRequest('/tokens', 'POST', tokenRequest);
        return this.formatTokenResponse(response);
      } catch (error) {
        console.error(`${this.gatewayName} token creation error:`, error);
        throw error;
      }
    }
  
    public async testConnection(): Promise<any> {
      try {
        const response = await this.makeRequest('/ping', 'GET');
        return {
          status: 'success',
          gateway: this.gatewayName,
          testMode: this.config.testMode,
          connection: true,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'error',
          gateway: this.gatewayName,
          testMode: this.config.testMode,
          connection: false,
          error: error instanceof Error ? error.message : 'Connection failed',
          timestamp: new Date().toISOString()
        };
      }
    }
  }