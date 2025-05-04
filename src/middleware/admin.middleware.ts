import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Middleware to check if user has admin role
 */
export const requireAdminRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Get the user's roles
    const roles = await req.user.getRoles();
    
    // Check if user has the ADMINISTRATOR role
    const isAdmin = roles.some(role => role.name === 'ADMINISTRATOR');
    
    if (!isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Administrator access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin role check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to validate administrator status'
    });
  }
};