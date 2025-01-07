// src/scripts/setupOpenPayWebhook.ts

/**
 * In development:
 * ngrok http 3000
 * npx ts-node src/scripts/setupOpenPayWebhook.ts "https://URL_NGROK/api/payments/webhooks/openpay"
 * 
 * In production:
 * NODE_ENV=production npx ts-node src/scripts/manageOpenPayWebhook.ts
 */

import { GatewayConfig } from '../models/GatewayConfig';
import { getDatabase, getSequelize } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

interface OpenPayWebhookResponse {
    id: string;
    url: string;
    status: string;
    event_types: string[];
    user?: string;
}

interface WebhookCredentials {
    user: string;
    password: string;
}

class OpenPayWebhookManager {
    private gatewayConfig!: GatewayConfig;
    private config!: any;
    private baseUrl!: string;
    private merchantId!: string;
    private webhookCredentials!: WebhookCredentials;

    constructor() {
        // Properties will be initialized in the initialize method
    }

    private async initialize() {
        const { models } = getDatabase();

        const webhookUser = process.env.OPENPAY_WEBHOOK_USER;
        const webhookPassword = process.env.OPENPAY_WEBHOOK_PASSWORD;

        if (!webhookUser || !webhookPassword) {
            throw new Error('Missing webhook credentials. Please set OPENPAY_WEBHOOK_USER and OPENPAY_WEBHOOK_PASSWORD in your .env file');
        }

        this.webhookCredentials = {
            user: webhookUser,
            password: webhookPassword
        };

        const gatewayConfig = await models.GatewayConfig.findOne({
            where: {
                gateway: 'OPENPAY',
                is_active: true
            }
        });

        if (!gatewayConfig) {
            throw new Error('OpenPay gateway configuration not found or inactive');
        }

        this.gatewayConfig = gatewayConfig;
        this.config = gatewayConfig.getConfigObject();

        // For OpenPay, the merchant_id is the api_key
        this.merchantId = this.config.merchant_id || this.config.api_key;
        this.baseUrl = `${this.config.endpoint}/v1`;

        console.log('Configuration loaded:', {
            baseUrl: this.baseUrl,
            merchantId: this.merchantId ? '[PRESENT]' : '[MISSING]'
        });

        if (!this.merchantId) {
            throw new Error('OpenPay configuration is missing merchant_id/api_key in database');
        }
    }

    public async updateWebhookUrl(newUrl?: string): Promise<void> {
        try {
            await this.initialize();

            const webhookUrl = process.env.NODE_ENV === 'production' 
                ? this.config.webhook_url 
                : newUrl;

            if (!webhookUrl) {
                throw new Error('Webhook URL is required in development environment or must be configured in database for production');
            }

            console.log('Setting up webhook URL:', webhookUrl);

            try {
                const webhooks = await this.listWebhooks();
                if (webhooks.length > 0) {
                    console.log('Found existing webhooks, cleaning up...');
                    for (const webhook of webhooks) {
                        await this.deleteWebhook(webhook.id);
                    }
                }
            } catch (error) {
                console.log('No existing webhooks found, proceeding with creation');
            }

            const newWebhook = await this.createWebhook(webhookUrl);
            console.log('Created new webhook:', newWebhook);

            if (process.env.NODE_ENV !== 'production') {
                await this.gatewayConfig.update({
                    config: JSON.stringify({
                        ...this.config,
                        webhook_url: webhookUrl,
                        webhook_id: newWebhook.id
                    })
                });
            }

            console.log('Successfully configured webhook');

        } catch (error) {
            console.error('Error updating webhook:', error);
            throw error;
        }
    }

    private getAuthorizationHeader(): string {
        if (!this.config.api_secret) {
            throw new Error('API Secret is not configured');
        }
        const authString = Buffer.from(`${this.config.api_secret}:`).toString('base64');
        return `Basic ${authString}`;
    }

    private async listWebhooks(): Promise<OpenPayWebhookResponse[]> {
        const response = await fetch(`${this.baseUrl}/${this.merchantId}/webhooks`, {
            method: 'GET',
            headers: {
                'Authorization': this.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            throw new Error(`Failed to list webhooks: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        
        if (!Array.isArray(data) || !this.isWebhookResponseArray(data)) {
            throw new Error('Invalid webhook response format from API');
        }

        return data;
    }

    private async deleteWebhook(webhookId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${this.merchantId}/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': this.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            throw new Error(`Failed to delete webhook: ${JSON.stringify(errorData)}`);
        }
    }

    private async createWebhook(webhookUrl: string): Promise<OpenPayWebhookResponse> {
        const webhookData = {
            url: webhookUrl,
            user: this.webhookCredentials.user,
            password: this.webhookCredentials.password,
            event_types: [
                'charge.succeeded',
                'charge.failed',
                'charge.cancelled',
                'charge.created',
                'charge.refunded',
                'chargeback.accepted'
            ]
        };
    
        console.log('Creating webhook with configuration:', {
            url: webhookUrl,
            user: this.webhookCredentials.user,
            event_types: webhookData.event_types,
            authHeader: 'Basic ******' // Log presence of auth header without exposing credentials
        });
    
        const response = await fetch(`${this.baseUrl}/${this.merchantId}/webhooks`, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookData)
        });
    
        // Log response status for debugging
        console.log('OpenPay API Response:', {
            status: response.status,
            statusText: response.statusText
        });
    
        if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            throw new Error(`Failed to create webhook: ${JSON.stringify(errorData)}`);
        }
    
        const data = await response.json();
        
        if (!this.isWebhookResponse(data)) {
            throw new Error('Invalid webhook response format from API');
        }
    
        return data;
    }

    private isWebhookResponse(data: any): data is OpenPayWebhookResponse {
        return (
            typeof data === 'object' &&
            data !== null &&
            typeof data.id === 'string' &&
            typeof data.url === 'string' &&
            typeof data.status === 'string' &&
            Array.isArray(data.event_types)
        );
    }

    private isWebhookResponseArray(data: any[]): data is OpenPayWebhookResponse[] {
        return data.every(item => this.isWebhookResponse(item));
    }
}

async function main() {
    try {
        const manager = new OpenPayWebhookManager();
        
        if (process.env.NODE_ENV === 'production') {
            console.log('Running in production mode - using configured webhook URL from database');
            await manager.updateWebhookUrl();
        } else {
            const newUrl = process.argv[2];
            if (!newUrl) {
                throw new Error('Please provide a new webhook URL as a command line argument in development environment');
            }
            console.log('Running in development mode - using provided webhook URL');
            await manager.updateWebhookUrl(newUrl);
        }

        const sequelize = getSequelize();
        await sequelize.close();
        
        console.log('Webhook update completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { OpenPayWebhookManager };