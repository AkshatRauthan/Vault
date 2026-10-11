import winston from 'winston';

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const LOG_LEVEL = env('MIN_LOG_LEVEL', 'info');
const NODE_ENV = env('NODE_ENV', 'development');
const SERVICE_NAME = env('SERVICE_NAME', 'vault-backend');

/**
 * Custom log levels extending Winston's defaults:
 *   fatal(0) > error(1) > warn(2) > info(3) > debug(4) > trace(5)
 *
 * Use:
 *   logger.fatal  — app is broken, needs immediate human intervention
 *   logger.error  — operation failed, user affected, app still running
 *   logger.warn   — unexpected but recovered, user not affected
 *   logger.info   — normal behaviour worth knowing (startup, batch complete)
 *   logger.debug  — developer detail, turn off in production
 *   logger.trace  — extremely granular, never in production
 */
const customLevels = {
    levels: {
        fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5
    },
    colors: {
        fatal: 'red', error: 'red', warn: 'yellow', info: 'green', debug: 'blue', trace: 'gray'
    },
};

winston.addColors(customLevels.colors);

/**
 * Winston's own type only knows about its 7 built-in levels (error, warn,
 * info, http, verbose, debug, silly), so `fatal` and `trace` aren't typed
 * on the default Logger interface even though they exist at runtime once
 * registered via customLevels. This interface describes the actual shape
 * we get back, so call sites get real type checking instead of `any`.
 */
interface LeveledLogger extends winston.Logger {
    fatal: winston.LeveledLogMethod;
    trace: winston.LeveledLogMethod;
}

// Production: pure JSON — one log line per event, easy to ingest into
// CloudWatch / Grafana / Datadog without any parsing.
const jsonFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => new Date().toISOString(),
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

// Development: colorized, human-readable single line.
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`;
    }),
);

const winstonLogger = winston.createLogger({
    levels: customLevels.levels,
    level: LOG_LEVEL,
    defaultMeta: { service: SERVICE_NAME },
    format: NODE_ENV === 'production' ? jsonFormat : devFormat,
    transports: [new winston.transports.Console()],
    exitOnError: false,
}) as LeveledLogger;

/**
 * Typed logger wrapper — enforces the 6-level convention across all services.
 * @param message The message to be displayed in the log
 * @param meta The optional metadata field of object type
 */
export const Logger = {
    /** App completely broken — requires immediate human intervention. */
    fatal: (message: string, meta?: object) => winstonLogger.fatal({ message, ...meta }),

    /** Operation failed, user received an error, app still running. */
    error: (message: string, meta?: object) => winstonLogger.error({ message, ...meta }),

    /** Unexpected but recovered — user not affected. */
    warn: (message: string, meta?: object) => winstonLogger.warn({ message, ...meta }),

    /** Normal app behaviour worth recording. */
    info: (message: string, meta?: object) => winstonLogger.info({ message, ...meta }),

    /** Developer detail — never enable in production. */
    debug: (message: string, meta?: object) => winstonLogger.debug({ message, ...meta }),

    /** Extremely granular — never in production, floods disk. */
    trace: (message: string, meta?: object) => winstonLogger.trace({ message, ...meta }),
};