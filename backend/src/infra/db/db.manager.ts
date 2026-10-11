// src/infra/db/db.manager.ts
import mongoose from 'mongoose';
import { DbConfig } from '@vault/config';
import { CustomError, Logger } from '@shared';

/**
 * Attaches event listeners to the default Mongoose connection.
 * We do this outside the connect function so they are only registered once.
 */
mongoose.connection.on('connected', () => {
    Logger.info('mongodb connected', { label: 'mongodb' });
});

mongoose.connection.on('error', (err: Error) => {
    Logger.error('mongodb connection error', {
        label: 'mongodb',
        stack: err.stack,
        message: err.message,
    });
});

mongoose.connection.on('disconnected', () => {
    Logger.info('mongodb disconnected', { label: 'mongodb' });
});

mongoose.connection.on('reconnected', () => {
    Logger.info('mongodb reconnected after outage', { label: 'mongodb' });
});

/**
 * Establishes the connection to MongoDB. 
 * Throws a CustomError if the initial connection fails, allowing the startup 
 * process in main.ts to catch it and decide whether to crash or retry.
 */
export const initDbConnection = async (): Promise<void> => {
    // Prevent duplicate connections if called multiple times
    if (mongoose.connection.readyState >= 1) {
        Logger.info('mongodb is already connected or connecting', { label: 'mongodb' });
        return;
    }

    try {
        await mongoose.connect(DbConfig.MONGO_URI, {
            // Mongoose 6+ defaults are usually fine, but these are good for production:
            maxPoolSize: 10,                // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            family: 4                       // Use IPv4, skip trying IPv6
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CustomError(`Database is unreachable: ${message}`, 503, true);
    }
};

/**
 * Gracefully closes the MongoDB connection.
 * Used during application teardown / SIGTERM handling.
 */
export const closeDbConnection = async (): Promise<void> => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        Logger.warn('mongodb connection ended', { label: 'mongodb' });
    }
};

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export const getDbStatus = (): string =>
    DB_STATES[mongoose.connection.readyState as number] ?? 'disconnected';


export const pingDb = async (): Promise<void> => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('not connected');
    await db.admin().ping();
};
