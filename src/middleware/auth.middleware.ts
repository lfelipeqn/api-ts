// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { getModels } from '../config/database';
import { User } from '../models/User';
import { CartSessionManager } from '../services/CartSessionManager';
import { CartStatus } from '../types/cart';
import { CartDetail } from '../models/CartDetail';

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionId?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    const cartSessionId = req.headers['x-cart-session'] as string;

    if (!sessionToken) {
      return res.status(401).json({
        status: 'error',
        message: 'No authentication token provided'
      });
    }

    const sessionManager = UserSessionManager.getInstance();
    const cartSessionManager = CartSessionManager.getInstance();
    const session = await sessionManager.getSession(sessionToken);

    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }

    const user = await User.findByPk(session.id);
    
    if (!user) {
      await sessionManager.destroySession(sessionToken);
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (!user.isActive()) {
      await sessionManager.destroySession(sessionToken);
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active'
      });
    }

    // Attempt to merge carts if guest cart exists
    if (cartSessionId) {
      const { Cart } = getModels();
      const guestCart = await Cart.findOne({
        where: {
          session_id: cartSessionId,
          status: 'active' as CartStatus,
          user_id: null
        },
        include: ['details']
      });

      if (guestCart) {
        const userCart = await Cart.findOne({
          where: {
            user_id: user.id,
            status: 'active' as CartStatus
          }
        });

        if (userCart) {
          // Merge guest cart items into user cart
          for (const detail of guestCart.details || []) {
            await CartDetail.addToCart(
              userCart.id,
              detail.product_id,
              detail.quantity
            );
          }
          await guestCart.update({ status: 'abandoned' as CartStatus });
          await cartSessionManager.deleteSession(cartSessionId);
        } else {
          // Convert guest cart to user cart
          await guestCart.update({
            user_id: user.id,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          });
          await cartSessionManager.updateSession(cartSessionId, {
            cart_id: guestCart.id,
            user_id: user.id,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          });
        }
      }
    }

    await sessionManager.extendSession(sessionToken);

    req.user = user;
    req.sessionId = sessionToken;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during authentication'
    });
  }
};