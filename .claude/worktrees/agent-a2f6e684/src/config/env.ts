import dotenv from 'dotenv';
dotenv.config();

export const env = {
    PORT: process.env.SERVER_PORT || 4010,
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nemark_dev',
    JWT_SECRET: process.env.JWT_SECRET || 'nemark-super-secret-key',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

    // Browser Pool (Remote Session)
    BROWSER_POOL_MAX: Number(process.env.BROWSER_POOL_MAX) || 5,
    BROWSER_HEADLESS: process.env.BROWSER_HEADLESS !== 'false',
    SCREENCAST_QUALITY: Number(process.env.SCREENCAST_QUALITY) || 60,
    SCREENCAST_FPS: Number(process.env.SCREENCAST_FPS) || 10,
};
