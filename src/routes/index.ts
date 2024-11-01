// src/routes/index.ts

import { Router } from 'express';
import redisRoutes, { connectRedis } from './redis-routes';
import productRoutes from './product.routes';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import paymentConfigRoutes from './payment-config.routes';

const router = Router();

// Create an API router for all API routes
const apiRouter = Router();

// Add all routers to main router
router.use('/redis', redisRoutes);
router.use('/api', apiRouter);

// Add routes to API router
apiRouter.use('/auth', authRoutes);
apiRouter.use('/', productRoutes); // This will preserve existing product routes under /api
apiRouter.use('/', cartRoutes);
apiRouter.use('/payment-config', paymentConfigRoutes);

export { connectRedis };
export default router;