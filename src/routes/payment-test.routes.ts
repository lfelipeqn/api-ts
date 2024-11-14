import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { 
  PaymentMethodType, 
  PSEPaymentRequest, 
  PaymentGateway 
} from '../types/payment';
import { z } from 'zod';

const router = Router();

const testConfigSchema = z.object({
  merchantId: z.string().optional(),
  apiKey: z.string().optional(),
  sandbox: z.boolean().optional(),
  validateOnly: z.boolean().optional()
}).optional();


// Validation schemas
const psePaymentSchema = z.object({
  paymentGateway: z.enum(['OPENPAY', 'GOU']),
  amount: z.number().positive(),
  description: z.string(),
  currency: z.string().default('COP'),
  redirectUrl: z.string().url(),
  customer: z.object({
    name: z.string(),
    last_name: z.string(),
    email: z.string().email(),
    phone_number: z.string(),
    requires_account: z.boolean().default(false),
    address: z.object({
      department: z.string(),
      city: z.string(),
      additional: z.string()
    })
  }),
  metadata: z.record(z.any()).optional()
});


const cardTokenPaymentSchema = z.object({
  paymentGateway: z.enum(['OPENPAY', 'GOU']),
  amount: z.number().positive(),
  currency: z.string().default('COP'),
  description: z.string(),
  tokenId: z.string(),
  deviceSessionId: z.string(),
  customer: z.object({
    name: z.string(),
    last_name: z.string().optional(),
    email: z.string().email(),
    phone_number: z.string().optional()
  })
});

// New schema for creating card token
const createTokenSchema = z.object({
  paymentGateway: z.enum(['OPENPAY', 'GOU']),
  card_number: z.string(),
  holder_name: z.string(),
  expiration_year: z.string(),
  expiration_month: z.string(),
  cvv2: z.string(),
  address: z.object({
    line1: z.string().min(1, "Street address is required"),
    line2: z.string().optional(),
    line3: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country_code: z.string().default('CO')
  })
});


// All routes require authentication
router.use(authMiddleware);

class PaymentTestDebugger {
  protected static readonly LOG_PREFIX = '[PaymentTest]';

  static formatLogMessage(message: string): string {
    return `${this.LOG_PREFIX} ${message}`;
  }

  static logAuthTest(userId: number | undefined, ipAddress: string, userAgent: string) {
    console.log(this.formatLogMessage('Auth Test Request:'), {
      userId,
      ipAddress,
      userAgent,
      timestamp: new Date().toISOString()
    });
  }

  static logError(error: unknown, context: string) {
    const errorDetails = {
      context,
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : 'Unknown',
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined
    };

    console.error(this.formatLogMessage('Error:'), errorDetails);
    return errorDetails;
  }

  static getEnvironmentInfo() {
    return {
      nodeEnv: process.env.NODE_ENV,
      hasOpenpayKey: Boolean(process.env.OPENPAY_API_KEY),
      hasOpenpaySecret: Boolean(process.env.OPENPAY_API_SECRET),
      hasOpenpayMerchant: Boolean(process.env.OPENPAY_MERCHANT_ID)
    };
  }

  static getRequestInfo(req: AuthenticatedRequest) {
    return {
      headers: {
        forwarded: req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent']
      },
      ipAddress: req.headers['x-forwarded-for']?.toString() || 
                 req.socket.remoteAddress || 
                 '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'API Test Client'
    };
  }

  static logConfigCheck(userId: number | undefined, ipAddress: string, configuration: any) {
    console.log(this.formatLogMessage('Configuration Status Check:'), {
      userId,
      ipAddress,
      configuration,
      timestamp: new Date().toISOString()
    });
  }
}


/**
 * Get available payment methods
 * @route GET /api/payments/test/methods
 */
router.get('/methods', async (_req: Request, res: Response) => {
  try {
    const gatewayService = PaymentGatewayService.getInstance();
    const mappings = gatewayService.getMethodMappings();
    
    const methodsWithGateways = Array.from(mappings.entries()).map(([method, gateway]) => ({
      method,
      gateway
    }));

    res.json({
      status: 'success',
      data: methodsWithGateways
    });
  } catch (error) {
    console.error('Error getting payment methods:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get payment methods'
    });
  }
});

/**
 * Create a card token
 * @route POST /api/payments/test/tokens
 */
