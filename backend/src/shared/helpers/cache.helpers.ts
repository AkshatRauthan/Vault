import { Logger } from "../utils";
import { CustomError } from "../errors";
import { StatusCodes } from "http-status-codes";

/** Redis failures fail closed: log, then surface as a non-operational 503. */
export const guard = async <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    try {
        return await fn();
    } catch (err) {
        Logger.error(`Session store failure: ${op}`, {
            error: err instanceof Error ? err.message : String(err),
        });
        throw new CustomError('Session service unavailable', StatusCodes.SERVICE_UNAVAILABLE, false);
    }
};