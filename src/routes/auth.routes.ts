// src/routes/auth.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { getModels, getSequelize } from '../config/database';
import { z } from 'zod';
import { User } from '../models/User';
import { Person } from '../models/Person';
import { PasswordHandler } from '../services/PasswordHandler';
import { Transaction } from 'sequelize';
import { RoleService } from '../services/RoleService';

import { Order } from '../models/Order';
import { OrderPriceHistory } from '../models/OrderPriceHistory';
import { Product } from '../models/Product';
import { Payment } from '../models/Payment';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { City } from '../models/City';
import { Department } from '../models/Department';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';

const router = Router();
const roleService = RoleService.getInstance();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const registerSchema = z.object({
  person: z.object({
    first_name: z.string().min(2, 'First name must be at least 2 characters'),
    last_name: z.string().min(2, 'Last name must be at least 2 characters'),
    identification_type: z.enum(['C.C', 'C.E', 'PAS', 'NIT']),
    identification_number: z.string().min(5, 'Invalid identification number'),
    cell_phone_1: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
    cell_phone_1_whatsapp: z.boolean().default(true),
    email: z.string().email('Invalid email address')
  }),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number')
});

const activationSchema = z.object({
  token: z.string().min(1, 'Activation token is required'),
  email: z.string().email('Invalid email address')
});

// Add this validation schema at the top with other schemas
const resetPasswordSchema = z.object({
  userId: z.number(),
  token: z.string(),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number')
});

/**
 * Middleware to validate request body against a schema
 */
const validateRequest = (schema: z.ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await schema.parseAsync(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
      return;
    }
    next(error);
  }
};

/**
 * @route POST /api/auth/login
 * @desc Authenticate user & get session token
 * @access Public
 */
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { User } = getModels();

    const user = await User.findOne({
      where: { email },
      include: [{
        association: 'person',
        attributes: ['first_name', 'last_name']
      }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials'
        }
      });
    }

    if (!user.isActive()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is not active',
          state: user.state
        }
      });
    }

    const { isValid, requiresNewPassword } = await user.verifyPassword(password);

    if (requiresNewPassword) {
      const resetToken = await user.createPasswordResetToken();
      
      return res.json({
        success: false,
        error: {
          code: 'PASSWORD_RESET_REQUIRED',
          message: 'Password reset required'
        },
        data: {
          userId: user.id,
          email: user.email,
          resetToken,
          name: user.person?.first_name || null
        }
      });
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials'
        }
      });
    }

    const sessionId = await user.createSession();
    const userInfo = await user.getInfo();

    return res.status(200).json({
      success: true,
      data: {
        token: sessionId,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          person: userInfo.person ? {
            first_name: userInfo.person.first_name,
            last_name: userInfo.person.last_name,
          } : null,
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during login'
      }
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user & destroy session
 * @access Protected
 */
router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionToken = req.sessionId;
    
    if (!sessionToken) {
      return res.status(401).json({
        status: 'error',
        message: 'No session token provided'
      });
    }

    const sessionManager = UserSessionManager.getInstance();
    await sessionManager.destroySession(sessionToken);

    res.status(200).json({
      status: 'success',
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during logout'
    });
  }
});

// Add these new routes
router.post('/reset-password', validateRequest(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { userId, token, newPassword } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Log the password reset attempt
    console.log('Password reset attempt:', {
      userId,
      hasToken: !!token,
      passwordLength: newPassword.length
    });

    // Attempt to reset the password
    const success = await user.resetPassword(token, newPassword);
    
    if (!success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    // Log successful password reset
    console.log('Password reset successful:', {
      userId,
      newHashPrefix: user.password.substring(0, 4)
    });

    res.json({
      status: 'success',
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password'
    });
  }
});

