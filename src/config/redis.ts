import { Cache } from '../services/Cache';

export const initializeCache = async () => {
  try {
    const cache = Cache.getInstance();
    await cache.connect();
    return cache;
  } catch (error) {
    console.error('Failed to initialize cache:', error);
    throw error;
  }
};