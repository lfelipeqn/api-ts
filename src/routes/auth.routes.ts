// src/routes/auth.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { UserSessionManager } from '../services/UserSessionManager';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { getModels } from '../config/database';
import { z } from 'zod';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
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

    // Find user by email
    const user = await User.findOne({
      where: { email },
      include: [{
        association: 'person',
        attributes: ['first_name', 'last_name']
      }]
    });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Verify user state
    if (!user.isActive()) {
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active',
        state: user.state
      });
    }

    // Verify password
    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Create session
    const sessionId = await user.createSession();

    // Get full user info
    const userInfo = await user.getInfo();

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
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
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during login'
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

export default router;