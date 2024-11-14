import { GouPaymentGateway } from '../models/GouPaymentGateway';
import { OpenPayPaymentGateway } from '../models/OpenPayPaymentGateway';
import { GatewayConfig as GatewayConfigModel } from '../models/GatewayConfig';
import { 
  PaymentGateway, 
  PaymentMethodType, 
  PaymentGatewayInterface,
  GatewayConfigData,
  PaymentMethodSettings,
  PaymentMethodMapping
} from '../types/payment';

interface ConfigData extends GatewayConfigData {
  enabled: boolean;
  supportedMethods: PaymentMethodMapping;
}

export class PaymentGatewayService {
  private static instance: PaymentGatewayService;
  private readonly gateways = new Map<PaymentGateway, PaymentGatewayInterface>();
  private readonly methodMappings = new Map<PaymentMethodType, PaymentGateway>();

  private constructor() {
    // Default payment method mappings - OPENPAY as default gateway
    this.methodMappings.set('PSE', 'OPENPAY');
    this.methodMappings.set('CREDIT_CARD', 'OPENPAY');
    this.methodMappings.set('DEBIT_CARD', 'OPENPAY');
    this.methodMappings.set('TRANSFER', 'OPENPAY');
    this.methodMappings.set('CASH', 'OPENPAY');
  }

  public static getInstance(): PaymentGatewayService {
    if (!PaymentGatewayService.instance) {
      PaymentGatewayService.instance = new PaymentGatewayService();
    }
    return PaymentGatewayService.instance;
  }

  private parseConfig(dbConfig: GatewayConfigModel): ConfigData {
    try {
      const config = dbConfig.getConfigObject();
      return {
        provider: dbConfig.gateway,
        apiKey: config.api_key || config.apiKey,
        apiSecret: config.api_secret || config.apiSecret,
        endpoint: config.endpoint,
        webhookUrl: config.webhook_url || config.webhookUrl,
        testMode: dbConfig.test_mode,
        enabled: dbConfig.is_active,
        supportedMethods: this.getDefaultMethodMapping(dbConfig.gateway)
      };
    } catch (error) {
      throw new Error(`Invalid gateway configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getDefaultMethodMapping(gateway: PaymentGateway): PaymentMethodMapping {
    const defaultSettings: PaymentMethodSettings = {
      enabled: true,
      supportedCurrencies: ['COP']
    };

    return {
      PSE: { ...defaultSettings },
      CREDIT_CARD: { ...defaultSettings },
      DEBIT_CARD: { ...defaultSettings },
      TRANSFER: { ...defaultSettings },
      CASH: { ...defaultSettings }
    };
  }

  public async initializeGateways(): Promise<void> {
    const configs = await GatewayConfigModel.findAll({
      where: { is_active: true }
    });

    for (const config of configs) {
      await this.initializeGateway(config);
    }
  }

  private async initializeGateway(dbConfig: GatewayConfigModel): Promise<void> {
    const config = this.parseConfig(dbConfig);
    const provider = config.provider;

    let gateway: PaymentGatewayInterface;

    switch (provider) {
      case 'GOU':
        gateway = new GouPaymentGateway(config);
        break;
      case 'OPENPAY':
        gateway = new OpenPayPaymentGateway(config);
        break;
      default:
        throw new Error(`Unsupported payment gateway: ${provider}`);
    }

    this.gateways.set(provider, gateway);
    
    // Update method mappings based on config
    if (config.supportedMethods) {
      Object.entries(config.supportedMethods).forEach(([method, settings]) => {
        const paymentMethod = method as PaymentMethodType;
        if (settings.enabled) {
          this.methodMappings.set(paymentMethod, provider);
        }
      });
    }
  }

  public async getGatewayForMethod(method: PaymentMethodType): Promise<PaymentGatewayInterface> {
    const gatewayProvider = this.methodMappings.get(method);
    if (!gatewayProvider) {
      // Default to OPENPAY if no specific mapping exists
      this.methodMappings.set(method, 'OPENPAY');
      return this.getGateway('OPENPAY');
    }

    return this.getGateway(gatewayProvider);
  }

  public async getGateway(provider: PaymentGateway): Promise<PaymentGatewayInterface> {
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      // If gateway not initialized, try to load from database
      const dbConfig = await GatewayConfigModel.findOne({
        where: { gateway: provider, is_active: true }
      });

      if (!dbConfig) {
        throw new Error(`Payment gateway configuration not found for provider: ${provider}`);
      }

      await this.initializeGateway(dbConfig);
      return this.getGateway(provider); // Retry after initialization
    }

    return gateway;
  }

  public async updateMethodMapping(method: PaymentMethodType, gateway: PaymentGateway): Promise<void> {
    // Verify gateway exists and is active
    const gatewayInstance = await this.getGateway(gateway);
    if (!gatewayInstance) {
      throw new Error(`Gateway ${gateway} is not active or does not exist`);
    }

    this.methodMappings.set(method, gateway);
  }

  public getMethodMappings(): Map<PaymentMethodType, PaymentGateway> {
    return new Map(this.methodMappings);
  }

  public async refreshGateway(provider: PaymentGateway): Promise<void> {
    this.gateways.delete(provider);
    await this.getGateway(provider);
  }

  public async getAllActiveGateways(): Promise<PaymentGatewayInterface[]> {
    const configs = await GatewayConfigModel.findAll({
      where: { is_active: true }
    });

    const gateways: PaymentGatewayInterface[] = [];
    for (const dbConfig of configs) {
      try {
        const gateway = await this.getGateway(dbConfig.gateway);
        gateways.push(gateway);
      } catch (error) {
        console.error(`Error initializing gateway ${dbConfig.gateway}:`, error);
      }
    }

    return gateways;
  }
}