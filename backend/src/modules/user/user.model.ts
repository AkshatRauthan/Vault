import { Schema, model } from 'mongoose';
import { uuidv7 } from 'uuidv7';

export interface IUser {
    /** Primary key (uuidv7). MongoDB mandates an `_id`, so it is stored there and exposed as `userId`. */
    _id: string;
    userId: string;
    email: string;
    /** Public handle chosen at register. Lowercase, unique, immutable. Also accepted as a login identifier. */
    tag: string;
    name: string;
    /** Optional so OAuth-only users (Google, later) can exist without a password. */
    passwordHash?: string;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Serialized output exposes `userId` only; the raw `_id` never leaves the model layer.
const stripInternalId = (_doc: unknown, ret: Record<string, unknown>) => {
    delete ret._id;
    return ret;
};

const userSchema = new Schema<IUser>(
    {
        // `_id` is always uniquely indexed by MongoDB, so userId needs no extra index.
        _id: { type: String, default: () => uuidv7(), alias: 'userId' },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254,
        },

        tag: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            immutable: true,
            // Safety net only; the zod schema is the real validator (and blocks reserved tags).
            match: /^[a-z][a-z0-9_]{2,19}$/,
        },

        name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },

        // Never returned by default. Login must opt in: .select('+passwordHash')
        passwordHash: { type: String, select: false },

        isVerified: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        versionKey: false,
        id: false, // drop Mongoose's default `id` virtual
        toJSON: { virtuals: true, transform: stripInternalId },
        toObject: { virtuals: true, transform: stripInternalId },
    },
);

export const UserModel = model<IUser>('User', userSchema);