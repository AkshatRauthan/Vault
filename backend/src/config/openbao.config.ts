import { getEnv, getPositiveInteger } from '@shared';

export const OpenBaoConfig = {
    ADDR: getEnv('OPENBAO_ADDR', 'https://localhost:8200'),

    /** Relative to the working directory (the backend root). */
    CA_CERT_PATH: getEnv('OPENBAO_CA_CERT_PATH', '.docker/openbao/pki/ca.crt'),

    /** The app's limited token (policy vault-app). No fallback: a missing credential must fail startup. */
    TOKEN: getEnv('OPENBAO_TOKEN', 'root-token'),

    /** Transit mount holding the per-user signing keys. Kept apart from the platform key's mount. */
    USER_KEYS_MOUNT: getEnv('OPENBAO_USER_KEYS_MOUNT', 'user-keys'),
    
    /** Transit mount holding only the platform certification key. */
    PLATFORM_KEYS_MOUNT: getEnv('OPENBAO_PLATFORM_KEYS_MOUNT', 'platform-keys'),
    PLATFORM_KEY_NAME: getEnv('OPENBAO_PLATFORM_KEY_NAME', 'platform-certification'),
    TIMEOUT_MS: getPositiveInteger('OPENBAO_TIMEOUT_MS', '5000'),
};

/** Call in the OpenBao client constructor and in main.ts before listen(). Never from bootstrap. */
export const requireOpenBaoToken = (): string => {
    if (!OpenBaoConfig.TOKEN || OpenBaoConfig.TOKEN === 'root-token') {
        throw new Error('OPENBAO_TOKEN is not set. Run the bootstrap script and set the app token first.');
    }
    return OpenBaoConfig.TOKEN;
};
 