// Add a route to verify if a reset token is valid (optional but useful)
router.post('/verify-reset-token', async (req: Request, res: Response) => {
  try {
    const { userId, token } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const isValid = user.isValidResetToken(token);

    res.json({
      status: 'success',
      data: {
        isValid
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify reset token'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user information
 * @access Protected
 */
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const userInfo = await user.getInfo();

    res.json({
      status: 'success',
      data: {
        user: {
          id: userInfo.id,
          email: userInfo.email,
          person: userInfo.person ? {
            first_name: userInfo.person.first_name,
            last_name: userInfo.person.last_name,
          } : null,
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching user information'
    });
  }
});

/**
 * @route POST /api/auth/register
 * @desc Register a new user and send activation token
 * @access Public
 */
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  const sequelize = getSequelize();
  let transaction: Transaction | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  async function attemptRegistration() {
    try {
      transaction = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED // Less strict isolation level
      });

      // Check if email already exists
      const existingUser = await User.findOne({
        where: { email: req.body.person.email },
        include: ['person'],
        transaction,
        lock: Transaction.LOCK.UPDATE
      });

      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Create person record
      const person = await Person.create({
        ...req.body.person,
        cell_phone_2: null,
        cell_phone_2_whatsapp: false,
        address: null,
        shoe_size: null,
        pants_size: null,
        shirt_size: null,
        file_id: null,
        curriculum_vitae_id: null,
        dni_id: null
      }, { transaction });

      // Create user with pending state
      const user = await User.create({
        email: req.body.person.email,
        password: req.body.password,
        state: 'PENDING',
        person_id: person.id,
        schedule_code: null,
        identity_verified_at: null,
        agency_id: null,
        product_line_id: null,
        social_network_name: null,
        social_network_user_id: null,
        city_id: null,
        user_id: null,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      // Assign default customer role to the user
      await roleService.assignDefaultRoleToUser(user, transaction);

      // Generate token in a separate operation after commit
      await transaction.commit();
      transaction = null;

      // Generate activation token after transaction is committed
      const token = await PasswordHandler.generateResetToken();
      await user.update({
        token: JSON.stringify({
          token,
          created_at: new Date()
        })
      });

      const response: any = {
        status: 'success',
        message: 'Registration successful. Please check your email and WhatsApp for activation instructions.',
        data: {
          user_id: user.id,
          email: user.email
        }
      };

      if (process.env.NODE_ENV === 'development') {
        response.data.activation_token = token;
      }

      return response;
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }

  try {
    let response;
    while (retryCount < MAX_RETRIES) {
      try {
        response = await attemptRegistration();
        break;
      } catch (error: any) {
        retryCount++;
        if (error.name === 'SequelizeDatabaseError' && 
            error.parent?.code === 'ER_LOCK_WAIT_TIMEOUT' && 
            retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
          continue;
        }
        throw error;
      }
    }

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Email already registered') {
        return res.status(409).json({
          status: 'error',
          message: 'Email already registered'
        });
      }
    }
    next(error);
  }
});

/**
 * @route POST /api/auth/activate
 * @desc Activate user account with token
 * @access Public
 */
router.post('/activate', validateRequest(activationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token } = req.body;

    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (user.state !== 'PENDING') {
      return res.status(400).json({
        status: 'error',
        message: 'Account is already activated or invalid state'
      });
    }

    if (!user.isValidResetToken(token)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired activation token'
      });
    }

    await user.update({
      state: 'ACTIVE',
      token: null
    });

    res.json({
      status: 'success',
      message: 'Account activated successfully'
    });

  } catch (error) {
    next(error);
  }
});

router.get('/orders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await Order.findAll({
      where: { user_id: req.user!.id },
      include: [
        {
          model: Payment,
          as: 'lastPayment',
          attributes: ['id', 'state', 'state_description']
        },
        {
          model: PaymentMethodConfig,
          as: 'paymentMethod',
          attributes: ['id', 'name', 'type']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    const formattedOrders = orders.map(order => ({
      id: order.id,
      state: order.state,
      total_amount: Number(order.total_amount),
      delivery_type: order.delivery_type,
      created_at: order.created_at,
      payment: {
        state: order.lastPayment?.state,
        description: order.lastPayment?.state_description
      },
      payment_method: order.paymentMethod ? {
        name: order.paymentMethod.name,
        type: order.paymentMethod.type
      } : null
    }));

    res.json({
      status: 'success',
      data: formattedOrders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch orders'
    });
  }
});

// Get detailed information for a specific order
router.get('/orders/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await Order.findOne({
      where: { 
        id: req.params.id,
        user_id: req.user!.id 
      },
      include: [
        {
          model: OrderPriceHistory,
          as: 'orderPriceHistories',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'reference']
          }]
        },
        {
          model: Payment,
          as: 'lastPayment',
          attributes: ['id', 'state', 'state_description', 'created_at']
        },
        {
          model: PaymentMethodConfig,
          as: 'paymentMethod',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Address,
          as: 'deliveryAddress',
          include: [{
            model: City,
            as: 'city',
            include: [{
              model: Department,
              as: 'department'
            }]
          }]
        },
        {
          model: Agency,
          as: 'pickupAgency',
          include: [{
            model: Address,
            as: 'address',
            include: [{
              model: City,
              as: 'city',
              include: [{
                model: Department,
                as: 'department'
              }]
            }]
          }]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Get order summary with product details
    const summary = await order.getOrderSummary();

    const response = {
      id: order.id,
      state: order.state,
      delivery_type: order.delivery_type,
      delivery_info: order.delivery_type === 'SHIPPING' ? {
        address: order.deliveryAddress ? {
          detail: order.deliveryAddress.detail,
          city: order.deliveryAddress.city?.name,
          department: order.deliveryAddress.city?.department?.name
        } : null
      } : {
        agency: order.pickupAgency ? {
          name: order.pickupAgency.magister_cellar,
          address: order.pickupAgency.address?.detail,
          city: order.pickupAgency.address?.city?.name
        } : null
      },
      payment: {
        method: order.paymentMethod?.name,
        type: order.paymentMethod?.type,
        state: order.lastPayment?.state,
        description: order.lastPayment?.state_description,
        date: order.lastPayment?.created_at
      },
      amounts: {
        subtotal: Number(order.subtotal_amount),
        shipping: Number(order.shipping_amount),
        discount: Number(order.discount_amount),
        tax: Number(order.tax_amount),
        total: Number(order.total_amount)
      },
      created_at: order.created_at,
      items: summary.items
    };

    res.json({
      status: 'success',
      data: response
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch order details'
    });
  }
});

export default router;