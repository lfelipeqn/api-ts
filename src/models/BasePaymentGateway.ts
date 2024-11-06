// models/BasePaymentGateway.ts

import { PaymentGatewayInterface, GatewayConfigData } from '../types/payment';

export abstract class BasePaymentGateway implements PaymentGatewayInterface {
  protected config: GatewayConfigData;

  constructor(config: GatewayConfigData) {
    this.config = config;
  }

  abstract processPayment(payment: any): Promise<any>;
  abstract verifyTransaction(transactionId: string): Promise<any>;
  abstract refundTransaction(transactionId: string, amount?: number): Promise<any>;
  abstract testConnection(): Promise<any>;

  getGatewayInfo(): Partial<GatewayConfigData> {
    return {
      provider: this.config.provider,
      endpoint: this.config.endpoint,
      webhook_url: this.config.webhook_url,
      test_mode: this.config.test_mode
    };
  }
}