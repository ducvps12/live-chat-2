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

    // ACB Bank Payment
    ACB_ACCOUNT_NUMBER: process.env.ACB_ACCOUNT_NUMBER || '24488671',
    ACB_API_TOKEN: process.env.ACB_API_TOKEN || 'ec4f8aeb9d87bc0ffa48f709365313d1',
    ACB_API_URL: process.env.ACB_API_URL || 'https://api.sieuthicode.net/historyapiacb',
    ACB_ACCOUNT_NAME: process.env.ACB_ACCOUNT_NAME || 'NEMARK DIGITAL',
};
