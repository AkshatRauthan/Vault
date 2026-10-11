import { CacheConfig } from '@vault/config';
import { createCacheManager } from './cache.manager';
import { createRedisClient, pingRedis, getRedisDowntimeMs } from './redis-client.factory';

const vaultRedisClient = createRedisClient(CacheConfig, 'vault-cache');

/** Every module should go through this, not the raw client. */
export const VaultCache = createCacheManager(vaultRedisClient);

/**
 * Verifies Redis is actually reachable, by pinging it. Call once during
 * service startup alongside connectAuthDatabases(), before accepting
 * traffic — ioredis's retryStrategy retries indefinitely by default, so
 * without this check a down Redis at boot won't surface clearly.
*/
export const initCacheConnnection = async (): Promise<void> => {
    await pingRedis(vaultRedisClient, 'vault-cache');
};

export const closeCacheConnection = async (): Promise<void> => {
    await vaultRedisClient.quit();
};

/** ioredis state: 'ready' means it can accept commands. */
export const getCacheStatus = (): string => vaultRedisClient.status;

export const getCacheDowntimeMs = (): number | null => getRedisDowntimeMs(vaultRedisClient);

export const pingCache = async (): Promise<void> => {
    await vaultRedisClient.ping();
};