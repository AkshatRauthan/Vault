import { HealthStatus, IDependencyCheck, IHealthReport } from './health.types';

import { ServerConfig } from '@vault/config';
import { pingOpenBao } from '@vault/infra/openbao';
import { getDbStatus, pingDb } from '@vault/infra/db';
import { getCacheDowntimeMs, getCacheStatus, pingCache } from '@vault/infra/cache';

const PING_TIMEOUT_MS = 1500;
const BYTES_PER_MB = 1024 * 1024;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });

/**
 * Skips the ping when the client already knows it's not ready (so nothing queues up
 * mid-outage); otherwise does a live ping with a timeout so a hung dependency can't hang /health.
 */
const runCheck = async (state: string, isUp: boolean, ping: () => Promise<void>): Promise<IDependencyCheck> => {
    if (!isUp) return { status: 'down', state, reason: 'not_ready' };

    const startedAt = performance.now();
    try {
        await withTimeout(ping(), PING_TIMEOUT_MS);
        return { status: 'up', state, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
        const timedOut = error instanceof Error && error.message === 'timeout';
        return { status: 'down', state, reason: timedOut ? 'timeout' : 'ping_failed' };
    }
};

/**
 * pingOpenBao never throws and has its own request timeout, so one call tells us whether the
 * key manager is reachable, initialized and unsealed. The state names say which it is.
 */
const checkSigning = async (): Promise<IDependencyCheck> => {
    const startedAt = performance.now();
    const status = await pingOpenBao();

    if (status.ready) {
        return { status: 'up', state: 'ready', latencyMs: Math.round(performance.now() - startedAt) };
    }
    if (!status.initialized || status.sealed) {
        return { status: 'down', state: status.sealed ? 'sealed' : 'uninitialized', reason: 'not_ready' };
    }
    return { status: 'down', state: 'unreachable', reason: 'ping_failed' };
};

export const HealthService = {
    /**
     * Database down = the API can't work (down). Cache down = routes that use sessions fail with
     * 503, signing down = signing fails; in both cases the rest still works (degraded).
     */
    async getReport(): Promise<IHealthReport> {
        const dbState = getDbStatus();
        const cacheState = getCacheStatus();

        const [database, cache, signing] = await Promise.all([
            runCheck(dbState, dbState === 'connected', pingDb),
            runCheck(cacheState, cacheState === 'ready', pingCache),
            checkSigning()
        ]);

        if (cache.status === 'down') {
            const downForMs = getCacheDowntimeMs();
            if (downForMs !== null) cache.downForMs = downForMs;
        }

        let status: HealthStatus = 'ok';
        if (database.status === 'down') status = 'down';
        else if (cache.status === 'down' || signing.status === 'down') status = 'degraded';

        const report: IHealthReport = {
            status,
            service: ServerConfig.SERVICE_NAME,
            timestamp: new Date().toISOString(),
            uptime: Math.round(process.uptime()),
            checks: { database, cache, signing },
        };

        if (ServerConfig.NODE_ENV !== 'production') {
            const memory = process.memoryUsage();
            report.runtime = {
                environment: ServerConfig.NODE_ENV,
                nodeVersion: process.version,
                memoryMb: {
                    rss: Math.round(memory.rss / BYTES_PER_MB),
                    heapUsed: Math.round(memory.heapUsed / BYTES_PER_MB),
                },
            };
        }

        return report;
    },
};