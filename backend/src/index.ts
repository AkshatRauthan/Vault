import './env';

import app from '@vault/app';
import { ServerConfig } from "@vault/config";
import { CustomError, Logger } from '@shared';
import { initDbConnection, closeDbConnection } from "@vault/infra/db";
import { initCacheConnnection, closeCacheConnection } from "@vault/infra/cache";

const HOST = process.env.HOST || '127.0.0.1';
const PORT: number = ServerConfig.PORT ? ServerConfig.PORT : 7860;

app.listen(PORT, HOST, () => {
    Logger.info(`Server running on http://${HOST}:${PORT}`);
    Logger.info(`Health checks: http://${HOST}:${PORT}/api/health`);
});

initDbConnection()
    .catch((error) => {
        Logger.fatal('Startup failed: db connection error', {
            stack: error instanceof Error ? error.stack : undefined,
        })
        process.exit(1);
    });


initCacheConnnection()
    .catch((error) => {
        Logger.error("Cache connection failed")
    });