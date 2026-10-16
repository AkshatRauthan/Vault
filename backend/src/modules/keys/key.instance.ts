import { KeyRepository } from './key.repository';
import { createKeyService } from './key.service';

import { OpenBaoKeyProvider } from '@vault/infra/openbao';

/** The app's key service: Mongo for records, OpenBao for key material. */
export const KeyService = createKeyService({ repository: KeyRepository, provider: OpenBaoKeyProvider });