// src/routes/index.ts

import { Request, Response, NextFunction, Router } from 'express';
import redisRoutes, { connectRedis } from './redis-routes';
import productRoutes from './product.routes';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import paymentConfigRoutes from './payment-config.routes';
import paymentTestRoutes from './payment-test.routes';
import checkoutRoutes from './checkout.routes';

const router = Router();

// Create an API router for all API routes
const apiRouter = Router();

apiRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Internal server error',
      debug: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

// Add all routers to main router
router.use('/redis', redisRoutes);
router.use('/api', apiRouter);

// Add routes to API router
apiRouter.use('/auth', authRoutes);
apiRouter.use('/', productRoutes); // This will preserve existing product routes under /api
apiRouter.use('/', cartRoutes);
apiRouter.use('/payments', paymentConfigRoutes);
apiRouter.use('/payments', paymentTestRoutes);
apiRouter.use('/checkout', checkoutRoutes);

export { connectRedis };
export default router;