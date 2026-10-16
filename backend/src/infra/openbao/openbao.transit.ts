import { IOpenBaoHttp, OpenBaoError } from './openbao.http';

const NAME_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SIGNATURE_PATTERN = /^vault:v(\d+):([A-Za-z0-9+/]+={0,2})$/;
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

export interface ITransitKeyVersion {
    version: number;
    /** Base64 of the raw 32-byte Ed25519 public key. */
    publicKey: string;
    createdAt: string;
}

export interface ITransitKeyInfo {
    name: string;
    latestVersion: number;
    versions: ITransitKeyVersion[];
}

interface ITransitKeyData {
    type?: string;
    latest_version?: number;
    keys?: Record<string, { public_key?: string; creation_time?: string }>;
}

/** Key names go into URL paths, so only a strict character set is allowed. */
const assertSafeName = (name: string): void => {
    if (!NAME_PATTERN.test(name)) {
        throw new OpenBaoError('Invalid transit key name', null);
    }
};

const decodeExact = (value: string, length: number): Buffer | null => {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === length && decoded.toString('base64') === value ? decoded : null;
};

const parseKeyInfo = (name: string, data: ITransitKeyData | undefined): ITransitKeyInfo => {
    if (!data || data.type !== 'ed25519' || typeof data.latest_version !== 'number' || !data.keys) {
        throw new OpenBaoError(`Transit key "${name}" is missing or is not an ed25519 key`, null);
    }

    const versions = Object.entries(data.keys)
        .map(([version, info]) => {
            if (!info.public_key || !decodeExact(info.public_key, ED25519_PUBLIC_KEY_BYTES)) {
                throw new OpenBaoError(`Transit key "${name}" version ${version} has an unexpected public key format`, null);
            }
            return { version: Number(version), publicKey: info.public_key, createdAt: info.creation_time ?? '' };
        })
        .sort((a, b) => a.version - b.version);

    return { name, latestVersion: data.latest_version, versions };
};

/**
 * Thin wrapper over OpenBao's Transit engine for Ed25519 keys. Private keys never
 * leave OpenBao: this only creates keys, rotates them, signs bytes and reads public keys.
 */
export const createTransitClient = (http: IOpenBaoHttp, mount: string) => {
    const getKey = async (name: string): Promise<ITransitKeyInfo | null> => {
        assertSafeName(name);
        const { status, body } = await http.request<{ data?: ITransitKeyData }>(
            'GET',
            `${mount}/keys/${name}`,
            undefined,
            { allowStatuses: [404] },
        );
        return status === 404 ? null : parseKeyInfo(name, body?.data);
    };

    return {
        getKey,

        /** Creates the key if it doesn't exist (non-exportable, no plaintext backup). Idempotent. */
        async ensureKey(name: string): Promise<ITransitKeyInfo> {
            const existing = await getKey(name);
            if (existing) return existing;

            try {
                await http.request('POST', `${mount}/keys/${name}`, {
                    type: 'ed25519',
                    exportable: false,
                    allow_plaintext_backup: false,
                });
            } catch (error) {
                // Two requests can race to create the same key; the loser should get the winner's key.
                const raced = await getKey(name);
                if (raced) return raced;
                throw error;
            }
            const created = await getKey(name);
            if (!created) throw new OpenBaoError(`Transit key "${name}" was not found after creation`, null);
            return created;
        },

        /** Adds a new key version. Old versions stay available for verification. */
        async rotateKey(name: string): Promise<ITransitKeyInfo> {
            assertSafeName(name);
            await http.request('POST', `${mount}/keys/${name}/rotate`, {});
            const rotated = await getKey(name);
            if (!rotated) throw new OpenBaoError(`Transit key "${name}" was not found after rotation`, null);
            return rotated;
        },

        /**
         * Pure Ed25519 over the given bytes (no pre-hashing) with an explicit key version, so the
         * caller never depends on "latest". Returns the raw 64-byte signature.
         */
        async sign(name: string, keyVersion: number, data: Uint8Array): Promise<Buffer> {
            assertSafeName(name);
            if (!Number.isInteger(keyVersion) || keyVersion < 1) {
                throw new OpenBaoError('Invalid key version', null);
            }

            const { body } = await http.request<{ data?: { signature?: string } }>('POST', `${mount}/sign/${name}`, {
                input: Buffer.from(data).toString('base64'),
                key_version: keyVersion,
            });

            const match = SIGNATURE_PATTERN.exec(body?.data?.signature ?? '');
            if (!match || Number(match[1]) !== keyVersion) {
                throw new OpenBaoError('Unexpected signature format from OpenBao', null);
            }
            const signature = decodeExact(match[2] as string, ED25519_SIGNATURE_BYTES);
            if (!signature) throw new OpenBaoError('Unexpected signature length from OpenBao', null);
            return signature;
        },
    };
};

export type ITransitClient = ReturnType<typeof createTransitClient>;