import { createClient } from 'redis';
import { config } from '../config';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!config.redis.url) {
    console.warn('Redis URL not configured, skipping Redis connection');
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({ url: config.redis.url });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  await redisClient.connect();

  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
