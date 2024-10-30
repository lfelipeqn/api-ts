import { createClient, RedisClientType } from 'redis';

interface CacheEntry<T> {
  key: string;
  value: T;
}

export class Cache {
  private static instance: Cache;
  private client: RedisClientType;
  private isConnected: boolean = false;
  
  private constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL,
    });

    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    this.client.on('connect', () => console.log('Redis Client Connected'));
    this.client.on('ready', () => {
      console.log('Redis Client Ready');
      this.isConnected = true;
    });
    this.client.on('end', () => {
      console.log('Redis Client Connection Ended');
      this.isConnected = false;
    });
  }

  public static getInstance(): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache();
    }
    return Cache.instance;
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
      } catch (error) {
        console.error('Failed to disconnect from Redis:', error);
        throw error;
      }
    }
  }

  // Get a value with optional automatic parsing of JSON
  public async get<T>(key: string, parseJson: boolean = true): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return parseJson ? JSON.parse(value) : value as T;
    } catch (error) {
      console.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  // Set a value with optional expiration
  public async set(
    key: string, 
    value: any, 
    expireSeconds?: number
  ): Promise<boolean> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (expireSeconds) {
        await this.client.setEx(key, expireSeconds, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  // Delete a key
  public async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  // Delete multiple keys
  public async delMany(keys: string[]): Promise<boolean> {
    try {
      await this.client.del(keys);
      return true;
    } catch (error) {
      console.error('Error deleting multiple cache keys:', error);
      return false;
    }
  }


  // Increment a value
  public async increment(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error(`Error incrementing cache key ${key}:`, error);
      return 0;
    }
  }

  // Set with hash
  public async hSet(
    key: string,
    field: string,
    value: any
  ): Promise<boolean> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.hSet(key, field, stringValue);
      return true;
    } catch (error) {
      console.error(`Error setting hash field ${field} in key ${key}:`, error);
      return false;
    }
  }

  // Get from hash
  public async hGet<T>(
    key: string,
    field: string,
    parseJson: boolean = true
  ): Promise<T | null> {
    try {
      const value = await this.client.hGet(key, field);
      if (!value) return null;
      return parseJson ? JSON.parse(value) : value as T;
    } catch (error) {
      console.error(`Error getting hash field ${field} from key ${key}:`, error);
      return null;
    }
  }

  // Get all hash fields
  public async hGetAll<T>(key: string, parseJson: boolean = true): Promise<Record<string, T> | null> {
    try {
      const hash = await this.client.hGetAll(key);
      if (!Object.keys(hash).length) return null;
      
      if (parseJson) {
        return Object.entries(hash).reduce((acc, [field, value]) => ({
          ...acc,
          [field]: JSON.parse(value)
        }), {});
      }
      
      return hash as Record<string, T>;
    } catch (error) {
      console.error(`Error getting all hash fields from key ${key}:`, error);
      return null;
    }
  }

   // Find keys by pattern and return their values
   public async findByPattern<T>(pattern: string): Promise<CacheEntry<T>[]> {
    try {
      const keys = await this.scanKeys(pattern);
      const entries: CacheEntry<T>[] = [];

      for (const key of keys) {
        const value = await this.get<T>(key);
        if (value !== null) {
          entries.push({ key, value });
        }
      }

      return entries;
    } catch (error) {
      console.error(`Error finding by pattern ${pattern}:`, error);
      return [];
    }
  }

  // Scan keys using pattern
  private async scanKeys(pattern: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      for await (const key of this.client.scanIterator({
        MATCH: pattern,
        COUNT: 100
      })) {
        keys.push(key);
      }
      return keys;
    } catch (error) {
      console.error(`Error scanning keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  // Clear keys by pattern
  public async clearPattern(pattern: string): Promise<boolean> {
    try {
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.delMany(keys);
      }
      return true;
    } catch (error) {
      console.error(`Error clearing cache pattern ${pattern}:`, error);
      return false;
    }
  }

  // Check if key exists
  public async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      console.error(`Error checking cache key ${key}:`, error);
      return false;
    }
  }

}