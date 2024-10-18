import { Router } from 'express';
import redisRoutes, { connectRedis } from './redis-routes';

const router = Router();

router.use('/redis', redisRoutes);

export { connectRedis };
export default router;