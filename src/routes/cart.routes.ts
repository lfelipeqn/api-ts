import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { CartSessionManager } from '../services/CartSessionManager';
import { getModels, getSequelize } from '../config/database';
import { Transaction } from 'sequelize';
import { CartStatus } from '../types/cart';

const router = Router();

// Validation schemas
const addToCartSchema = z.object({
  product_id: z.number().positive(),
  quantity: z.number().positive(),
});

const updateQuantitySchema = z.object({
  quantity: z.number().min(0),
});

// Define request interface with cart
interface CartRequest extends Request {
  cart?: any; // Will be properly typed when we get the model
}

// Updated middleware to use models from database config
const getOrCreateCart = async (req: CartRequest, res: Response, next: NextFunction) => {
  const { Cart, Product, PriceHistory } = getModels();
  const sequelize = getSequelize();
  let transaction: Transaction | undefined;
  
  try {
    const sessionManager = CartSessionManager.getInstance();
    let sessionId = req.headers['x-cart-session'] as string;
    let cartSession = null;
    
    if (sessionId) {
      cartSession = await sessionManager.getSession(sessionId);
    }

    // If user is authenticated, try to find their active cart
    const userId = (req as AuthenticatedRequest).user?.id;
    let cart = null;

    if (userId) {
      cart = await Cart.findOne({
        where: {
          user_id: userId,
          status: 'active' as CartStatus
        }
      });
    }

    // If no user cart and we have a valid session, get that cart
    if (!cart && cartSession) {
      cart = await Cart.findByPk(cartSession.cart_id);
    }

    // If still no cart, create a new one with proper session ID
    if (!cart) {
      transaction = await sequelize.transaction();

      try {
        // Generate session ID first
        sessionId = sessionManager.generateSessionId();

        // Create cart with all required fields
        cart = await Cart.create({
          user_id: userId || null,
          session_id: sessionId,
          status: 'active' as CartStatus,
          expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        }, { transaction });

        // Create the session in Redis
        await sessionManager.createSession(cart.id, userId, sessionId);

        await transaction.commit();

        // Include new session ID in response
        res.set('X-Cart-Session', sessionId);
      } catch (error) {
        if (transaction) await transaction.rollback();
        throw error;
      }
    }

    // Add cart to request
    req.cart = cart;
    next();
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error in getOrCreateCart middleware:', error);
    next(error);
  }
};

router.post('/cart/merge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const { Cart, CartDetail } = getModels();
    const sequelize = getSequelize();
    let transaction: Transaction | undefined;

    try {
      const userId = req.user.id;
      const guestSessionId = req.headers['x-cart-session'] as string;

      if (!guestSessionId) {
        return res.status(400).json({
          status: 'error',
          message: 'No guest cart to merge'
        });
      }

      transaction = await sequelize.transaction();

      // Find guest cart
      const guestCart = await Cart.findOne({
        where: {
          session_id: guestSessionId,
          status: 'active' as CartStatus
        },
        include: ['details']
      });

      if (!guestCart) {
        await transaction.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Guest cart not found'
        });
      }

      // Find or create user cart
      const [userCart] = await Cart.findOrCreate({
        where: {
          user_id: userId,
          status: 'active' as CartStatus
        },
        defaults: {
          user_id: userId,
          session_id: `user-${userId}-${Date.now()}`,
          status: 'active' as CartStatus,
          expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        },
        transaction
      });

      // Merge cart items
      for (const detail of (guestCart.details || [])) {
        await CartDetail.addToCart(
          userCart.id,
          detail.product_id,
          detail.quantity,
          transaction
        );
      }

      // Mark guest cart as converted
      await guestCart.update({ 
        status: 'converted' as CartStatus 
      }, { transaction });

      await transaction.commit();

      // Get updated cart summary
      const summary = await userCart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: userCart.session_id,
          ...summary
        }
      });
    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error('Error merging carts:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to merge carts'
      });
    }
});

// Example route using the updated middleware
router.get('/cart', 
  getOrCreateCart,
  async (req: CartRequest, res: Response) => {
    const { Cart } = getModels();
    
    try {
      const cart = req.cart;
      const summary = await cart.getSummary();

      res.json({
        status: 'success',
        data: {
          session_id: cart.session_id,
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
  getOrCreateCart,
  async (req: CartRequest, res: Response) => {
    const { Product, CartDetail } = getModels();
    
    try {
      const { product_id, quantity } = await addToCartSchema.parseAsync(req.body);

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
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid input data',
          errors: error.errors
        });
      }

      console.error('Error adding to cart:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to add item to cart'
      });
    }
});

// Update item quantity
router.put('/cart/items/:product_id',
  getOrCreateCart,
  async (req: CartRequest, res: Response) => {
    const { CartDetail } = getModels();
    
    try {
      const product_id = parseInt(req.params.product_id);
      const { quantity } = await updateQuantitySchema.parseAsync(req.body);

      const cart = req.cart;
      const detail = await CartDetail.findOne({
        where: {
          cart_id: cart.id,
          product_id
        }
      });

      if (!detail) {
        return res.status(404).json({
          status: 'error',
          message: 'Item not found in cart'
        });
      }

      if (quantity === 0) {
        await detail.destroy();
      } else {
        await detail.updateQuantity(quantity);
      }

      const summary = await cart.getSummary();

      res.json({
        status: 'success',
        data: summary
      });
    } catch (error) {
      console.error('Error updating cart item:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update cart item'
      });
    }
});

// Add other cart routes similarly...

export default router;