import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { CartSessionManager } from '../services/CartSessionManager';
import { getModels, getSequelize } from '../config/database';
import { Transaction, Op } from 'sequelize';
import { CartStatus } from '../types/cart';
import { UserSessionManager } from '../services/UserSessionManager';
import { CartDetail } from '../models/CartDetail';

const router = Router();

// Validation schemas
const addToCartSchema = z.object({
  product_id: z.number().positive(),
  quantity: z.number().positive(),
});

const updateQuantitySchema = z.object({
  quantity: z.number().min(0),
});


interface UserSession {
  id: number;          // The user's ID
  email: string;
  state: string;
  person_id: number;
  agency_id: number | null;
  product_line_id: number | null;
  created_at: Date;
}

// Define request interface with cart

interface CartRequest extends Request {
  cart?: any;
  user?: any;
}

const logCartLookup = async (
  userId: number | undefined,
  sessionId: string | undefined,
  cart: any,
  source: string
) => {
  console.log('Cart lookup attempt:', {
    source,
    userId,
    sessionId,
    cartFound: !!cart,
    cartId: cart?.id
  });
};

const optionalAuth = async (req: CartRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  try {
    const { User } = getModels();
    const sessionManager = UserSessionManager.getInstance();
    const sessionToken = authHeader.replace('Bearer ', '');
    const session = await sessionManager.getSession(sessionToken);

    if (session) {
      const user = await User.findByPk(session.id); // Use session.id which represents the user's ID
      if (user && user.isActive()) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    console.error('Error in optional auth:', error);
    next();
  }
};


// Updated middleware to use models from database config
const getOrCreateCart = async (req: CartRequest & AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { Cart, CartDetail } = getModels();
  const sequelize = getSequelize();
  let transaction: Transaction | undefined;
  
  try {
    const sessionManager = CartSessionManager.getInstance();
    let sessionId = req.headers['x-cart-session'] as string;
    const userId = req.user?.id;

    console.log('Cart middleware debug info:', { 
      userId,
      sessionId,
      authHeader: req.headers.authorization,
      isAuthenticated: !!req.user,
      method: req.method,
      path: req.path
    });

    transaction = await sequelize.transaction();

    let cart = null;

    // Priority 1: For authenticated users, first try to find their active cart
    if (userId) {
      cart = await Cart.findOne({
        where: {
          user_id: userId,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }],
        transaction
      });

      // If guest cart exists and user just logged in, handle merging
      if (sessionId && !cart) {
        const guestCart = await Cart.findOne({
          where: {
            session_id: sessionId,
            status: 'active',
            user_id: null
          },
          include: [{
            model: CartDetail,
            as: 'details'
          }],
          transaction
        });

        if (guestCart) {
          // Convert guest cart to user cart
          await guestCart.update({
            user_id: userId,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          }, { transaction });

          cart = guestCart;
          
          // Update the session in Redis
          await sessionManager.updateSession(sessionId, {
            cart_id: cart.id,
            user_id: userId,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          });
        }
      }
    }

    // Priority 2: For guest users or if no user cart found, try to find cart by session
    if (!cart && sessionId) {
      cart = await Cart.findOne({
        where: {
          session_id: sessionId,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }],
        transaction
      });
    }

    // Create new cart if needed and it's not a GET request
    if (!cart && req.method !== 'GET') {
      // Generate new session ID for guest users if needed
      if (!userId && !sessionId) {
        sessionId = sessionManager.generateSessionId();
      }

      cart = await Cart.create({
        user_id: userId || null,
        session_id: sessionId,
        status: 'active',
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      }, { transaction });

      await sessionManager.createSession(cart.id, userId, sessionId);
      console.log('Created new cart:', { cartId: cart.id, sessionId: cart.session_id });
    }

    // Always send session ID in response header if we have a cart
    if (cart) {
      res.set('X-Cart-Session', cart.session_id);
    }

    await transaction.commit();
    req.cart = cart;

    // For GET requests with no cart, return empty response with session ID if available
    if (!cart && req.method === 'GET') {
      return res.json({
        status: 'success',
        data: {
          session_id: sessionId || '',
          total: 0,
          subtotal: 0,
          totalDiscount: 0,
          items: []
        }
      });
    }

    // Ensure Redis session exists
    if (cart) {
      await sessionManager.ensureSession(cart.id, cart.session_id, cart.user_id);
    }

    next();
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error('Error in getOrCreateCart middleware:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process cart',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update the GET cart route to always include session_id
router.get('/cart', 
  async (req: CartRequest & AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Changed this to properly handle auth token
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader);

    if (authHeader) {
      try {
        await authMiddleware(req as AuthenticatedRequest, res, next);
      } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
          status: 'error',
          message: 'Authentication failed'
        });
      }
    } else {
      next();
    }
  },
  async (req: CartRequest & AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Log auth state after middleware
    console.log('After auth middleware:', {
      isAuthenticated: !!req.user,
      userId: req.user?.id,
      authHeader: req.headers.authorization
    });
    next();
  },
  getOrCreateCart,
  async (req: CartRequest & AuthenticatedRequest, res: Response) => {
    try {
      console.log('GET cart handler - Auth state:', {
        isAuthenticated: !!req.user,
        userId: req.user?.id,
        cartExists: !!req.cart,
        cartId: req.cart?.id,
        cartUserId: req.cart?.user_id,
        cartSessionId: req.cart?.session_id
      });

      if (!req.cart) {
        if (req.user) {
          // If authenticated but no cart found, look up cart directly
          const { Cart, CartDetail } = getModels();
          const userCart = await Cart.findOne({
            where: {
              user_id: req.user.id,
              status: 'active'
            },
            include: [{
              model: CartDetail,
              as: 'details'
            }]
          });

          if (userCart) {
            console.log('Found user cart on second lookup:', userCart.id);
            req.cart = userCart;
          }
        }

        // If still no cart, return empty response
        if (!req.cart) {
          return res.json({
            status: 'success',
            data: {
              session_id: req.headers['x-cart-session'] as string || '',
              total: 0,
              subtotal: 0,
              totalDiscount: 0,
              items: []
            }
          });
        }
      }

      // Ensure cart session exists in Redis
      const sessionManager = CartSessionManager.getInstance();
      await sessionManager.ensureSession(
        req.cart.id,
        req.cart.session_id,
        req.cart.user_id
      );

      const summary = await req.cart.getSummary();
      console.log('Cart summary:', summary);
      
      res.json({
        status: 'success',
        data: {
          session_id: req.cart.session_id,
          ...summary
        }
      });
    } catch (error) {
      console.error('Error getting cart:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get cart contents'
      });
    }
});

