import Redis from 'ioredis';

/**
 * Generic Redis operations wrapper. Domain-specific key names and TTLs
 * stay out of here — that's each module's own concern.
 */
declare module 'ioredis' {
    interface Redis {
        zaddWithTtl(key: string, score: number, member: string, ttlSeconds: number): Promise<number>;
        incrWithWindow(key: string, windowSeconds: number): Promise<number>;
        checkAndEvictLru(key: string, limit: number): Promise<string | null>;
    }
}

// Lua scripts run atomically on the Redis server, so "write + expire"
// can't be split by a crash or dropped connection between the two calls.

const ZADD_WITH_TTL = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
if tonumber(ARGV[3]) > 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return 1
`;

const INCR_WITH_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

// Atomically checks whether the sorted set is at/over `limit` and, if so,
// removes and returns its lowest-scored member (the eviction victim) in a
// single server-side step. Redis runs scripts single-threaded, so two
// concurrent callers can never pick the same victim: the second one sees
// the post-removal state. The caller still owns cleanup of whatever the
// victim refers to (e.g. deleting the session key it points at).
const CHECK_AND_EVICT_LRU = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])

local count = redis.call('ZCARD', key)
if count < limit then
  return false
end

local victims = redis.call('ZRANGE', key, 0, 0)
if #victims == 0 then
  return false
end

local victim = victims[1]
redis.call('ZREM', key, victim)
return victim
`;

export const createCacheManager = (redisClient: Redis) => {
    // Register scripts once per client instance so they're cached
    // server-side (EVALSHA) rather than re-sent as source every call.
    redisClient.defineCommand('zaddWithTtl', { numberOfKeys: 1, lua: ZADD_WITH_TTL });
    redisClient.defineCommand('incrWithWindow', { numberOfKeys: 1, lua: INCR_WITH_WINDOW });
    redisClient.defineCommand('checkAndEvictLru', { numberOfKeys: 1, lua: CHECK_AND_EVICT_LRU });

    return {
        /**
         * Reads a value stored via `set` and JSON-parses it into T.
         * Returns null on a cache miss AND on malformed JSON (treated as a
         * miss so a corrupted entry never crashes the caller).
         */
        async get<T>(key: string): Promise<T | null> {
            const value = await redisClient.get(key);
            if (!value) return null;
            try {
                return JSON.parse(value) as T;
            } catch {
                return null;
            }
        },

        /**
         * Batch version of `get`: one round trip for many keys. Result is
         * index-aligned with `keys`; misses and malformed entries are null.
         */
        async mGet<T>(keys: string[]): Promise<(T | null)[]> {
            if (keys.length === 0) return [];
            const values = await redisClient.mget(...keys);
            return values.map((value) => {
                if (!value) return null;
                try {
                    return JSON.parse(value) as T;
                } catch {
                    return null;
                }
            });
        },

        /**
         * Writes any JSON-serializable value under `key` with a fixed TTL
         * (single atomic SET ... EX). `undefined` is rejected explicitly
         * since it would otherwise serialize to the string "undefined".
         */
        async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
            if (value === undefined) {
                throw new Error(`cache.set: cannot cache undefined value for key "${key}"`);
            }
            await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        },

        /**
         * Overwrites an EXISTING key's value while preserving its remaining
         * TTL (SET ... XX KEEPTTL), atomically. Use for in-place updates
         * that must not extend or reset expiry. Returns false if the key
         * doesn't exist (nothing is written). Requires Redis >= 6.0.
         */
        async update(key: string, value: unknown): Promise<boolean> {
            if (value === undefined) {
                throw new Error(`cache.update: cannot cache undefined value for key "${key}"`);
            }
            const result = await redisClient.call('SET', key, JSON.stringify(value), 'XX', 'KEEPTTL');
            return result === 'OK';
        },

        /**
         * Deletes one or more keys regardless of their Redis type.
         * No-op when called with no keys.
         */
        async invalidate(...keys: string[]): Promise<void> {
            if (keys.length === 0) return;
            await redisClient.del(...keys);
        },

        /**
         * Sets (or refreshes) a key's expiry independently of any write.
         * Returns false if the key doesn't exist.
         */
        async expire(key: string, ttlSeconds: number): Promise<boolean> {
            return (await redisClient.expire(key, ttlSeconds)) === 1;
        },

        /** Yes/no existence check without deserializing the value. */
        async exists(key: string): Promise<boolean> {
            return (await redisClient.exists(key)) === 1;
        },

        /**
         * Seconds remaining before `key` expires.
         * -2 = key doesn't exist, -1 = key exists but has no expiry.
         */
        async ttl(key: string): Promise<number> {
            return redisClient.ttl(key);
        },

        /**
         * Increments a counter at `key`; only the call that creates the key
         * (count reaches 1) sets the expiry. Later increments do NOT extend
         * it, so this is a fixed window, not a sliding one. Use for rate
         * limiting / "N events per window".
         */
        async incrWithWindow(key: string, windowSeconds: number): Promise<number> {
            return redisClient.incrWithWindow(key, windowSeconds);
        },

        /**
         * Adds (or updates) one member of a sorted set, optionally
         * (re)setting the whole key's TTL in the same atomic call. Members
         * should be ID strings (e.g. sessionId), scores numeric
         * (e.g. createdAt).
         *
         * NOTE: ttlSeconds resets the whole key's expiry on every call,
         * since a sorted set lives under one Redis key.
         */
        async zAdd(key: string, score: number, member: string, ttlSeconds?: number): Promise<void> {
            await redisClient.zaddWithTtl(key, score, member, ttlSeconds ?? 0);
        },

        /**
         * Members between `start` and `stop` (inclusive, 0-indexed),
         * ascending by score. Defaults to the whole set.
         */
        async zRange(key: string, start = 0, stop = -1): Promise<string[]> {
            return redisClient.zrange(key, start, stop);
        },

        /**
         * Removes a member from a sorted set. Returns the number removed
         * (0 if it wasn't present — not an error).
         */
        async zRem(key: string, member: string): Promise<number> {
            return redisClient.zrem(key, member);
        },

        /**
         * Removes several members in one call (e.g. pruning stale session
         * IDs). Returns the number actually removed; no-op on empty input.
         */
        async zRemMany(key: string, members: string[]): Promise<number> {
            if (members.length === 0) return 0;
            return redisClient.zrem(key, ...members);
        },

        /** A member's score, or null if it isn't in the set. */
        async zScore(key: string, member: string): Promise<number | null> {
            const score = await redisClient.zscore(key, member);
            return score === null ? null : Number(score);
        },

        /** Number of members in the sorted set. */
        async zCard(key: string): Promise<number> {
            return redisClient.zcard(key);
        },

        /**
         * Atomically evicts the lowest-scored member if the set is at/over
         * `limit`, and returns it. Returns null if under the limit or the
         * set is empty. Cache-side only: the caller cleans up whatever the
         * returned member refers to.
         */
        async checkAndEvictLru(key: string, limit: number): Promise<string | null> {
            const victim = await redisClient.checkAndEvictLru(key, limit);
            return victim || null;
        },
    };
};

export type CacheManager = ReturnType<typeof createCacheManager>;