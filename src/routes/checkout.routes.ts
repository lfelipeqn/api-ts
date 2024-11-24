// routes/checkout.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { CheckoutService } from '../services/CheckoutService';
import { DeliveryType } from '../types/checkout';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { Order } from  '../models/Order';
import { Cart } from '../models/Cart';

const router = Router();
const checkoutService = CheckoutService.getInstance();

// Extended request type for checkout
interface CheckoutRequest extends AuthenticatedRequest {
  checkoutSession?: {
    id: string;
    cart_id: number;
    user_id: number | null;
    delivery_type: DeliveryType | null;
    delivery_address_id: number | null;
    pickup_agency_id: number | null;
    payment_method_id: number | null;
    created_at: Date;
    expires_at: Date;
  };
}

// Base schemas
const baseCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone_number: z.string().min(1, 'Phone number is required'),
  requires_account: z.boolean().optional()
});

// Card payment schema
const creditCardPaymentSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
  deviceSessionId: z.string().min(1, 'Device session ID is required'),
  customer: baseCustomerSchema
});

// PSE payment schema
const psePaymentSchema = z.object({
  redirectUrl: z.string().url('Valid redirect URL is required'),
  customer: baseCustomerSchema.extend({
    address: z.object({
      department: z.string().min(1, 'Department is required'),
      city: z.string().min(1, 'City is required'),
      additional: z.string().min(1, 'Additional address is required')
    }).optional()
  })
});

// Validation schemas
const initCheckoutSchema = z.object({
  // Remove cartId field - no longer needed
  // Add any other fields that might be needed in the future
}).optional();

const deliveryMethodSchema = z.object({
  type: z.enum(['SHIPPING', 'PICKUP']),
  addressId: z.number().optional(),
  agencyId: z.number().optional()
}).refine(data => {
  if (data.type === 'SHIPPING' && !data.addressId) {
    return false;
  }
  if (data.type === 'PICKUP' && !data.agencyId) {
    return false;
  }
  return true;
}, {
  message: "Must provide addressId for shipping or agencyId for pickup"
});

const paymentMethodSchema = z.object({
  paymentMethodId: z.number()
});

// Middleware to validate checkout session
const validateCheckoutSession = async (req: CheckoutRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.headers['x-checkout-session'];
    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Checkout session not found'
      });
    }

    const session = await checkoutService.getSession(sessionId as string);
    if (!session) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired checkout session'
      });
    }

    // Verify session belongs to authenticated user
    if (req.user && session.user_id && session.user_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Session does not belong to current user'
      });
    }

    req.checkoutSession = session;
    next();
  } catch (error) {
    next(error);
  }
};

// Specific error handling middleware for checkout routes
const checkoutErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Checkout error:', err);

  if (res.headersSent) {
    console.warn('Headers already sent, passing to default error handler');
    return next(err);
  }

  // Handle specific error types
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.errors
    });
  }

  if (err.name === 'SessionError') {
    return res.status(401).json({
      status: 'error',
      message: err.message
    });
  }

  // Default error response
  return res.status(500).json({
    status: 'error',
    message: err instanceof Error ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack
    })
  });
};

router.use(authMiddleware);

