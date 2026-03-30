import { prisma } from './prisma';

export const connectDB = async () => {
    try {
        // Test the connection
        await prisma.$connect();
        console.log(`[DB] MySQL Connected via Prisma`);
    } catch (error) {
        console.error(`[DB] MySQL Connection Error: ${(error as Error).message}`);
        process.exit(1);
    }
};

export const disconnectDB = async () => {
    await prisma.$disconnect();
    console.log('[DB] MySQL Disconnected');
};
