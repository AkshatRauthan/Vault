import { RedisOptions } from 'ioredis';
import { getEnv, getPort, getPositiveInteger } from '@shared';


export const CacheConfig: RedisOptions = {
    host: getEnv('REDIS_CACHE_HOST', '127.0.0.1'),
    port: getPort('REDIS_CACHE_PORT', '6379'),
};

export const CacheTTLConfig = {
    
}