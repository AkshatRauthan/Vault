import { UserModel } from './user.model';
import { ICreateUserInput, UserDocument } from './user.types';

/**
 * All Mongoose access lives here. Filters use `_id` (the stored field behind
 * the `userId` alias), since Mongoose doesn't translate aliases in filters.
 * Methods return hydrated documents so the `userId` alias is available.
 */
export const UserRepository = {
    findById: (userId: string): Promise<UserDocument | null> =>
        UserModel.findById(userId).exec(),

    findByIdWithPassword: (userId: string): Promise<UserDocument | null> =>
        UserModel.findById(userId).select('+passwordHash').exec(),

    findByEmailWithPassword: (email: string): Promise<UserDocument | null> =>
        UserModel.findOne({ email }).select('+passwordHash').exec(),

    findByTagWithPassword: (tag: string): Promise<UserDocument | null> =>
        UserModel.findOne({ tag }).select('+passwordHash').exec(),

    tagExists: async (tag: string): Promise<boolean> =>
        (await UserModel.exists({ tag })) !== null,

    create: (input: ICreateUserInput): Promise<UserDocument> => UserModel.create(input),

    /** Returns false if the user doesn't exist. */
    updatePasswordHash: async (userId: string, passwordHash: string): Promise<boolean> => {
        const result = await UserModel.updateOne({ _id: userId }, { $set: { passwordHash } }).exec();
        return result.matchedCount === 1;
    },

    updateName: (userId: string, name: string): Promise<UserDocument | null> =>
        UserModel.findByIdAndUpdate(userId, { $set: { name } }, { new: true, runValidators: true }).exec(),
};