router.post('/tokens', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createTokenSchema.parse(req.body);
    
    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGateway(validatedData.paymentGateway);

    // Log sanitized request (without sensitive data)
    console.log('Token Creation Request:', {
      gateway: validatedData.paymentGateway,
      holder_name: validatedData.holder_name,
      expiration_year: validatedData.expiration_year,
      expiration_month: validatedData.expiration_month,
      address: validatedData.address,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    // Use the private createCardToken method from the gateway
    const tokenResponse = await (gateway as any).createCardToken({
      ...validatedData,
      device_session_id: req.headers['x-device-session-id']
    });

    res.json({
      status: 'success',
      data: tokenResponse
    });

  } catch (error) {
    console.error('Token creation error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create card token'
    });
  }
});

/**
 * Process payment with card token
 * @route POST /api/payments/test/card
 */
router.post('/card', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = cardTokenPaymentSchema.parse(req.body);
    
    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGatewayForMethod('CREDIT_CARD');

    if (gateway.getGatewayInfo().provider !== validatedData.paymentGateway) {
      throw new Error(`Payment gateway ${validatedData.paymentGateway} is not enabled for credit card payments`);
    }

    // Log payment request (excluding sensitive data)
    console.log('Card Payment Request:', {
      gateway: validatedData.paymentGateway,
      amount: validatedData.amount,
      currency: validatedData.currency,
      description: validatedData.description,
      customer: {
        name: validatedData.customer.name,
        email: validatedData.customer.email
      },
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    const response = await (gateway as any).processCreditCardPayment(
      validatedData.amount,
      validatedData.currency,
      validatedData.tokenId,
      validatedData.customer,
      validatedData.deviceSessionId
    );

    res.json({
      status: 'success',
      data: response
    });

  } catch (error) {
    console.error('Card payment error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to process card payment'
    });
  }
});

/**
 * Process PSE Payment
 * @route POST /api/payments/test/pse
 */
router.post('/pse', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = psePaymentSchema.parse(req.body);
    
    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGatewayForMethod('PSE');

    if (gateway.getGatewayInfo().provider !== validatedData.paymentGateway) {
      throw new Error(`Payment gateway ${validatedData.paymentGateway} is not enabled for PSE payments`);
    }

    console.log('PSE Payment Request:', {
      gateway: validatedData.paymentGateway,
      ...validatedData,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    const pseRequest: PSEPaymentRequest = {
      amount: validatedData.amount,
      currency: validatedData.currency,
      description: validatedData.description,
      redirectUrl: validatedData.redirectUrl,
      customer: {
        name: validatedData.customer.name,
        last_name: validatedData.customer.last_name,
        email: validatedData.customer.email,
        phone_number: validatedData.customer.phone_number,
        requires_account: validatedData.customer.requires_account,
        address: {
          department: validatedData.customer.address.department,
          city: validatedData.customer.address.city,
          additional: validatedData.customer.address.additional
        }
      },
      metadata: validatedData.metadata
    };

    const response = await gateway.processPSEPayment(pseRequest);

    res.json({
      status: 'success',
      data: response
    });

  } catch (error) {
    console.error('PSE Payment error:', error);
    
    // Provide better error messages for validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }

    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to process PSE payment'
    });
  }
});


/**
 * Get PSE Banks for a specific gateway
 * @route GET /api/payments/test/banks/:gateway
 */
router.get('/banks/:gateway', async (req: Request, res: Response) => {
  try {
    const gateway = req.params.gateway as PaymentGateway;
    
    const gatewayService = PaymentGatewayService.getInstance();
    const paymentGateway = await gatewayService.getGateway(gateway);
    
    const banks = await paymentGateway.getBanks();
    
    res.json({
      status: 'success',
      data: banks
    });
  } catch (error) {
    console.error('Get banks error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get banks list'
    });
  }
});

/**
 * Get Transaction Status
 * @route GET /api/payments/test/status/:gateway/:transactionId
 */
router.get('/status/:gateway/:transactionId', async (req: Request, res: Response) => {
  try {
    const { gateway, transactionId } = req.params;
    
    const gatewayService = PaymentGatewayService.getInstance();
    const paymentGateway = await gatewayService.getGateway(gateway as PaymentGateway);
    
    const status = await paymentGateway.verifyTransaction(transactionId);
    
    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    console.error('Get transaction status error:', error);
    res.status(500).json({
      status: 'error', 
      message: error instanceof Error ? error.message : 'Failed to get transaction status'
    });
  }
});

