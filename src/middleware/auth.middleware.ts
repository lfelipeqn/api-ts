// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { getModels } from '../config/database';


export interface AuthenticatedRequest extends Request {
  user?: any;
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

    const { User } = getModels();

    // Fetch the user
    const user = await User.findByPk(session.id);
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