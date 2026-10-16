import path from 'node:path';

import { OpenBaoConfig } from '@vault/config';
import { CustomError, Logger } from '@shared';

import { createOpenBaoHttp } from './openbao.http';
import { createTransitClient } from './openbao.transit';
import { createOpenBaoKeyProvider } from './openbao.key-provider';

export { OpenBaoError, IOpenBaoHttp, createOpenBaoHttp } from './openbao.http';
export type { ITransitClient, ITransitKeyInfo, ITransitKeyVersion } from './openbao.transit';

const MIN_RENEW_INTERVAL_MS = 60 * 1000;
const MAX_RENEW_INTERVAL_MS = 12 * 60 * 60 * 1000;

const http = createOpenBaoHttp({
    addr: OpenBaoConfig.ADDR,
    caCertPath: path.resolve(process.cwd(), OpenBaoConfig.CA_CERT_PATH),
    token: OpenBaoConfig.TOKEN,
    timeoutMs: OpenBaoConfig.TIMEOUT_MS,
});

/** Per-user signing keys. Every module should go through these clients, not the raw HTTP client. */
export const OpenBaoUserKeys = createTransitClient(http, OpenBaoConfig.USER_KEYS_MOUNT);

/** The platform certification key (signs key certificates only). */
export const OpenBaoPlatformKeys = createTransitClient(http, OpenBaoConfig.PLATFORM_KEYS_MOUNT);

/** The IKeyProvider the rest of the app uses; modules never touch the Transit clients directly. */
export const OpenBaoKeyProvider = createOpenBaoKeyProvider(OpenBaoUserKeys, OpenBaoPlatformKeys, OpenBaoConfig.PLATFORM_KEY_NAME);

export interface IOpenBaoStatus {
    /** Initialized, unsealed and reachable. */
    ready: boolean;
    initialized: boolean;
    sealed: boolean;
}

let renewTimer: NodeJS.Timeout | undefined;

/** Never throws: for health checks, where "unreachable" is an answer, not an error. */
export const pingOpenBao = async (): Promise<IOpenBaoStatus> => {
    try {
        // standbyok: a standby node still answers 429 and counts as reachable
        const { status } = await http.request('GET', 'sys/health?standbyok=true', undefined, {
            token: null,
            allowStatuses: [429, 472, 473, 501, 503],
        });
        return {
            ready: status === 200 || status === 429,
            initialized: status !== 501,
            sealed: status === 503,
        };
    } catch {
        return { ready: false, initialized: false, sealed: false };
    }
};

interface ITokenSelf {
    ttl: number;
    renewable: boolean;
    policies: string[];
}

const lookupSelf = async (): Promise<ITokenSelf> => {
    const { body } = await http.request<{ data?: Partial<ITokenSelf> }>('GET', 'auth/token/lookup-self');
    return {
        ttl: body?.data?.ttl ?? 0,
        renewable: body?.data?.renewable === true,
        policies: body?.data?.policies ?? [],
    };
};

const renewSelf = async (): Promise<void> => {
    try {
        await http.request('POST', 'auth/token/renew-self', {});
    } catch (error) {
        // Non-fatal: the next interval retries, and signing fails loudly if the token really expires.
        Logger.error('openbao token renewal failed', {
            label: 'openbao',
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

/**
 * Verifies OpenBao is reachable and unsealed and the app token works, then keeps the token
 * renewed. Throws CustomError(503) so the caller decides whether that is fatal; OpenBao is a
 * soft dependency (only signing needs it), so index.ts logs the failure and carries on.
 */
export const initOpenBaoConnection = async (): Promise<void> => {
    const status = await pingOpenBao();
    if (!status.ready) {
        const reason = !status.initialized ? 'not initialized' : status.sealed ? 'sealed' : 'unreachable';
        throw new CustomError(`openbao is ${reason}`, 503, true);
    }

    let self: ITokenSelf;
    try {
        self = await lookupSelf();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CustomError(`openbao token check failed: ${message}`, 503, true);
    }

    if (self.policies.includes('root')) {
        Logger.warn('openbao app token has the root policy; use a limited vault-app token instead', {
            label: 'openbao',
        });
    }

    // ttl 0 means the token never expires (root); otherwise renew well before it runs out.
    if (self.ttl > 0 && self.renewable) {
        const interval = Math.min(MAX_RENEW_INTERVAL_MS, Math.max(MIN_RENEW_INTERVAL_MS, (self.ttl * 1000) / 2));
        await renewSelf();
        renewTimer = setInterval(() => void renewSelf(), interval);
        renewTimer.unref();
    } else if (self.ttl > 0) {
        Logger.warn('openbao app token expires and is not renewable', { label: 'openbao', ttlSeconds: self.ttl });
    }

    Logger.info('openbao connected', { label: 'openbao', policies: self.policies, tokenTtlSeconds: self.ttl });
};

export const closeOpenBaoConnection = async (): Promise<void> => {
    if (renewTimer) clearInterval(renewTimer);
    renewTimer = undefined;
    http.close();
};