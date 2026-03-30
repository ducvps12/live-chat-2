import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import cookieParser from 'cookie-parser';
import { env } from '../config/env';
import { connectDB } from '../infra/db';
import { initSocketGateway } from '../infra/socket';
import rootRouter from '../routes';
import { errorHandler, AppError } from '../middlewares/errorHandler';
import { requestIdMiddleware } from '../middlewares/requestId';
import { zaloService } from '../modules/zalo/zalo.service';

const bootstrap = async () => {
    // 1. Connect to Database
    await connectDB();

    // 2. Initialize Express application
    const app = express();

    // 3. Create HTTP server (needed for Socket.IO)
    const server = http.createServer(app);

    // 4. Initialize Socket.IO gateway
    initSocketGateway(server);

    // 5. Global Middlewares
    app.use(requestIdMiddleware); // must be first — every request gets an ID
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '20mb' }));
    app.use(express.urlencoded({ extended: true, limit: '20mb' }));
    app.use(cookieParser());

    // Serve static files (widget assets, uploaded files)
    app.use(express.static(path.join(process.cwd(), 'public')));
    
    // Custom morgan token: requestId
    morgan.token('reqId', (req: any) => req.requestId || '-');
    app.use(morgan(':method :url :status :response-time ms - reqId=:reqId'));

    // 6. Mount Routes
    app.use('/api', rootRouter);

    // 7. 404 Handler
    app.use((req, res, next) => {
        next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404, 'NOT_FOUND'));
    });

    // 8. Global Error Handler
    app.use(errorHandler);

    // 9. Start Server
    const port = env.PORT || 4000;
    server.listen(port, () => {
        console.log(`[Server] Backend process running on http://localhost:${port}`);
        
        // Boot up active Zalo sessions
        zaloService.bootActiveAccounts().catch(err => {
            console.error('[Server] Failed to boot Zalo accounts:', err);
        });
    });
};

// Handle unhandled rejections
process.on('unhandledRejection', (err: Error) => {
    console.error(`[Server] UNHANDLED REJECTION! 💥 Shutting down...`);
    console.error(err.name, err.message);
    process.exit(1);
});

// Run bootstrap
bootstrap();
