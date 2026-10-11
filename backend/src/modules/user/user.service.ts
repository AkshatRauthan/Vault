import { CustomError, Logger } from '@shared';
import { StatusCodes } from 'http-status-codes';

import { UserRepository } from './user.repository';
import { MONGO_DUPLICATE_KEY_CODE } from './user.constants';
import { ICreateUserInput, IPublicUser, IUserCredentials, UserDocument } from './user.types';

const toPublicUser = (doc: UserDocument): IPublicUser => ({
    userId: doc.userId,
    email: doc.email,
    tag: doc.tag,
    name: doc.name,
    isVerified: doc.isVerified,
    createdAt: doc.createdAt,
});

const toCredentials = (doc: UserDocument | null): IUserCredentials | null =>
    doc ? { user: toPublicUser(doc), passwordHash: doc.passwordHash } : null;

const isDuplicateKeyError = (err: unknown): err is { code: number; keyPattern?: Record<string, number> } =>
    typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE;

export const UsersService = {
    /** Throws 409 on duplicate email or tag. The unique indexes are what make this race-safe. */
    async createUser(input: ICreateUserInput): Promise<IPublicUser> {
        try {
            return toPublicUser(await UserRepository.create(input));
        } catch (err) {
            if (isDuplicateKeyError(err)) {
                const field = Object.keys(err.keyPattern ?? {})[0];
                throw new CustomError(
                    field === 'tag' ? 'Tag already taken' : 'Email already registered',
                    StatusCodes.CONFLICT,
                );
            }
            Logger.error('Failed to create user', {
                error: err instanceof Error ? err.message : String(err),
            });
            throw new CustomError('Unable to create user', StatusCodes.INTERNAL_SERVER_ERROR, false);
        }
    },

    async findUserById(userId: string): Promise<IPublicUser | null> {
        const doc = await UserRepository.findById(userId);
        return doc ? toPublicUser(doc) : null;
    },

    /**
     * Login lookup. An identifier containing '@' is an email, anything else is a tag
     * (tags can't contain '@', so the two never collide). Returns the password hash
     * for verification; it's undefined for OAuth-only users.
     */
    async findCredentialsByIdentifier(identifier: string): Promise<IUserCredentials | null> {
        const normalized = identifier.trim().toLowerCase();
        const doc = normalized.includes('@')
            ? await UserRepository.findByEmailWithPassword(normalized)
            : await UserRepository.findByTagWithPassword(normalized);
        return toCredentials(doc);
    },

    /** For reauth and change-password, where the session already identifies the user. */
    async findCredentialsById(userId: string): Promise<IUserCredentials | null> {
        return toCredentials(await UserRepository.findByIdWithPassword(userId));
    },

    async isTagAvailable(tag: string): Promise<boolean> {
        return !(await UserRepository.tagExists(tag));
    },

    async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
        if (!(await UserRepository.updatePasswordHash(userId, passwordHash))) {
            throw new CustomError('User not found', StatusCodes.NOT_FOUND);
        }
    },

    async updateUserName(userId: string, name: string): Promise<IPublicUser> {
        const doc = await UserRepository.updateName(userId, name);
        if (!doc) throw new CustomError('User not found', StatusCodes.NOT_FOUND);
        return toPublicUser(doc);
    },
};