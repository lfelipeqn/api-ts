// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { CartSessionManager } from '../services/CartSessionManager';
import { getModels } from '../config/database';
import { User } from '../models/User';
import { CartStatus } from '../types/cart';
import { Cart } from '../models/Cart';

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionId?: string;
  cartSessionId?: string;
  token?: string;
  viewOwnOnly?: boolean;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    const cartSessionId = req.headers['x-cart-session'] as string | undefined;

    console.log('Starting auth process:', {
      sessionToken,
      cartSessionId,
      headers: req.headers
    });

    const sessionManager = UserSessionManager.getInstance();
    const cartSessionManager = CartSessionManager.getInstance();
    const { Cart } = getModels();

    if (!sessionToken) {
      return res.status(401).json({
        status: 'error',
        message: 'No authentication token provided'
      });
    }

    const session = await sessionManager.getSession(sessionToken);
    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }

    const user = await User.findByPk(session.id);
    if (!user || !user.isActive()) {
      await sessionManager.destroySession(sessionToken);
      return res.status(401).json({
        status: 'error',
        message: 'User not found or inactive'
      });
    }

    let activeCart:Cart | null = null;
    let finalCartSessionId: string | undefined;

    activeCart = await Cart.findOne({
      where: {
        user_id: user.id,
        status: 'active' as CartStatus
      }
    });

    if (activeCart) {
      finalCartSessionId = activeCart.session_id;
      await cartSessionManager.ensureSession(
        activeCart.id,
        finalCartSessionId,
        user.id
      );
    } else if (cartSessionId) {
      const cartSession = await cartSessionManager.getSession(cartSessionId);
      if (cartSession) {
        const guestCart = await Cart.findOne({
          where: {
            id: cartSession.cart_id,
            status: 'active' as CartStatus
          }
        });

        if (guestCart) {
          await guestCart.update({
            user_id: user.id,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          });

          await cartSessionManager.updateSession(cartSessionId, {
            cart_id: guestCart.id,
            user_id: user.id,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          });

          activeCart = guestCart;
          finalCartSessionId = cartSessionId;
        }
      }
    }

    console.log('Session state after processing:', {
      userId: user.id,
      cartId: activeCart?.id,
      cartSessionId: finalCartSessionId,
      checkoutSession: req.headers['x-checkout-session']
    });

    req.user = user;
    req.sessionId = sessionToken;
    req.cartSessionId = finalCartSessionId;

    if (finalCartSessionId) {
      res.setHeader('X-Cart-Session', finalCartSessionId);
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during authentication'
    });
  }
};