// Add item to cart
router.post('/cart/items',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.headers.authorization) {
      return authMiddleware(req, res, next);
    }
    next();
  },
  getOrCreateCart,
  async (req: CartRequest & AuthenticatedRequest, res: Response) => {
    const { Product, CartDetail } = getModels();
    
    try {
      const { product_id, quantity } = req.body;

      // Validate product exists and is active
      const product = await Product.findOne({
        where: { id: product_id, state: true }
      });

      if (!product) {
        return res.status(404).json({
          status: 'error',
          message: 'Product not found or inactive'
        });
      }

      // Check stock availability
      const currentStock = await product.getCurrentStock();
      if (currentStock < quantity) {
        return res.status(400).json({
          status: 'error',
          message: 'Insufficient stock',
          data: { available: currentStock }
        });
      }

      const cart = req.cart;
      if (!cart) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create cart'
        });
      }

      await CartDetail.addToCart(cart.id, product_id, quantity);
      const summary = await cart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: cart.session_id,
          ...summary
        }
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to add item to cart'
      });
    }
});

// Update item quantity
router.put('/cart/items/:product_id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // If there's an auth token, validate it but don't require it
    if (req.headers.authorization) {
      return authMiddleware(req, res, next);
    }
    next();
  },
  getOrCreateCart,
  async (req: CartRequest & AuthenticatedRequest, res: Response) => {
    const { Cart, CartDetail } = getModels();
    const sequelize = getSequelize();
    let transaction: Transaction | undefined;
    
    try {
      const product_id = parseInt(req.params.product_id);
      const { quantity } = req.body;
      const userId = req.user?.id;
      const sessionId = req.headers['x-cart-session'] as string;

      // Start transaction
      transaction = await sequelize.transaction();

      // Find the active cart with priority
      let activeCart = null;

      // 1. Try to find authenticated user's cart
      if (userId) {
        activeCart = await Cart.findOne({
          where: {
            user_id: userId,
            status: 'active' as CartStatus
          },
          transaction
        });
      }

      // 2. If no user cart found and we have a session ID, try to find guest cart
      if (!activeCart && sessionId) {
        activeCart = await Cart.findOne({
          where: {
            session_id: sessionId,
            status: 'active' as CartStatus
          },
          transaction
        });
      }

      // 3. If still no cart found, use the cart from middleware
      if (!activeCart && req.cart) {
        activeCart = req.cart;
      }

      if (!activeCart) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'No active cart found'
        });
      }

      // Find the cart detail
      const detail = await CartDetail.findOne({
        where: {
          cart_id: activeCart.id,
          product_id
        },
        transaction
      });

      if (!detail) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Item not found in cart'
        });
      }

      // Update or remove item
      if (quantity === 0) {
        await detail.destroy({ transaction });
      } else {
        await detail.updateQuantity(quantity, transaction);
      }

      // Commit transaction
      await transaction.commit();

      // Get updated cart summary
      const summary = await activeCart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: activeCart.session_id,
          ...summary
        }
      });
    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error('Error updating cart item:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update cart item'
      });
    }
  }
);

