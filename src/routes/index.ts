import { Router } from 'express';
import redisRoutes, { connectRedis } from './redis-routes';
import productRoutes from './product.routes';

const router = Router();

// Redis routes
router.use('/redis', redisRoutes);

// Product routes - using /api prefix for RESTful routes
router.use('/api', productRoutes);

// Export Redis connection and router
export { connectRedis };
export default router;