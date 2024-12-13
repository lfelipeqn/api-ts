// src/services/webhooks/handlers/BaseWebhookHandler.ts
import { Request, Response } from 'express';

export abstract class BaseWebhookHandler {
    protected abstract readonly validEvents: string[];
    protected abstract readonly gatewayName: string;

    abstract verifySignature(signature: string | undefined, payload: string): Promise<boolean>;
    abstract processWebhook(event: any): Promise<void>;

  protected validateEvent(eventType: string): boolean {
    return this.validEvents.includes(eventType);
  }

  protected logWebhookEvent(event: any, metadata?: Record<string, any>): void {
    console.log(`${this.gatewayName} Webhook Event:`, {
      timestamp: new Date().toISOString(),
      eventType: event.type,
      metadata,
      event
    });
  }

  protected logWebhookError(error: Error, event: any): void {
    console.error(`${this.gatewayName} Webhook Error:`, {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      event
    });
  }

  public async handleRequest(req: Request, res: Response): Promise<void> {
    try {
        const signatureHeader = req.headers[`x-${this.gatewayName.toLowerCase()}-signature`];
        const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
        const payload = JSON.stringify(req.body);

        if (!await this.verifySignature(signature, payload)) {
            res.status(401).json({
                status: 'error',
                message: 'Invalid webhook signature'
            });
            return;
        }

        if (!this.validateEvent(req.body.type)) {
            res.status(400).json({
            status: 'error',
            message: 'Unsupported event type'
            });
            return;
        }

        await this.processWebhook(req.body);

        res.status(200).json({
            status: 'success',
            message: 'Webhook processed successfully'
        });
    } catch (error) {
        this.logWebhookError(error as Error, req.body);
        res.status(500).json({
        status: 'error',
        message: 'Webhook processing failed'
        });
    }
  }
}