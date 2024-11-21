import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { GatewayConfig } from '../models/GatewayConfig';
import { 
  PaymentMethodType, 
  PSEPaymentRequest, 
  PaymentGateway, 
  CreditCardPaymentRequest,
  PaymentCustomer,
  PAYMENT_GATEWAYS,
  
} from '../types/payment';

const router = Router();

interface PaymentMethodResponse {
  id: number;
  type: string;
  name: string;
  description: string | null;
  min_amount: number | null;
  max_amount: number | null;
  gateway: string;
  gateway_name: string;
  test_mode: boolean;
  enabled: boolean;
}

const cardTokenRequestSchema = z.object({
  card_number: z.string()
    .min(13, 'Card number must be at least 13 digits')
    .max(19, 'Card number must not exceed 19 digits')
    .regex(/^\d+$/, 'Card number must contain only digits'),
  holder_name: z.string()
    .min(3, 'Holder name must be at least 3 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Holder name must contain only letters and spaces'),
  expiration_year: z.string()
    .length(2, 'Expiration year must be 2 digits')
    .regex(/^\d{2}$/, 'Expiration year must be 2 digits'),
  expiration_month: z.string()
    .length(2, 'Expiration month must be 2 digits')
    .regex(/^(0[1-9]|1[0-2])$/, 'Expiration month must be between 01 and 12'),
  cvv2: z.string()
    .min(3, 'CVV must be at least 3 digits')
    .max(4, 'CVV must not exceed 4 digits')
    .regex(/^\d+$/, 'CVV must contain only digits'),
  address: z.object({
    city: z.string().min(1, 'City is required'),
    country_code: z.string().length(2, 'Country code must be 2 characters').default('CO'),
    postal_code: z.string().min(1, 'Postal code is required'),
    line1: z.string().min(1, 'Address line 1 is required'),
    line2: z.string().optional(),
    line3: z.string().optional(),
    state: z.string().min(1, 'State is required')
  })
});

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

// Error handling middleware
const errorHandler = (err: any, req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.error('Payment route error:', {
    error: err,
    userId: req.user?.id,
    path: req.path,
    method: req.method
  });

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.errors
    });
  }

  if (err.name === 'PaymentGatewayError') {
    return res.status(402).json({
      status: 'error',
      message: err.message
    });
  }

  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Payment processing error'
  });
};

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
 * @route GET /api/payments/methods
 * @requires authentication
 */
router.get('/methods',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const methods = await PaymentMethodConfig.findAll({
        where: { enabled: true },
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          where: { is_active: true },
          attributes: ['gateway', 'name', 'test_mode'],
          required: true // This ensures gatewayConfig is not null
        }],
        order: [['name', 'ASC']]
      });

      const processedMethods = methods
        .filter(method => method.gatewayConfig) // Extra safety check
        .map(method => ({
          id: method.id,
          type: method.type,
          name: method.name,
          description: method.description,
          min_amount: method.min_amount,
          max_amount: method.max_amount,
          gateway: method.gatewayConfig!.gateway, // Safe to use ! because of filter
          gateway_name: method.gatewayConfig!.name,
          test_mode: method.gatewayConfig!.test_mode,
          enabled: method.enabled
        }));

      res.json({
        status: 'success',
        data: processedMethods
      });

    } catch (error) {
      next(error);
    }
});

/**
 * Get a specific payment method
 * @route GET /api/payments/methods/:id
 * @requires authentication
 */
router.get('/methods/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const method = await PaymentMethodConfig.findOne({
        where: { 
          id: req.params.id,
          enabled: true 
        },
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          where: { is_active: true },
          attributes: ['gateway', 'name', 'test_mode'],
          required: true
        }]
      });

      if (!method || !method.gatewayConfig) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment method not found or not available'
        });
      }

      const response: PaymentMethodResponse = {
        id: method.id,
        type: method.type,
        name: method.name,
        description: method.description,
        min_amount: method.min_amount,
        max_amount: method.max_amount,
        gateway: method.gatewayConfig.gateway,
        gateway_name: method.gatewayConfig.name,
        test_mode: method.gatewayConfig.test_mode,
        enabled: method.enabled
      };

      res.json({
        status: 'success',
        data: response
      });

    } catch (error) {
      next(error);
    }
});

/**
 * Validate if a payment method is available for an amount
 * @route POST /api/payments/methods/validate
 * @requires authentication
 */
router.post('/methods/validate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { method_id, amount } = req.body;

      const method = await PaymentMethodConfig.findOne({
        where: { 
          id: method_id,
          enabled: true 
        },
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          where: { is_active: true },
          required: true
        }]
      });

      if (!method || !method.gatewayConfig) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment method not found or not available'
        });
      }

      // Validate amount range
      const isValidAmount = (!method.min_amount || amount >= method.min_amount) &&
                          (!method.max_amount || amount <= method.max_amount);

      res.json({
        status: 'success',
        data: {
          valid: isValidAmount,
          method: {
            id: method.id,
            type: method.type,
            name: method.name,
            gateway: method.gatewayConfig.gateway,
            min_amount: method.min_amount,
            max_amount: method.max_amount
          },
          validation: {
            amount_in_range: isValidAmount,
            amount: amount,
            errors: !isValidAmount ? [
              method.min_amount && amount < method.min_amount ? 
                `Amount below minimum (${method.min_amount})` : undefined,
              method.max_amount && amount > method.max_amount ? 
                `Amount above maximum (${method.max_amount})` : undefined
            ].filter(Boolean) : []
          }
        }
      });

    } catch (error) {
      next(error);
    }
});

/**
 * Create a card token with Openpay
 * @route POST /api/payments/cards/tokens
 * @requires authentication
 */
router.post('/cards/tokens', 
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // First verify user is authenticated
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }
      const gatewayService = PaymentGatewayService.getInstance();
      const validatedData = cardTokenRequestSchema.parse(req.body);
      try {
        const gateway = await gatewayService.getTokenizationGateway('OPENPAY');
        const tokenResponse = await gateway.createCardToken(validatedData);
        res.json({
          status: 'success',
          data: {
            token_id: tokenResponse.id,
            card: {
              brand: tokenResponse.card.brand,
              type: tokenResponse.card.type,
              bank_name: tokenResponse.card.bank_name,
              holder_name: tokenResponse.card.holder_name,
              last_digits: tokenResponse.card.card_number.slice(-4),
              expiration_month: tokenResponse.card.expiration_month,
              expiration_year: tokenResponse.card.expiration_year
            }
          }
        });
      }catch(error){
        if (error instanceof Error && error.message.includes('does not support card tokenization')) {
          return res.status(400).json({
            status: 'error',
            message: 'Card tokenization is not supported by this payment gateway'
          });
        }
        throw error;
      }
    } catch (error) {
      next(error);
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

router.use(errorHandler);

export default router;