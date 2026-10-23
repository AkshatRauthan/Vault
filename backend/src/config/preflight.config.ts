import { getEnv, getPositiveInteger } from '@shared';
import type { IPreflightLimits } from '@core/pdf';

export const PreflightConfig: IPreflightLimits = {
    maxFileSizeBytes: getPositiveInteger('PREFLIGHT_MAX_FILE_SIZE_BYTES', String(100 * 1024 * 1024)), // 100 MB
    maxPages: getPositiveInteger('PREFLIGHT_MAX_PAGES', '1000'),
    maxWorkerMemoryMb: getPositiveInteger('PREFLIGHT_MAX_WORKER_MEMORY_MB', '512'),
    /** Applies separately to the qpdf check and to the worker. */
    workerTimeoutMs: getPositiveInteger('PREFLIGHT_TIMEOUT_MS', '30000'),
    /** qpdf must be installed (apt-get install qpdf) and pinned in the Docker image. */
    qpdfPath: getEnv('PREFLIGHT_QPDF_PATH', 'qpdf'),
};