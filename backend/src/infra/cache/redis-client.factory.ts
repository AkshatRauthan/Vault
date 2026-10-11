import Redis, { RedisOptions } from 'ioredis';
import { CustomError, Logger } from '@shared';

const downtimeGetters = new WeakMap<Redis, () => number | null>();

/** Milliseconds the client has been disconnected, or null if it is connected. */
export const getRedisDowntimeMs = (client: Redis): number | null =>
    downtimeGetters.get(client)?.() ?? null;

/**
 * Generic Redis client factory. Each service builds its own client from its
 * own env-driven config — shared only owns consistent wiring (timeouts,
 * retry strategy, logging), not connection details or key patterns.
 *
 * Reconnect behaviour: retries indefinitely on disconnect (never gives up),
 * since a long-running service should self-heal once Redis comes back
 * rather than require a manual restart. This factory never escalates to
 * fatal/crashes the process on a Redis outage — if a specific service
 * considers Redis mission-critical enough to warrant that, it implements
 * that decision itself on top of this client, not here.
 *
 * Logging is throttled during a sustained outage to avoid flooding logs
 * with a near-identical line every retry cycle: the first few attempts
 * log in full, then it drops to a sparse cadence until reconnected.
 */
export const createRedisClient = (options: RedisOptions, label = 'redis'): Redis => {
    const client = new Redis({
        connectTimeout: 5000,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
            reconnectAttempts = times;
            return Math.min(times * 500, 10000);
        },
        ...options,
    });

    // Tracking for attempt count + outage duration across the retry loop.
    let reconnectAttempts = 0;
    let disconnectedAt: number | null = null;
    let hasConnectedOnce = false;

    downtimeGetters.set(client, () => (disconnectedAt === null ? null : Date.now() - disconnectedAt));

    const FULL_LOG_ATTEMPT_THRESHOLD = 5; // log every attempt up to this point
    const SPARSE_LOG_INTERVAL = 10; // beyond that, only log every Nth attempt

    client.on('error', (err: Error) => {
        const shouldLog =
            reconnectAttempts <= FULL_LOG_ATTEMPT_THRESHOLD || reconnectAttempts % SPARSE_LOG_INTERVAL === 0;

        if (shouldLog) {
            Logger.error(`${label} connection error`, {
                label,
                attempt: reconnectAttempts,
                error: err.message
            });
        }
    });

    client.on('close', () => {
        if (disconnectedAt === null) {
            disconnectedAt = Date.now();
        }

        const shouldLog =
            reconnectAttempts <= FULL_LOG_ATTEMPT_THRESHOLD || reconnectAttempts % SPARSE_LOG_INTERVAL === 0;

        if (shouldLog) {
            Logger.warn(`${label} connection closed`, { label, attempt: reconnectAttempts });
        }
    });

    client.on('reconnecting', (delay: number) => {
        const shouldLog =
            reconnectAttempts <= FULL_LOG_ATTEMPT_THRESHOLD || reconnectAttempts % SPARSE_LOG_INTERVAL === 0;

        if (shouldLog) {
            Logger.warn(`${label} reconnecting`, { label, attempt: reconnectAttempts, delay });
        }
    });

    client.on('connect', () => {
        if (disconnectedAt !== null) {
            const downtimeMs = Date.now() - disconnectedAt;
            Logger.info(`${label} reconnected after outage`, {
                label,
                downtimeMs,
                attempts: reconnectAttempts,
            });
        } else if (!hasConnectedOnce) {
            Logger.info(`${label} connected`, { label });
        }

        hasConnectedOnce = true;
        disconnectedAt = null;
        reconnectAttempts = 0;
    });

    client.on('ready', () => {
        Logger.info(`${label} ready to accept commands`, { label });
    });

    client.on('end', () => {
        Logger.info(`${label} connection closed`, { label });
    });

    return client;
};

/**
 * Verifies a Redis client is reachable — for startup healthchecks, mirrors
 * connectFlightDatabases(). Throws CustomError(isOperational=true) since an
 * unreachable cache at boot is an anticipated failure, not a bug.
 */
export const pingRedis = async (client: Redis, label = 'redis'): Promise<void> => {
    try {
        await client.ping();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CustomError(`${label} is unreachable: ${message}`, 503, true);
    }
};