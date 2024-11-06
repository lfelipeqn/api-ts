import { GouPaymentGateway } from '../models/GouPaymentGateway';
import { OpenPayPaymentGateway } from '../models/OpenPayPaymentGateway';
import { GatewayConfig as GatewayConfigModel } from '../models/GatewayConfig';
import { 
  PaymentGateway, 
  GatewayConfigData, 
  PaymentGatewayInterface,
  GatewayConfig 
} from '../types/payment';


export class PaymentGatewayService {
  private static instance: PaymentGatewayService;
  private readonly gateways = new Map<PaymentGateway, PaymentGatewayInterface>();

  private constructor() {}

  public static getInstance(): PaymentGatewayService {
    if (!PaymentGatewayService.instance) {
      PaymentGatewayService.instance = new PaymentGatewayService();
    }
    return PaymentGatewayService.instance;
  }

  public async getGateway(provider: PaymentGateway = 'GOU'): Promise<PaymentGatewayInterface> {
    const existingGateway = this.gateways.get(provider);
    if (existingGateway) {
      return existingGateway;
    }

    const config = await GatewayConfigModel.findOne({
      where: { gateway: provider, is_active: true }
    });

    if (!config) {
      throw new Error(`Payment gateway configuration not found for provider: ${provider}`);
    }

    const gatewayConfig = this.parseConfig(config);
    let gateway: PaymentGatewayInterface;

    switch (provider.toUpperCase() as PaymentGateway) {
      case 'GOU': {
        gateway = new GouPaymentGateway(gatewayConfig);
        break;
      }
      case 'OPENPAY': {
        gateway = new OpenPayPaymentGateway(gatewayConfig);
        break;
      }
      default:
        throw new Error(`Unsupported payment gateway provider: ${provider}`);
    }

    this.gateways.set(provider, gateway);
    return gateway;
  }


  public async refreshGateway(provider: PaymentGateway): Promise<void> {
    this.gateways.delete(provider);
    await this.getGateway(provider);
  }

  private parseConfig(config: GatewayConfigModel): GatewayConfig {
    let parsedConfig: any;
    try {
      // Handle case where config might already be an object
      if (typeof config.config === 'object' && config.config !== null) {
        parsedConfig = config.config;
      } else {
        parsedConfig = JSON.parse(config.config as string);
      }
    } catch (error) {
      console.error('Error parsing gateway config:', error);
      throw new Error(`Invalid gateway configuration format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      provider: config.gateway as PaymentGateway,
      api_key: parsedConfig.api_key,
      api_secret: parsedConfig.api_secret,
      endpoint: parsedConfig.endpoint,
      webhook_url: parsedConfig.webhook_url,
      test_mode: config.test_mode
    };
  }


  public async getAllActiveGateways(): Promise<PaymentGatewayInterface[]> {
    const configs = await GatewayConfigModel.findAll({
      where: { is_active: true }
    });

    const gateways: PaymentGatewayInterface[] = [];
    
    for (const config of configs) {
      try {
        const provider = config.gateway as PaymentGateway;
        const gateway = await this.getGateway(provider);
        gateways.push(gateway);
      } catch (error) {
        console.error(`Error initializing gateway ${config.gateway}:`, error);
      }
    }

    return gateways;
  }
}