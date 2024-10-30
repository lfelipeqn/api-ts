// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { getModels } from '../config/database';
import { User } from '../models/User';


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

    if (!sessionToken) {
      return res.status(401).json({
        status: 'error',
        message: 'No authentication token provided'
      });
    }

    const sessionManager = UserSessionManager.getInstance();
    const session = await sessionManager.getSession(sessionToken);

    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }

    // Now we access user_id from the session, not id
    const user = await User.findByPk(session.id); // Use session.id
    
    if (!user) {
      await sessionManager.destroySession(sessionToken);
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if user is still active
    if (!user.isActive()) {
      await sessionManager.destroySession(sessionToken);
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active'
      });
    }

    // Extend session
    await sessionManager.extendSession(sessionToken);

    // Attach user and session to request
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