/**
 * Test OpenPay authentication and configuration
 * @route POST /api/payments/test/auth/openpay
 */
router.post('/auth/openpay', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = testConfigSchema.parse(req.body);
    const requestInfo = PaymentTestDebugger.getRequestInfo(req);
    
    PaymentTestDebugger.logAuthTest(
      req.user?.id, 
      requestInfo.ipAddress,
      requestInfo.userAgent
    );

    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGateway('OPENPAY');
    const testResult = await gateway.testConnection();
    const gatewayInfo = gateway.getGatewayInfo();

    const response = {
      status: 'success',
      data: {
        test: testResult,
        gateway: {
          provider: gatewayInfo.provider,
          endpoint: gatewayInfo.endpoint?.replace(/\/v1\/?$/, ''),
          testMode: gatewayInfo.testMode,
          webhookConfigured: Boolean(gatewayInfo.webhookUrl)
        },
        request: {
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent,
          timestamp: new Date().toISOString(),
          userId: req.user?.id
        }
      }
    };

    console.log(PaymentTestDebugger.formatLogMessage('Auth Test Success:'), {
      userId: req.user?.id,
      gateway: response.data.gateway.provider,
      testMode: response.data.gateway.testMode,
      timestamp: new Date().toISOString()
    });

    res.json(response);

  } catch (error) {
    const errorDetails = PaymentTestDebugger.logError(error, 'OpenPay Auth Test');
    
    res.status(500).json({
      status: 'error',
      message: errorDetails.message,
      details: {
        timestamp: errorDetails.timestamp,
        type: errorDetails.type,
        path: '/api/payments/auth/openpay'
      }
    });
  }
});

/**
 * Get OpenPay configuration status
 * @route GET /api/payments/test/auth/openpay/status
 */
router.get('/auth/openpay/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestInfo = PaymentTestDebugger.getRequestInfo(req);
    const envInfo = PaymentTestDebugger.getEnvironmentInfo();

    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGateway('OPENPAY');
    const gatewayInfo = gateway.getGatewayInfo();
    const methodMappings = gatewayService.getMethodMappings();

    // Get enabled payment methods for OpenPay
    const enabledMethods = Array.from(methodMappings.entries())
      .filter(([_, gateway]) => gateway === 'OPENPAY')
      .map(([method]) => method);

    const status = {
      status: 'success',
      data: {
        provider: gatewayInfo.provider,
        testMode: gatewayInfo.testMode,
        webhookConfigured: Boolean(gatewayInfo.webhookUrl),
        enabledMethods,
        configuration: {
          endpointConfigured: Boolean(gatewayInfo.endpoint),
          credentialsConfigured: Boolean(envInfo.hasOpenpayKey && envInfo.hasOpenpaySecret),
          merchantConfigured: Boolean(envInfo.hasOpenpayMerchant)
        },
        timestamp: new Date().toISOString()
      }
    };

    PaymentTestDebugger.logConfigCheck(
      req.user?.id, 
      requestInfo.ipAddress, 
      status.data.configuration
    );

    res.json(status);

  } catch (error) {
    const errorDetails = PaymentTestDebugger.logError(error, 'OpenPay Status Check');
    
    res.status(500).json({
      status: 'error',
      message: errorDetails.message,
      details: {
        timestamp: errorDetails.timestamp,
        type: errorDetails.type,
        path: '/api/payments/test/auth/openpay/status'
      }
    });
  }
});

router.get('/status/:transactionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const gatewayService = PaymentGatewayService.getInstance();
    const gateway = await gatewayService.getGateway('OPENPAY');

    console.log('Checking payment status:', {
      transactionId,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    const status = await gateway.verifyTransaction(transactionId);

    res.json({
      status: 'success',
      data: {
        transactionId,
        paymentStatus: status.status,
        amount: status.amount,
        currency: status.currency,
        gatewayReference: status.gatewayReference,
        metadata: status.metadata
      }
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to check payment status'
    });
  }
});

/**
 * Webhook for payment status updates
 * @route POST /api/payments/test/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('Received webhook:', {
      body: req.body,
      headers: {
        'x-openpay-signature': req.headers['x-openpay-signature']
      },
      timestamp: new Date().toISOString()
    });

    // TODO: Verify webhook signature
    // TODO: Process payment status update
    // TODO: Update order status in your system

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});


export default router;