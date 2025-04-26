import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { RoleService } from '../services/RoleService';

export const requirePermission = (permission: string | string[]) => {
  const roleService = RoleService.getInstance();
  
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      const permissions = Array.isArray(permission) ? permission : [permission];
      
      // Check if user has at least one of the required permissions
      let hasPermission = false;
      
      for (const perm of permissions) {
        if (await roleService.userHasPermission(req.user, perm)) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to access this resource'
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to validate permissions'
      });
    }
  };
};

// Helper that checks if user has ALL specified permissions
export const requireAllPermissions = (permissions: string[]) => {
  const roleService = RoleService.getInstance();
  
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      // Check if user has ALL required permissions
      for (const permission of permissions) {
        const hasPermission = await roleService.userHasPermission(req.user, permission);
        if (!hasPermission) {
          return res.status(403).json({
            status: 'error',
            message: 'You do not have all required permissions to access this resource'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to validate permissions'
      });
    }
  };
};

// Helper that requires user to be an administrator
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const isAdmin = await req.user.isAdmin();
    if (!isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Administrator access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to validate administrator status'
    });
  }
};