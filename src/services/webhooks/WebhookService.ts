import { Request, Response } from 'express';
import { BaseWebhookHandler } from './handlers/BaseWebhookHandler';
import { OpenPayWebhookHandler } from './handlers/OpenPayWebhookHandler';

export class WebhookService {
    private static instance: WebhookService;
    private readonly handlers: Map<string, BaseWebhookHandler>;

    private constructor() {
        this.handlers = new Map();
        this.handlers.set('openpay', new OpenPayWebhookHandler());
    }

    public static getInstance(): WebhookService {
        if (!WebhookService.instance) {
            WebhookService.instance = new WebhookService();
        }
        return WebhookService.instance;
    }

    public async handleWebhook(gateway: string, req: Request, res: Response): Promise<void> {
        const handler = this.handlers.get(gateway.toLowerCase());
        if (!handler) {
            res.status(400).json({
                status: 'error',
                message: `Unsupported payment gateway: ${gateway}`
            });
            return;
        }

        await handler.handleRequest(req, res);
    }
}