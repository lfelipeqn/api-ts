import { Router } from 'express';
import { createClient } from 'redis';

const router = Router();

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Connect to Redis (call this when your app starts)
export const connectRedis = async () => {
  await redisClient.connect();
  console.log('Redis connection has been established successfully.');
};

router.get('/test-redis', async (req, res) => {
  try {
    await redisClient.set('test-key', 'Hello from Redis!');
    const value = await redisClient.get('test-key');
    res.json({ value });
  } catch (error) {
    console.error('Redis operation failed:', error);
    res.status(500).json({ error: 'Redis operation failed' });
  }
});

export default router;