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

export interface GatewayMethodConfig {
  gatewayId: number;
  enabled: boolean;
  isDefault: boolean;
  supportedCurrencies: string[];
  minAmount?: number;
  maxAmount?: number;
}

export interface GatewayMethodMapping {
  CREDIT_CARD: GatewayMethodConfig[];
  PSE: GatewayMethodConfig[];
  [key: string]: GatewayMethodConfig[];
}

export class PaymentGatewayService {
  private static instance: PaymentGatewayService;
  private readonly gateways = new Map<PaymentGateway, PaymentGatewayInterface>();
  private methodConfigurations: Record<PaymentMethodType, GatewayMethodConfig[]>;

  private constructor() {
    // Initialize empty configurations for all payment methods
    this.methodConfigurations = {
      PSE: [],
      CREDIT_CARD: [],
      DEBIT_CARD: [],
      TRANSFER: [],
      CASH: []
    };
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

  public async configureGatewayMethod(
    method: PaymentMethodType,
    config: GatewayMethodConfig
  ): Promise<void> {
    // Ensure method exists in configurations
    if (!this.methodConfigurations[method]) {
      this.methodConfigurations[method] = [];
    }

    // If setting as default, remove default from others
    if (config.isDefault) {
      this.methodConfigurations[method] = this.methodConfigurations[method].map(conf => ({
        ...conf,
        isDefault: false
      }));
    }

    // Add or update configuration
    const existingIndex = this.methodConfigurations[method]
      .findIndex(conf => conf.gatewayId === config.gatewayId);

    if (existingIndex >= 0) {
      this.methodConfigurations[method][existingIndex] = config;
    } else {
      this.methodConfigurations[method].push(config);
    }
  }

  // Get default gateway for a payment method
  public async getDefaultGateway(
    method: PaymentMethodType,
    amount?: number,
    currency?: string
  ): Promise<PaymentGatewayInterface> {
    const methodConfigs = this.methodConfigurations[method] || [];
    const defaultConfig = methodConfigs.find(conf => 
      conf.isDefault && 
      conf.enabled && 
      (!amount || (
        (!conf.minAmount || amount >= conf.minAmount) &&
        (!conf.maxAmount || amount <= conf.maxAmount)
      )) &&
      (!currency || conf.supportedCurrencies.includes(currency))
    );

    if (!defaultConfig) {
      throw new Error(`No default gateway configured for ${method}`);
    }

    const provider = defaultConfig.gatewayId === 1 ? 'GOU' : 'OPENPAY'; // Map ID to provider
    return this.getGateway(provider);
  }

  // Get all enabled gateways for a payment method
  public getEnabledGateways(method: PaymentMethodType): GatewayMethodConfig[] {
    return (this.methodConfigurations[method] || [])
      .filter(config => config.enabled)
      .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
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
    const gatewayId = this.getGatewayIdForProvider(provider);

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
    
    // Update method configurations based on config
    if (config.supportedMethods) {
      Object.entries(config.supportedMethods).forEach(([method, settings]) => {
        const paymentMethod = method as PaymentMethodType;
        if (settings.enabled) {
          // Create gateway configuration
          const gatewayConfig: GatewayMethodConfig = {
            gatewayId,
            enabled: settings.enabled,
            isDefault: false, // Set default based on your business logic
            supportedCurrencies: settings.supportedCurrencies,
            minAmount: settings.minAmount,
            maxAmount: settings.maxAmount
          };

          // Add to configurations
          this.methodConfigurations[paymentMethod] = 
            this.methodConfigurations[paymentMethod] || [];
          this.methodConfigurations[paymentMethod].push(gatewayConfig);
        }
      });
    }
  }

  public async getGatewayForMethod(method: PaymentMethodType): Promise<PaymentGatewayInterface> {
    const methodConfigs = this.methodConfigurations[method] || [];
    const defaultConfig = methodConfigs.find(conf => conf.isDefault && conf.enabled);
    
    if (!defaultConfig) {
      // Default to OPENPAY if no specific configuration exists
      const provider = 'OPENPAY';
      const gateway = await this.getGateway(provider);
      
      // Add default configuration
      await this.configureGatewayMethod(method, {
        gatewayId: this.getGatewayIdForProvider(provider),
        enabled: true,
        isDefault: true,
        supportedCurrencies: ['COP']
      });

      return gateway;
    }

    return this.getGateway(this.getProviderForGatewayId(defaultConfig.gatewayId));
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

  public async updateMethodMapping(method: PaymentMethodType, provider: PaymentGateway): Promise<void> {
    // Verify gateway exists and is active
    const gateway = await this.getGateway(provider);
    if (!gateway) {
      throw new Error(`Gateway ${provider} is not active or does not exist`);
    }

    const gatewayId = this.getGatewayIdForProvider(provider);

    // Update configurations
    await this.configureGatewayMethod(method, {
      gatewayId,
      enabled: true,
      isDefault: true,
      supportedCurrencies: ['COP']
    });
  }

  public getMethodMappings(): Map<PaymentMethodType, PaymentGateway> {
    // Convert methodConfigurations to the old mapping format for backwards compatibility
    const mappings = new Map<PaymentMethodType, PaymentGateway>();
    
    Object.entries(this.methodConfigurations).forEach(([method, configs]) => {
      const defaultConfig = configs.find(conf => conf.isDefault && conf.enabled);
      if (defaultConfig) {
        mappings.set(
          method as PaymentMethodType,
          this.getProviderForGatewayId(defaultConfig.gatewayId)
        );
      }
    });

    return mappings;
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
  
  private getProviderForGatewayId(gatewayId: number): PaymentGateway {
    // Implement your mapping logic here
    switch (gatewayId) {
      case 1:
        return 'GOU';
      case 2:
        return 'OPENPAY';
      default:
        throw new Error(`Unknown gateway ID: ${gatewayId}`);
    }
  }

  private getGatewayIdForProvider(provider: PaymentGateway): number {
    // Implement reverse mapping logic here
    switch (provider) {
      case 'GOU':
        return 1;
      case 'OPENPAY':
        return 2;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

}