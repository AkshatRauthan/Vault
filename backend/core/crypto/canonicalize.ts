import { CryptoError } from './crypto.errors';

/**
 * RFC 8785 (JSON Canonicalization Scheme) for I-JSON values: null, booleans, finite
 * numbers, well-formed strings, arrays and plain objects. Signing and verifying must
 * use identical bytes, so anything outside that set is rejected, never coerced.
 *
 * - Object keys are sorted by UTF-16 code units (the default JS sort).
 * - Numbers and strings serialize exactly as JSON.stringify does, which is what the
 *   RFC specifies (ECMAScript Number serialization, minimal string escaping).
 */

// Lone surrogates aren't valid I-JSON and would serialize ambiguously.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const unsupported = (message: string): CryptoError => new CryptoError(message, 'UNSUPPORTED_VALUE');

const serializeString = (value: string): string => {
    if (LONE_SURROGATE.test(value)) throw unsupported('Strings must be well-formed Unicode');
    return JSON.stringify(value);
};

const serializeObject = (value: object): string => {
    if (Array.isArray(value)) {
        return `[${value.map((item: unknown) => serialize(item)).join(',')}]`;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw unsupported('Only plain objects and arrays can be canonicalized');
    }

    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
        .sort()
        .map((key) => `${serializeString(key)}:${serialize(record[key])}`);
    return `{${members.join(',')}}`;
};

const serialize = (value: unknown): string => {
    if (value === null) return 'null';

    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false';
        case 'number':
            if (!Number.isFinite(value)) throw unsupported('Numbers must be finite');
            return JSON.stringify(value);
        case 'string':
            return serializeString(value);
        case 'object':
            return serializeObject(value);
        default:
            // undefined, function, symbol, bigint
            throw unsupported(`Unsupported value type: ${typeof value}`);
    }
};

export const canonicalize = (value: unknown): string => serialize(value);

/** The exact bytes that get signed: canonical JSON as UTF-8. */
export const canonicalBytes = (value: unknown): Buffer => Buffer.from(serialize(value), 'utf8');