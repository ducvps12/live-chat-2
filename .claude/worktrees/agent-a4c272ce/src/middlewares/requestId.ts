import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Attach a unique requestId (and optional correlationId from client header)
 * to every incoming request. Both are forwarded in the response headers.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    const correlationId = (req.headers['x-correlation-id'] as string) || requestId;

    // Attach to request for downstream usage (logging, error handler)
    (req as any).requestId = requestId;
    (req as any).correlationId = correlationId;

    // Return in response headers so client can trace
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);

    next();
};