// Delete cart item
router.delete('/cart/items/:product_id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // If there's an auth token, validate it but don't require it
    if (req.headers.authorization) {
      return authMiddleware(req, res, next);
    }
    next();
  },
  getOrCreateCart,
  async (req: CartRequest & AuthenticatedRequest, res: Response) => {
    const { Cart, CartDetail } = getModels();
    const sequelize = getSequelize();
    let transaction: Transaction | undefined;

    try {
      const product_id = parseInt(req.params.product_id);
      const userId = req.user?.id;
      const sessionId = req.headers['x-cart-session'] as string;

      // Start transaction
      transaction = await sequelize.transaction();

      let activeCart = null;

      // 1. Try to find authenticated user's cart
      if (userId) {
        activeCart = await Cart.findOne({
          where: {
            user_id: userId,
            status: 'active' as CartStatus
          },
          include: [{
            model: CartDetail,
            as: 'details'
          }],
          transaction
        });
        
        console.log('Found user cart:', activeCart?.id);
      }

      // 2. If no user cart found and we have a session ID, try to find guest cart
      if (!activeCart && sessionId) {
        activeCart = await Cart.findOne({
          where: {
            session_id: sessionId,
            status: 'active' as CartStatus
          },
          include: [{
            model: CartDetail,
            as: 'details'
          }],
          transaction
        });
        
        console.log('Found session cart:', activeCart?.id);
      }

      // 3. If still no cart found, use the cart from middleware
      if (!activeCart && req.cart) {
        activeCart = req.cart;
        console.log('Using middleware cart:', activeCart.id);
      }

      if (!activeCart) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'No active cart found'
        });
      }

      // Find the cart detail
      const detail = await CartDetail.findOne({
        where: {
          cart_id: activeCart.id,
          product_id
        },
        transaction
      });

      if (!detail) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Item not found in cart'
        });
      }

      // Delete the item
      await detail.destroy({ transaction });

      // Commit transaction
      await transaction.commit();

      // Get updated cart summary
      const summary = await activeCart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: activeCart.session_id,
          ...summary
        }
      });
    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error('Error deleting cart item:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete cart item'
      });
    }
  }
);

router.post('/cart/merge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const { Cart, CartDetail } = getModels();
    const sequelize = getSequelize();
    let transaction: Transaction | undefined;
    const sessionManager = CartSessionManager.getInstance();

    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      const guestSessionId = req.headers['x-cart-session'] as string;
      if (!guestSessionId) {
        return res.status(400).json({
          status: 'error',
          message: 'No guest cart session provided'
        });
      }

      const cartSession = await sessionManager.getSession(guestSessionId);
      if (!cartSession) {
        return res.status(404).json({
          status: 'error',
          message: 'Invalid cart session'
        });
      }

      transaction = await sequelize.transaction();

      // Find guest cart 
      const guestCart = await Cart.findOne({
        where: {
          id: cartSession.cart_id,
          status: 'active'
        },
        include: [{
          model: CartDetail,
          as: 'details'
        }],
        transaction,
        lock: true // Add lock to prevent race conditions
      });

      if (!guestCart) {
        await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Guest cart not found'
        });
      }

      // Find and update existing user cart to abandoned
      await Cart.update(
        { status: 'abandoned' },
        { 
          where: { 
            user_id: userId,
            status: 'active',
            id: { [Op.ne]: guestCart.id } // Don't update the guest cart
          },
          transaction 
        }
      );

      // Update guest cart with user ID while keeping active status
      await guestCart.update({
        user_id: userId,
        status: 'active', // Explicitly set status to remain active
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      }, { 
        transaction,
        fields: ['user_id', 'status', 'expires_at'] // Only update these fields
      });

      // Update Redis session
      await sessionManager.updateSession(guestSessionId, {
        cart_id: guestCart.id,
        user_id: userId,
        created_at: new Date(),
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      });

      await transaction.commit();

      const summary = await guestCart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: guestCart.session_id,
          ...summary
        }
      });

    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error('Cart merge error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to merge carts'
      });
    }
  }
);

