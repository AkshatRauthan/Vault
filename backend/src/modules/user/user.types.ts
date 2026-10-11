import { IUser } from './user.model';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<IUser>;

/** The only user shape that leaves this module. Never contains passwordHash. */
export interface IPublicUser {
    userId: string;
    email: string;
    tag: string;
    name: string;
    isVerified: boolean;
    createdAt: Date;
}

export interface ICreateUserInput {
    email: string;
    tag: string;
    name: string;
    /** Omit for OAuth-only users (later). */
    passwordHash?: string;
}

/** For auth flows only (login, reauth, change-password). */
export interface IUserCredentials {
    user: IPublicUser;
    passwordHash?: string;
}