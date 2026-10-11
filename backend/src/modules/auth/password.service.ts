import { Logger } from '@shared';
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

// Library defaults for argon2id. The dummy hash below must use the same options,
// so a "user not found" verify costs the same as a real one.
const HASH_OPTIONS = { type: argon2id } as const;

let dummyHashPromise: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
    (dummyHashPromise ??= hash(randomBytes(16).toString('hex'), HASH_OPTIONS));

export const PasswordService = {
    hashPassword: (plain: string): Promise<string> => hash(plain, HASH_OPTIONS),

    /**
     * Always performs one argon2 verify, even when there's no stored hash
     * (unknown user, OAuth-only user), so response time doesn't reveal which
     * case it was. A malformed stored hash is logged and treated as a mismatch.
     */
    async verifyPassword(plain: string, storedHash?: string): Promise<boolean> {
        if (!storedHash) {
            await verify(await getDummyHash(), plain);
            return false;
        }
        try {
            return await verify(storedHash, plain);
        } catch (err) {
            Logger.error('Password verification failed unexpectedly', {
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        }
    },
};