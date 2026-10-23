import './env';

import app from '@vault/app';
import { Logger } from '@shared';
import { ServerConfig } from "@vault/config";
import { requireOpenBaoToken } from "@vault/config";
import { initDbConnection, closeDbConnection } from "@vault/infra/db";
import { initCacheConnnection, closeCacheConnection } from "@vault/infra/cache";
import { initOpenBaoConnection, closeOpenBaoConnection } from "@vault/infra/openbao";


requireOpenBaoToken()
    .catch((error) => {
        Logger.fatal('Startup failed: openbao config missing', {
            stack: error instanceof Error ? error.stack : undefined,
        })
        process.exit(1);
    })


initDbConnection()
    .catch((error) => {
        Logger.fatal('Startup failed: db connection error', {
            stack: error instanceof Error ? error.stack : undefined,
        })
        process.exit(1);
    });


initCacheConnnection()
    .catch(() => {
        Logger.error("Cache connection failed")
    });


initOpenBaoConnection()
    .catch((error) => {
        Logger.error('Openbao connection error', {
            stack: error instanceof Error ? error.stack : undefined,
        })
    });


const HOST = process.env.HOST || '127.0.0.1';
const PORT: number = ServerConfig.PORT ? ServerConfig.PORT : 7860;

app.listen(PORT, HOST, () => {
    Logger.info(`Server running on http://${HOST}:${PORT}`);
    Logger.info(`Health checks: http://${HOST}:${PORT}/api/health`);
});