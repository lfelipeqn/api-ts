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
import { CreditCardPaymentRequest, PSEPaymentRequest } from '../types/payment';

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

const router = Router();
const checkoutService = CheckoutService.getInstance();

// Common customer schema
const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone_number: z.string().min(1, 'Phone number is required'),
  requires_account: z.boolean().optional()
});

// Schema for PSE customer with address
const pseCustomerSchema = customerSchema.extend({
  address: z.object({
    department: z.string().min(1, 'Department is required'),
    city: z.string().min(1, 'City is required'),
    additional: z.string().min(1, 'Address is required')
  }).optional()
});

// Credit card payment schema
const creditCardPaymentSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
  deviceSessionId: z.string().min(1, 'Device session ID is required'),
  customer: customerSchema
});

// PSE payment schema
const psePaymentSchema = z.object({
  redirectUrl: z.string().url('Valid redirect URL is required'),
  customer: pseCustomerSchema
});

// Combined payment schema that validates based on payment method
const paymentSchema = z.union([creditCardPaymentSchema, psePaymentSchema]);

// Validation schemas
const initCheckoutSchema = z.object({
  cartId: z.number()
});

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
};

router.post('/init', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cartId } = initCheckoutSchema.parse(req.body);
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
        id: cartId,
        user_id: userId,
        status: 'active'
      }
    });

    if (!cart) {
      return res.status(404).json({
        status: 'error',
        message: 'Active cart not found for user'
      });
    }

    // Create checkout session
    const session = await checkoutService.createSession(cartId, userId);

    res.json({
      status: 'success',
      data: {
        sessionId: session.id,
        expiresAt: session.expires_at
      }
    });
  } catch (error) {
    console.error('Error initializing checkout:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to initialize checkout'
    });
  }
});

router.use(authMiddleware);

// Set delivery method
router.post(
  '/delivery',
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response) => {
    try {
      const { type, addressId, agencyId } = deliveryMethodSchema.parse(req.body);
      const session = req.checkoutSession!;

      // Verify address belongs to user if shipping
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

      // Verify agency exists if pickup
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

      res.json({
        status: 'success',
        data: updatedSession
      });
    } catch (error) {
      console.error('Error setting delivery method:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to set delivery method'
      });
    }
});

// Set payment method
router.post(
  '/payment',
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response) => {
    try {
      const { paymentMethodId } = paymentMethodSchema.parse(req.body);
      const session = req.checkoutSession!;

      // Verify payment method is active
      const paymentMethod = await PaymentMethodConfig.findOne({
        where: { 
          id: paymentMethodId,
          enabled: true
        }
      });

      if (!paymentMethod) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid or inactive payment method'
        });
      }

      const isValid = await checkoutService.validatePaymentMethod(
        session.id,
        paymentMethodId
      );

      if (!isValid) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid payment method for this order'
        });
      }

      const updatedSession = await checkoutService.updateSession(session.id, {
        payment_method_id: paymentMethodId
      });

      res.json({
        status: 'success',
        data: updatedSession
      });
    } catch (error) {
      console.error('Error setting payment method:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to set payment method'
      });
    }
});

// Create order
router.post(
  '/order',
  validateCheckoutSession,
  async (req: CheckoutRequest, res: Response) => {
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

      const order = await checkoutService.createOrder(session.id);
      if (!order) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to create order'
        });
      }

      // Get order summary
      const summary = await order.getOrderSummary();

      res.status(201).json({
        status: 'success',
        data: {
          orderId: order.id,
          summary
        }
      });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create order'
      });
    }
});

// Process payment
router.post('/process-payment/:orderId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    // Debug request information
    console.log('Request headers:', req.headers);
    console.log('Request body type:', typeof req.body);
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));

    // Find the order and validate ownership
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

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    if (!order.paymentMethod) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment method not configured for order'
      });
    }

    console.log('Payment method type:', order.paymentMethod.type);
    console.log('Request body before validation:', {
      tokenId: req.body?.tokenId,
      deviceSessionId: req.body?.deviceSessionId,
      customer: req.body?.customer,
      hasBody: !!req.body
    });

    // Validate request data based on payment method
    let paymentData;
    try {
      if (order.paymentMethod.type === 'CREDIT_CARD') {
        const result = creditCardPaymentSchema.safeParse(req.body);
        
        if (!result.success) {
          console.log('Validation errors:', result.error.errors);
          return res.status(400).json({
            status: 'error',
            message: 'Invalid payment data',
            errors: result.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          });
        }
        
        paymentData = result.data;
      } else if (order.paymentMethod.type === 'PSE') {
        const result = psePaymentSchema.safeParse(req.body);
        
        if (!result.success) {
          console.log('Validation errors:', result.error.errors);
          return res.status(400).json({
            status: 'error',
            message: 'Invalid payment data',
            errors: result.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          });
        }
        
        paymentData = result.data;
      } else {
        throw new Error(`Unsupported payment method: ${order.paymentMethod.type}`);
      }

      console.log('Validated payment data:', {
        method: order.paymentMethod.type,
        hasPaymentData: !!paymentData,
        amount: order.total_amount,
        currency: order.currency
      });

      // Process payment using checkout service
      const paymentResponse = await checkoutService.processPayment(orderId, paymentData);

      // Return response with payment and order details
      return res.json({
        status: 'success',
        data: {
          payment: paymentResponse,
          paymentDetails: paymentResponse.paymentDetails,
          orderId: order.id,
          orderState: order.state
        }
      });

    } catch (validationError) {
      console.error('Validation or processing error:', validationError);
      
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
    console.error('Payment processing error:', error);
    
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to process payment',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});



export default router;