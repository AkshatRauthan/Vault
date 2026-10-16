import { IKeyProvider, IPlatformKeyRef, IProviderKey } from '../../../core/sign';
import { OpenBaoError } from './openbao.http';
import { ITransitClient, ITransitKeyInfo } from './openbao.transit';

/** OpenBao names for user keys. The keyId is a uuid, so the name always passes the client's name check. */
const userKeyName = (keyId: string): string => `user-${keyId}`;

const toProviderKey = (info: ITransitKeyInfo): IProviderKey => ({
    latestVersion: info.latestVersion,
    versions: info.versions,
});

/**
 * Adapts the Transit clients to IKeyProvider. User keys and the platform certification key sit in
 * separate mounts, so the app token can never reach the platform key through a user-key path.
 */
export const createOpenBaoKeyProvider = (
    userKeys: ITransitClient,
    platformKeys: ITransitClient,
    platformKeyName: string,
): IKeyProvider => ({
    async ensureUserKey(keyId: string): Promise<IProviderKey> {
        return toProviderKey(await userKeys.ensureKey(userKeyName(keyId)));
    },

    async rotateUserKey(keyId: string): Promise<IProviderKey> {
        return toProviderKey(await userKeys.rotateKey(userKeyName(keyId)));
    },

    signWithUserKey(keyId: string, keyVersion: number, data: Uint8Array): Promise<Buffer> {
        return userKeys.sign(userKeyName(keyId), keyVersion, data);
    },

    async getPlatformKey(): Promise<IPlatformKeyRef> {
        const info = await platformKeys.getKey(platformKeyName);
        const latest = info?.versions.find((version) => version.version === info.latestVersion);
        if (!info || !latest) {
            throw new OpenBaoError(`Platform key "${platformKeyName}" is missing; run pnpm openbao:bootstrap`, null);
        }
        return { keyId: platformKeyName, keyVersion: latest.version, publicKey: latest.publicKey };
    },

    signWithPlatformKey(keyVersion: number, data: Uint8Array): Promise<Buffer> {
        return platformKeys.sign(platformKeyName, keyVersion, data);
    },
});