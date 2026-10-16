export type DependencyState = 'up' | 'down';

/** ok = everything up, degraded = database up but cache or signing down, down = database down. */
export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface IDependencyCheck {
    status: DependencyState;
    /** Raw connection state from the client (e.g. 'connected', 'ready', 'reconnecting'). */
    state: string;
    /** Round-trip time of a live ping. Only present when the dependency is up. */
    latencyMs?: number;
    /** How long the client has been disconnected (cache only). Present when down and the client knows since when. */
    downForMs?: number;
    /** Only present when down. Deliberately generic: raw error text is never exposed. */
    reason?: 'not_ready' | 'timeout' | 'ping_failed';
}

export interface IHealthReport {
    status: HealthStatus;
    service: string;
    timestamp: string;
    /** Process uptime in whole seconds. */
    uptime: number;
    checks: {
        database: IDependencyCheck;
        cache: IDependencyCheck;
        /** The key manager (OpenBao). Down means signing fails; everything else still works. */
        signing: IDependencyCheck;
    };
    /** Process details. Omitted in production so the public endpoint doesn't fingerprint the server. */
    runtime?: {
        environment: string;
        nodeVersion: string;
        memoryMb: { rss: number; heapUsed: number };
    };
}