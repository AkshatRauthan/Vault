import https from 'node:https';
import { readFileSync } from 'node:fs';

/**
 * Minimal OpenBao HTTP layer on node:https. It trusts only the CA file it is given
 * (not the system store, no global NODE_EXTRA_CA_CERTS) and imports nothing from the app,
 * so the bootstrap script can reuse it too.
 */

const MAX_BODY_BYTES = 1024 * 1024;

export interface IOpenBaoHttpOptions {
    /** e.g. https://localhost:8200. Must be https. */
    addr: string;
    caCertPath: string;
    token: string;
    timeoutMs?: number;
}

export interface IRequestOptions {
    /** Non-2xx statuses that are returned instead of thrown (e.g. 404 for "not found"). */
    allowStatuses?: number[];
    /** Override the client's token; pass null to send the request without one. */
    token?: string | null;
}

export interface IOpenBaoResponse<T = unknown> {
    status: number;
    body: T | null;
}

export interface IOpenBaoHttp {
    request<T = unknown>(
        method: string,
        apiPath: string,
        body?: unknown,
        options?: IRequestOptions,
    ): Promise<IOpenBaoResponse<T>>;
    close(): void;
}

/** Carries OpenBao's own error strings; never the token or the request body. */
export class OpenBaoError extends Error {
    public readonly status: number | null;
    public readonly details: string[];

    constructor(message: string, status: number | null, details: string[] = []) {
        super(message);
        this.name = 'OpenBaoError';
        this.status = status;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

const extractErrors = (parsed: unknown): string[] => {
    const errors = (parsed as { errors?: unknown } | null)?.errors;
    return Array.isArray(errors) ? errors.filter((e): e is string => typeof e === 'string') : [];
};

export const createOpenBaoHttp = (options: IOpenBaoHttpOptions): IOpenBaoHttp => {
    const base = new URL(options.addr);
    if (base.protocol !== 'https:') {
        throw new OpenBaoError('OpenBao address must use https://', null);
    }

    // Defer reading the CA file until the first request. Otherwise importing the app would
    // throw synchronously when local certificates have not been generated yet, before startup
    // can report the dependency failure through its normal error path.
    let agent: https.Agent | undefined;
    const getAgent = (): https.Agent => {
        agent ??= new https.Agent({
            ca: readFileSync(options.caCertPath),
            keepAlive: true,
            minVersion: 'TLSv1.2',
        });
        return agent;
    };
    const timeoutMs = options.timeoutMs ?? 5000;

    const request = <T = unknown>(
        method: string,
        apiPath: string,
        body?: unknown,
        requestOptions: IRequestOptions = {},
    ): Promise<IOpenBaoResponse<T>> =>
        new Promise((resolve, reject) => {
            const payload = body === undefined ? undefined : JSON.stringify(body);
            const token = requestOptions.token === undefined ? options.token : requestOptions.token;

            const headers: Record<string, string | number> = { Accept: 'application/json' };
            if (token) headers['X-Vault-Token'] = token;
            if (payload !== undefined) {
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(payload);
            }

            const req = https.request(
                {
                    hostname: base.hostname,
                    port: base.port || 443,
                    path: `/v1/${apiPath}`,
                    method,
                    headers,
                    agent: getAgent(),
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    let size = 0;

                    res.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > MAX_BODY_BYTES) {
                            req.destroy(new Error('response too large'));
                            return;
                        }
                        chunks.push(chunk);
                    });

                    res.on('end', () => {
                        const status = res.statusCode ?? 0;
                        const text = Buffer.concat(chunks).toString('utf8');
                        let parsed: unknown = null;
                        if (text.length > 0) {
                            try {
                                parsed = JSON.parse(text);
                            } catch {
                                parsed = null;
                            }
                        }

                        const accepted =
                            (status >= 200 && status < 300) || (requestOptions.allowStatuses ?? []).includes(status);
                        if (!accepted) {
                            const errors = extractErrors(parsed);
                            reject(
                                new OpenBaoError(
                                    `OpenBao ${method} ${apiPath} failed with status ${status}` +
                                        (errors.length > 0 ? `: ${errors.join('; ')}` : ''),
                                    status,
                                    errors,
                                ),
                            );
                            return;
                        }
                        resolve({ status, body: parsed as T | null });
                    });
                },
            );

            req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
            req.on('error', (err) => reject(new OpenBaoError(`OpenBao request failed: ${err.message}`, null)));

            if (payload !== undefined) req.write(payload);
            req.end();
        });

    return { request, close: () => agent?.destroy() };
};