router.post('/init', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required'
      });
    }

    // Find user's active cart
    const cart = await Cart.findOne({
      where: {
        user_id: userId,
        status: 'active'
      }
    });

    if (!cart) {
      return res.status(404).json({
        status: 'error',
        message: 'No active cart found'
      });
    }

    // Validate cart has items
    const cartDetails = await cart.getDetails();
    if (!cartDetails?.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Cart is empty'
      });
    }

    // Create checkout session
    const session = await checkoutService.createSession(cart.id, userId);

    return res.json({
      status: 'success',
      data: {
        sessionId: session.id,
        expiresAt: session.expires_at,
        cart: {
          id: cart.id,
          items_count: cartDetails.length
        }
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Updated /delivery endpoint
router.post('/delivery', validateCheckoutSession, async (req: CheckoutRequest, res: Response, next: NextFunction) => {
  try {
    const { type, addressId, agencyId } = deliveryMethodSchema.parse(req.body);
    const session = req.checkoutSession!;

    if (type === 'SHIPPING' && addressId) {
      const address = await Address.findOne({
        where: { 
          id: addressId,
          user_id: req.user!.id
        }
      });

      if (!address) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid delivery address'
        });
      }
    }

    if (type === 'PICKUP' && agencyId) {
      const agency = await Agency.findByPk(agencyId);
      if (!agency) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid pickup agency'
        });
      }
    }

    const isValid = await checkoutService.validateDeliveryMethod(
      session.id,
      type,
      addressId,
      agencyId
    );

    if (!isValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery method configuration'
      });
    }

    const updatedSession = await checkoutService.updateSession(session.id, {
      delivery_type: type,
      delivery_address_id: addressId || null,
      pickup_agency_id: agencyId || null
    });

    return res.json({
      status: 'success',
      data: updatedSession
    });
  } catch (error) {
    return next(error);
  }
});

// Updated /payment endpoint
router.post('/payment', validateCheckoutSession, async (req: CheckoutRequest, res: Response, next: NextFunction) => {
  try {
    const { paymentMethodId } = paymentMethodSchema.parse(req.body);
    const session = req.checkoutSession!;

    const validation = await checkoutService.validatePaymentMethod(
      session.id,
      paymentMethodId
    );

    if (!validation.valid) {
      return res.status(400).json({
        status: 'error',
        message: validation.error || 'Invalid payment method',
        details: validation
      });
    }

    const updatedSession = await checkoutService.updateSession(session.id, {
      payment_method_id: paymentMethodId
    });

    return res.json({
      status: 'success',
      data: {
        session_id: updatedSession!.id,
        payment_method_id: updatedSession!.payment_method_id,
        delivery_type: updatedSession!.delivery_type,
        expires_at: updatedSession!.expires_at
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    return next(error);
  }
});

// Create order
router.post('/order', 
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response, next: NextFunction) => {
    try {
      const session = req.checkoutSession!;

      // Verify all required information is present
      if (!session.delivery_type || !session.payment_method_id || 
         (!session.delivery_address_id && !session.pickup_agency_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required checkout information'
        });
      }

      // Create order
      const order = await checkoutService.createOrder(session.id);

      // Get order summary
      const summary = await order.getOrderSummary();

      // Single return point
      return res.status(201).json({
        status: 'success',
        data: {
          orderId: order.id,
          summary
        }
      });
    } catch (error) {
      // Let error handling middleware deal with it
      return next(error);
    }
});


// Process payment
router.post('/process-payment/:orderId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseInt(req.params.orderId);

    // Find and validate order
    const order = await Order.findOne({
      where: { 
        id: orderId,
        user_id: req.user!.id 
      },
      include: [{
        model: PaymentMethodConfig,
        as: 'paymentMethod'
      }]
    });

    if (!order || !order.paymentMethod) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or payment method not configured'
      });
    }

    let validatedData;
    try {
      if (order.paymentMethod.type === 'CREDIT_CARD') {
        validatedData = creditCardPaymentSchema.parse(req.body);
      } else if (order.paymentMethod.type === 'PSE') {
        validatedData = psePaymentSchema.parse(req.body);
      } else {
        throw new Error(`Unsupported payment method: ${order.paymentMethod.type}`);
      }
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid payment data',
          errors: validationError.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      throw validationError;
    }

    // Process payment
    const paymentResponse = await checkoutService.processPayment(orderId, validatedData);

    // Update order state based on payment status
    const newOrderState = paymentResponse.status === 'APPROVED' ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED';
    await order.update({
      state: newOrderState,
    });

    return res.json({
      status: 'success',
      data: {
        payment: paymentResponse,
        paymentDetails: paymentResponse.paymentDetails,
        orderId: order.id,
        orderState: newOrderState // Return the correct order state
      }
    });

  } catch (error) {
    return next(error);
  }
});

router.use(checkoutErrorHandler);

export default router;