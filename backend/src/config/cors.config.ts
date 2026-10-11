import cors, { CorsOptions } from 'cors';

import { CustomError } from "@shared";
import ServerConfig from './server.config';
import { StatusCodes } from 'http-status-codes';

const allowedOrigins: string[] = [
    ...(ServerConfig.CORS_ORIGINS
        ? ServerConfig.CORS_ORIGINS.split(',').map((o) => o.trim())
        : []),
];

const CorsConfig: CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new CustomError(`CORS blocked: ${origin}`, StatusCodes.FORBIDDEN, true));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

export default cors(CorsConfig);