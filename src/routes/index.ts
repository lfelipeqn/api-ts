// src/routes/index.ts

import { Request, Response, NextFunction, Router } from 'express';
import redisRoutes, { connectRedis } from './redis-routes';
import productRoutes from './product.routes';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import paymentConfigRoutes from './payment-config.routes';
import paymentRoutes from './payment.routes';
import checkoutRoutes from './checkout.routes';
import webRoutes from './web.routes';
import accountRoutes from './account.routes';
import emailRoutes from './email.routes';

const router = Router();

// Create an API router for all API routes
const apiRouter = Router();

// Add all routers to main router
router.use('/redis', redisRoutes);
router.use('/api', apiRouter);

// Add routes to API router
apiRouter.use('/',webRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/', productRoutes); // This will preserve existing product routes under /api
apiRouter.use('/', cartRoutes);
apiRouter.use('/payments-config', paymentConfigRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/checkout', checkoutRoutes);
apiRouter.use('/account', accountRoutes);
apiRouter.use('/email', emailRoutes);

// Global error handler - this should be the last middleware
apiRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // If headers have already been sent, let Express handle it
  if (res.headersSent) {
    return next(err);
  }

  // Log error for debugging
  console.error('API Error:', {
    error: err,
    stack: err.stack
  });

  // Send error response
  return res.status(500).json({
    status: 'error',
    message: err instanceof Error ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack
    })
  });
});

export { connectRedis };
export default router;