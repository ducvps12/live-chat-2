import mongoose from 'mongoose';
import { env } from '../config/env';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.MONGO_URI);
        console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[DB] MongoDB Connection Error: ${(error as Error).message}`);
        process.exit(1);
    }
};
