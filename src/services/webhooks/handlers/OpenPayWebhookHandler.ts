import { Request, Response } from 'express';
import { GatewayConfig } from '../../../models/GatewayConfig';
import { PaymentState } from '../../../types/payment';
import { OrderState } from '../../../types/checkout';
import { Payment } from '../../../models/Payment';
import { Order } from '../../../models/Order';
import { BaseWebhookHandler } from './BaseWebhookHandler';
import crypto from 'crypto';

export class OpenPayWebhookHandler extends BaseWebhookHandler {
    protected readonly gatewayName = 'OPENPAY';
    protected readonly validEvents = [
        'charge.succeeded',
        'charge.failed',
        'charge.cancelled',
        'charge.created',
        'charge.refunded',
        'chargeback.accepted'
    ];

    private webhookSecret: string | null = null;
    private webhookCredentials: { user: string; password: string } | null = null;

    constructor() {
        super();
    }

    private async initializeCredentials(): Promise<void> {
        if (this.webhookCredentials && this.webhookSecret) return;

        const gatewayConfig = await GatewayConfig.findOne({
            where: {
                gateway: 'OPENPAY',
                is_active: true
            }
        });

        if (!gatewayConfig) {
            throw new Error('OpenPay gateway configuration not found or inactive');
        }

        const config = gatewayConfig.getConfigObject();
        this.webhookSecret = config.api_secret;

        // Use the credentials from environment variables
        this.webhookCredentials = {
            user: process.env.OPENPAY_WEBHOOK_USER || '',
            password: process.env.OPENPAY_WEBHOOK_PASSWORD || ''
        };

        console.log('Credentials initialized:', {
            hasSecret: !!this.webhookSecret,
            webhookUser: this.webhookCredentials.user,
            hasPassword: !!this.webhookCredentials.password
        });
    }

    private checkBasicAuth(req: Request): boolean {
        try {
            // For verification requests from OpenPay, skip auth check
            if (req.method === 'GET') {
                return true;
            }

            const authHeader = req.headers.authorization;
            console.log('Auth header received:', authHeader ? 'Present' : 'Missing');

            if (!authHeader) {
                return false;
            }

            if (!authHeader.startsWith('Basic ')) {
                console.log('Invalid auth header format');
                return false;
            }

            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
            const [username, password] = credentials.split(':');

            const isValid = username === this.webhookCredentials?.user && 
                          password === this.webhookCredentials?.password;

            console.log('Auth check result:', {
                hasUsername: !!username,
                expectedUsername: this.webhookCredentials?.user,
                isValid
            });

            return isValid;
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    }

    public async handleRequest(req: Request, res: Response): Promise<void> {
        try {
            console.log('Handling webhook request:', {
                method: req.method,
                path: req.path,
                hasAuth: !!req.headers.authorization,
                contentType: req.headers['content-type']
            });

            await this.initializeCredentials();

            // For GET requests (webhook verification)
            if (req.method === 'GET') {
                console.log('Processing webhook verification GET request');
                res.status(200).send('OK');
                return;
            }

            // For POST requests (webhook events and verification)
            if (req.method === 'POST') {
                const hasAuth = this.checkBasicAuth(req);
                console.log('POST request authorization:', { hasAuth });

                // OpenPay's verification request
                if (!req.body || Object.keys(req.body).length === 0) {
                    console.log('Empty body request - treating as verification');
                    res.status(200).json({ status: 'success' });
                    return;
                }

                // Handle normal webhook events
                if (!hasAuth) {
                    console.log('Failed authorization check');
                    res.status(401).json({
                        status: 'error',
                        message: 'Unauthorized'
                    });
                    return;
                }

                if (!this.validateEvent(req.body.type)) {
                    console.log('Invalid event type:', req.body.type);
                    res.status(400).json({
                        status: 'error',
                        message: 'Unsupported event type'
                    });
                    return;
                }

                await this.processWebhook(req.body);
                res.status(200).json({ status: 'success' });
                return;
            }

            // Handle unsupported methods
            res.status(405).json({
                status: 'error',
                message: 'Method not allowed'
            });

        } catch (error) {
            console.error('Webhook processing error:', error);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error'
            });
        }
    }


    public async verifySignature(signature: string | undefined, payload: string): Promise<boolean> {
        if (!signature) return false;

        // Ensure credentials are initialized
        if (!this.webhookSecret) {
            await this.initializeCredentials();
        }

        if (!this.webhookSecret) {
            throw new Error('Webhook secret not initialized');
        }

        const computedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(computedSignature)
        );
    }

    public async processWebhook(event: any): Promise<void> {
        this.logWebhookEvent(event);

        const payment = await Payment.findOne({
            where: { transaction_id: event.transaction.id }
        });

        if (!payment) {
            throw new Error(`Payment not found for transaction: ${event.transaction.id}`);
        }

        const paymentState = this.mapPaymentStatus(event.transaction.status);
        const orderState = this.mapOrderStatus(paymentState);

        await payment.update({
            state: paymentState,
            state_description: event.transaction.status_description || event.transaction.error_message,
            gateway_response: JSON.stringify(event.transaction),
            external_reference: event.transaction.authorization,
            error_message: event.transaction.error_message,
            last_attempt_at: new Date(),
            attempts: payment.attempts + 1
        });

        if (payment.order_id) {
            const order = await Order.findByPk(payment.order_id);
            if (order) {
                await order.update({
                    state: orderState,
                    last_payment_id: payment.id
                });
            }
        }
    }

    private mapPaymentStatus(openPayStatus: string): PaymentState {
        const statusMap: Record<string, PaymentState> = {
            'completed': 'APPROVED',
            'failed': 'FAILED',
            'cancelled': 'CANCELLED',
            'refunded': 'REFUNDED',
            'in_progress': 'PENDING',
            'timeout': 'FAILED',
            'error': 'FAILED'
        };
        return statusMap[openPayStatus] || 'FAILED';
    }

    private mapOrderStatus(paymentState: PaymentState): OrderState {
        const statusMap: Record<PaymentState, OrderState> = {
            'APPROVED': 'PAYMENT_COMPLETED',
            'FAILED': 'PAYMENT_FAILED',
            'CANCELLED': 'CANCELLED',
            'REFUNDED': 'REFUNDED',
            'PENDING': 'PAYMENT_PENDING',
            'PROCESSING': 'PAYMENT_PROCESSING',
            'REJECTED': 'PAYMENT_FAILED'
        };
        return statusMap[paymentState] || 'PAYMENT_FAILED';
    }
}