router.get('/debug/promotions-priority/:productId', async (req, res) => {
  const { Promotion, Product } = getModels();
  try {
    const productId = parseInt(req.params.productId);

    const activePromotions = await Promotion.findAll({
      attributes: [
        'id', 
        'name', 
        'discount', 
        'state', 
        'type'
      ],
      where: {
        state: 'ACTIVE' // Only check for ACTIVE state
      },
      include: [{
        model: Product,
        as: 'products',
        where: { id: productId },
        attributes: [],
        through: {
          attributes: []
        }
      }]
    });

    res.json({
      status: 'success',
      data: {
        productId,
        promotionsCount: activePromotions.length,
        promotions: activePromotions.map(promo => ({
          id: promo.id,
          name: promo.name,
          type: promo.type,
          discount: promo.discount,
          state: promo.state
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching promotions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/debug/all-promotions/:productId', async (req, res) => {
  const { Promotion, Product } = getModels();
  try {
    const productId = parseInt(req.params.productId);

    const allPromotions = await Promotion.findAll({
      attributes: [
        'id', 
        'name', 
        'discount', 
        'state', 
        'type',
        'start_date',
        'end_date',
        'created_at',
        'updated_at'
      ],
      include: [{
        model: Product,
        as: 'products',
        where: { id: productId },
        attributes: [],
        through: {
          attributes: []
        }
      }]
    });

    res.json({
      status: 'success',
      data: {
        productId,
        promotionsCount: allPromotions.length,
        promotions: allPromotions.map(promo => ({
          id: promo.id,
          name: promo.name,
          type: promo.type,
          discount: promo.discount,
          state: promo.state,
          start_date: promo.start_date,
          end_date: promo.end_date,
          created_at: promo.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching all promotions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching all promotions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug route to check cart details
router.get('/debug/cart-details',
  getOrCreateCart,
  async (req: CartRequest, res: Response) => {
    try {
      if (!req.cart) {
        return res.status(400).json({
          status: 'error',
          message: 'No cart found'
        });
      }

      const cart = req.cart;
      const details = await cart.getDetails({
        include: ['product', 'priceHistory']
      });

      res.json({
        status: 'success',
        data: {
          cart: {
            id: cart.id,
            user_id: cart.user_id,
            session_id: cart.session_id,
            status: cart.status,
            expires_at: cart.expires_at,
            created_at: cart.created_at
          },
          details: details.map((detail:any) => ({
            id: detail.id,
            product_id: detail.product_id,
            quantity: detail.quantity,
            price_history_id: detail.price_history_id
          })),
          auth: {
            isAuthenticated: !!(req as AuthenticatedRequest).user,
            userId: (req as AuthenticatedRequest).user?.id
          },
          session: {
            hasSession: !!req.headers['x-cart-session'],
            sessionId: req.headers['x-cart-session']
          }
        }
      });
    } catch (error) {
      console.error('Error in cart debug route:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get cart debug info'
      });
    }
});

// Debug route to check cart session
router.get('/debug/cart-session/:sessionId', async (req, res) => {
  try {
    const sessionManager = CartSessionManager.getInstance();
    const sessionData = await sessionManager.getSession(req.params.sessionId);

    res.json({
      status: 'success',
      data: {
        sessionId: req.params.sessionId,
        sessionData
      }
    });
  } catch (error) {
    console.error('Error checking cart session:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get cart session info'
    });
  }
});

router.get('/debug/auth-test',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('Debug auth - Request user:', req.user);
      
      const { User } = getModels();
      const user = await User.findByPk(req.user?.id, {
        logging: console.log
      });

      res.json({
        status: 'success',
        data: {
          requestUser: req.user,
          dbUser: user?.toJSON()
        }
      });
    } catch (error) {
      console.error('Error in auth test:', error);
      res.status(500).json({
        status: 'error',
        message: 'Auth test failed'
      });
    }
});

router.get('/debug/cart-sessions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionManager = CartSessionManager.getInstance();
      const userId = req.user?.id;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID not found'
        });
      }

      const sessions = await sessionManager.findCartSessionsByUserId(userId);
      
      res.json({
        status: 'success',
        data: {
          userId,
          sessions
        }
      });
    } catch (error) {
      console.error('Error getting cart sessions:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get cart sessions'
      });
    }
});


export default router;