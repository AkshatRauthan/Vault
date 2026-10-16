export { keyRouter } from './key.routes';
export { KeyService } from './key.instance';
export { createKeyService } from './key.service';
export type { IKeyService, IKeyServiceDeps } from './key.service';

export type {
    KeyStatus,
    IKeyContext,
    RevokeReason,
    IKeyRepository,
    IKeyVersionView,
    IPublicKeyBundle,
    IKeyVersionRecord,
} from './key.types';