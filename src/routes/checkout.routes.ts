// routes/checkout.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { optional, z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { CheckoutService } from '../services/CheckoutService';
import { DeliveryType } from '../types/checkout';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { Order } from  '../models/Order';
import { Cart } from '../models/Cart';
import { getModels, getSequelize } from '../config/database';
import { CartDetail } from '../models/CartDetail';
import { GatewayConfig } from '../models/GatewayConfig';
import {CardPaymentRequestData, PSEPaymentRequestData } from '../services/CheckoutService'
import { User } from '../models/User';
import { Person } from '../models/Person';

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
  phone_number: z.string().optional(),
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
      const checkoutSessionId = req.headers['x-checkout-session'] as string;
      const checkoutService = CheckoutService.getInstance();
      const path = req.path;

      const session = await checkoutService.getSession(checkoutSessionId);

      if (!session) {
          return res.status(400).json({
              status: 'error',
              message: 'Invalid or expired checkout session'
          });
      }

      // Validate based on current step
      if (path.includes('/order')) {
          if (!session.payment_method_id) {
              return res.status(400).json({
                  status: 'error',
                  message: 'Payment method must be set before creating order',
                  required_step: 'payment'
              });
          }
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
router.post('/delivery', 
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response, next: NextFunction) => {
    const sequelize = getSequelize();
    const t = await sequelize.transaction();
    
    try {
      const { type, addressId, agencyId } = deliveryMethodSchema.parse(req.body);
      const session = req.checkoutSession!;
      const userId = req.user?.id;

      if (!userId) {
        await t.rollback();
        return res.status(401).json({
          status: 'error',
          message: 'User authentication required'
        });
      }

      // Validate address if shipping type
      if (type === 'SHIPPING' && addressId) {
        const address = await Address.findOne({
          where: { 
            id: addressId,
            user_id: userId
          }
        });

        if (!address) {
          await t.rollback();
          return res.status(400).json({
            status: 'error',
            message: 'Invalid delivery address'
          });
        }
      }

      // Update session with delivery information
      const updatedSession = await checkoutService.updateSession(session.id, {
        delivery_type: type,
        delivery_address_id: type === 'SHIPPING' ? addressId : null,
        pickup_agency_id: type === 'PICKUP' ? agencyId : null
      });

      await t.commit();

      return res.json({
        status: 'success',
        data: {
          session: updatedSession,
          next_step: 'payment'
        }
      });

    } catch (error) {
      await t.rollback();
      return next(error);
    }
});

// Add payment method endpoint
router.post('/payment', 
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response, next: NextFunction) => {
    const t = await getSequelize().transaction();
    
    try {
      const { paymentMethodId } = req.body;
      const session = req.checkoutSession!;

      // Validate payment method
      const paymentMethod = await PaymentMethodConfig.findOne({
        where: { 
          id: paymentMethodId,
          enabled: true
        },
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          where: { is_active: true }
        }]
      });

      if (!paymentMethod) {
        await t.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or inactive payment method'
        });
      }

      // Update session with payment method
      const updatedSession = await checkoutService.updateSession(session.id, {
        payment_method_id: paymentMethodId
      });

      await t.commit();

      return res.json({
        status: 'success',
        data: {
          session: updatedSession,
          next_step: 'order'
        }
      });

    } catch (error) {
      await t.rollback();
      return next(error);
    }
});

// Create order
router.post('/order', 
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response, next: NextFunction) => {
    const sequelize = getSequelize();
    const t = await sequelize.transaction();
    
    try {
      const session = req.checkoutSession!;
      const userId = req.user?.id;

      if (!userId) {
        await t.rollback();
        return res.status(401).json({
          status: 'error',
          message: 'User ID is required'
        });
      }

      // Find the active cart
      const cart = await Cart.findOne({
        where: {
          id: session.cart_id,
          user_id: userId,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }],
        transaction: t,
        lock: true
      });

      if (!cart) {
        await t.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Active cart not found'
        });
      }

      // Get cart summary for initial amounts
      const cartSummary = await cart.getSummary();

      // Validate required checkout fields
      if (!session.delivery_type || !session.payment_method_id) {
        await t.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Missing required delivery type or payment method'
        });
      }

      // Create order with explicit type safety
      const orderData = {
        user_id: userId,
        cart_id: cart.id,
        delivery_type: session.delivery_type,
        delivery_address_id: session.delivery_address_id || null,
        pickup_agency_id: session.pickup_agency_id || null,
        state: 'PENDING' as const,
        payment_method_id: session.payment_method_id,
        currency: 'COP' as const,
        total_amount: Number(cartSummary.total),
        subtotal_amount: Number(cartSummary.subtotal),
        shipping_amount: 0,
        discount_amount: Number(cartSummary.totalDiscount),
        tax_amount: 0
      };

      const order = await Order.create(orderData, { transaction: t });

      // Process cart and create order details
      await order.createFromCart(cart, t);

      // Commit transaction
      await t.commit();

      // Get order summary
      const summary = await order.getOrderSummary();

      return res.status(201).json({
        status: 'success',
        data: {
          orderId: order.id,
          summary
        }
      });
    } catch (error) {
      await t.rollback();
      console.error('Error creating order:', error);
      return next(error);
    }
});


