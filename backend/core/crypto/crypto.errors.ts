export type CryptoErrorCode =
    | 'EMPTY_INPUT'
    | 'SIZE_LIMIT_EXCEEDED'
    | 'INVALID_INDEX'
    | 'ALREADY_FINALIZED'
    | 'UNSUPPORTED_VALUE';

/**
 * core/crypto stays free of HTTP and app concerns, so it throws its own plain
 * error. The calling module decides how to map it (e.g. to a CustomError).
 */
export class CryptoError extends Error {
    public readonly code: CryptoErrorCode;

    constructor(message: string, code: CryptoErrorCode) {
        super(message);
        this.name = 'CryptoError';
        this.code = code;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}