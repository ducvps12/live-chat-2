import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import cookieParser from 'cookie-parser';
import next from 'next';
import { env } from '../config/env';
import { connectDB } from '../infra/db';
import { initSocketGateway } from '../infra/socket';
import rootRouter from '../routes';
import { errorHandler, AppError } from '../middlewares/errorHandler';
import { requestIdMiddleware } from '../middlewares/requestId';
import { zaloService } from '../modules/zalo/zalo.service';

/**
 * Production bootstrap: serves Next.js + Express API + Socket.IO on ONE port.
 * Usage:  NODE_ENV=production node --import tsx src/bootstrap/production.ts
 * Or:     NODE_ENV=production tsx src/bootstrap/production.ts
 */
const bootstrap = async () => {
    const dev = process.env.NODE_ENV !== 'production';
    const port = Number(process.env.PORT || env.PORT || 4001);

    // 1. Connect to Database
    await connectDB();

    // 2. Prepare Next.js
    const nextApp = next({ dev, dir: process.cwd() });
    const nextHandler = nextApp.getRequestHandler();
    await nextApp.prepare();
    console.log(`[Server] Next.js prepared (${dev ? 'development' : 'production'} mode)`);

    // 3. Initialize Express
    const app = express();
    const server = http.createServer(app);

    // 4. Initialize Socket.IO
    initSocketGateway(server);

    // 5. Global Middlewares
    app.use(requestIdMiddleware);
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '20mb' }));
    app.use(express.urlencoded({ extended: true, limit: '20mb' }));
    app.use(cookieParser());

    // Static files
    app.use(express.static(path.join(process.cwd(), 'public')));

    // Logging
    morgan.token('reqId', (req: any) => req.requestId || '-');
    app.use(morgan(':method :url :status :response-time ms - reqId=:reqId'));

    // 6. Mount API Routes
    app.use('/api', rootRouter);

    // 7. Let Next.js handle EVERYTHING else (pages, _next statics, etc.)
    app.all('*', (req: any, res: any) => {
        return nextHandler(req, res);
    });

    // 8. Error handler (for API routes only — Next.js handles its own errors)
    app.use(errorHandler);

    // 9. Start on single port
    server.listen(port, '0.0.0.0', () => {
        console.log(`[Server] ✅ NemarkChat running on http://localhost:${port}`);
        console.log(`[Server]    API:    http://localhost:${port}/api`);
        console.log(`[Server]    Web:    http://localhost:${port}`);
        console.log(`[Server]    Socket: ws://localhost:${port}`);

        // Boot Zalo sessions
        zaloService.bootActiveAccounts().catch(err => {
            console.error('[Server] Failed to boot Zalo accounts:', err);
        });
    });
};

process.on('unhandledRejection', (err: Error) => {
    console.error(`[Server] UNHANDLED REJECTION! 💥 Shutting down...`);
    console.error(err.name, err.message);
    process.exit(1);
});

bootstrap();