// Process payment
router.post('/process-payment/:orderId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseInt(req.params.orderId);

    // Include User and Person models in the order query
    const order = await Order.findOne({
      where: { 
        id: orderId,
        user_id: req.user!.id 
      },
      include: [{
        model: PaymentMethodConfig,
        as: 'paymentMethod'
      }, {
        model: User,
        as: 'user',
        include: [{
          model: Person,
          as: 'person',
          attributes: ['cell_phone_1']
        }]
      }]
    });

    if (!order || !order.paymentMethod) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or payment method not configured'
      });
    }

    // Get phone number from Person model
    const phoneNumber = order.user?.person?.cell_phone_1;
    if (!phoneNumber) {
      return res.status(400).json({
        status: 'error',
        message: 'User phone number not found'
      });
    }

    let validatedData: CardPaymentRequestData | PSEPaymentRequestData;

    try {
      if (order.paymentMethod.type === 'CREDIT_CARD') {
        const data = creditCardPaymentSchema.parse(req.body);
        validatedData = {
          tokenId: data.tokenId,
          deviceSessionId: data.deviceSessionId,
          customer: {
            name: data.customer.name,
            last_name: data.customer.last_name,
            email: data.customer.email,
            phone_number: phoneNumber,
            requires_account: data.customer.requires_account
          }
        } as CardPaymentRequestData;
      } else if (order.paymentMethod.type === 'PSE') {
        const data = psePaymentSchema.parse(req.body);
        validatedData = {
          redirectUrl: data.redirectUrl,
          customer: {
            name: data.customer.name,
            last_name: data.customer.last_name,
            email: data.customer.email,
            phone_number: phoneNumber,
            requires_account: data.customer.requires_account,
            address: data.customer.address
          }
        } as PSEPaymentRequestData;
      } else {
        throw new Error(`Unsupported payment method: ${order.paymentMethod.type}`);
      }

      const paymentResponse = await checkoutService.processPayment(orderId, validatedData);

      const newOrderState = paymentResponse.status === 'APPROVED' ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED';
      await order.update({ state: newOrderState });

      return res.json({
        status: 'success',
        data: {
          payment: paymentResponse,
          paymentDetails: paymentResponse.paymentDetails,
          orderId: order.id,
          orderState: newOrderState
        }
      });

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
  } catch (error) {
    return next(error);
  }
});

// Add this route to checkout.routes.ts after the existing imports

router.get('/:sessionId/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const session = await checkoutService.getSession(sessionId);

    if (!session) {
      return res.json({
        status: 'success',
        data: {
          isValid: false,
          status: 'NOT_FOUND',
          message: 'Checkout session not found'
        }
      });
    }

    // Verify session belongs to authenticated user
    if (session.user_id !== userId) {
      return res.json({
        status: 'success',
        data: {
          isValid: false,
          status: 'UNAUTHORIZED',
          message: 'Session does not belong to current user'
        }
      });
    }

    // Check if session is expired
    const now = new Date();
    const isExpired = session.expires_at < now;

    // Get cart to check if it's still valid
    const cart = await Cart.findByPk(session.cart_id);
    const isCartActive = cart?.status === 'active';

    if (isExpired) {
      return res.json({
        status: 'success',
        data: {
          isValid: false,
          status: 'EXPIRED',
          message: 'Checkout session has expired',
          expiredAt: session.expires_at
        }
      });
    }

    if (!isCartActive) {
      return res.json({
        status: 'success',
        data: {
          isValid: false,
          status: 'INVALID_CART',
          message: 'Associated cart is no longer active'
        }
      });
    }

    // Session is valid, return complete status
    return res.json({
      status: 'success',
      data: {
        isValid: true,
        status: 'ACTIVE',
        session: {
          id: session.id,
          cart_id: session.cart_id,
          delivery_type: session.delivery_type,
          delivery_address_id: session.delivery_address_id,
          pickup_agency_id: session.pickup_agency_id,
          payment_method_id: session.payment_method_id,
          created_at: session.created_at,
          expires_at: session.expires_at
        }
      }
    });

  } catch (error) {
    console.error('Error validating checkout session:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to validate checkout session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.use(checkoutErrorHandler);

export default router;