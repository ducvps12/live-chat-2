import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// ────────── Error Codes ──────────
export const ERROR_CODES = {
    // Auth
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    INVALID_TOKEN: 'INVALID_TOKEN',

    // Scope
    FORBIDDEN_WORKSPACE: 'FORBIDDEN_WORKSPACE',
    FORBIDDEN_TEAM: 'FORBIDDEN_TEAM',
    FORBIDDEN_CONVERSATION: 'FORBIDDEN_CONVERSATION',

    // CRUD
    NOT_FOUND: 'NOT_FOUND',
    TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
    CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
    DUPLICATE_ERROR: 'DUPLICATE_ERROR',

    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',

    // Server
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
} as const;

// ────────── AppError class ──────────
export class AppError extends Error {
    public statusCode: number;
    public code: string;
    public isOperational: boolean;

    constructor(message: string, statusCode: number, code: string = ERROR_CODES.INTERNAL_ERROR) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

// ────────── Centralized Error Handler ──────────
export const errorHandler = (err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId || 'unknown';
    const correlationId = (req as any).correlationId || requestId;

    let statusCode = 500;
    let code: string = ERROR_CODES.INTERNAL_ERROR;
    let message = err.message || 'Internal Server Error';
    let isOperational = false;

    // ── Known error types ──
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        code = err.code;
        isOperational = err.isOperational;
    } else if (err.name === 'ValidationError') {
        statusCode = 400;
        code = ERROR_CODES.VALIDATION_ERROR;
        isOperational = true;
    } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        code = ERROR_CODES.INVALID_TOKEN;
        message = 'Token không hợp lệ';
        isOperational = true;
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        code = ERROR_CODES.TOKEN_EXPIRED;
        message = 'Token đã hết hạn';
        isOperational = true;
    } else if (err.name === 'MongoServerError' && (err as any).code === 11000) {
        statusCode = 409;
        code = ERROR_CODES.DUPLICATE_ERROR;
        message = 'Dữ liệu đã tồn tại (trùng lặp)';
        isOperational = true;
    } else if (err.name === 'CastError') {
        statusCode = 400;
        code = ERROR_CODES.VALIDATION_ERROR;
        message = 'ID không hợp lệ';
        isOperational = true;
    }

    // ── Logging ──
    const logLevel = statusCode >= 500 ? 'ERROR' : 'WARN';
    const logData = {
        level: logLevel,
        requestId,
        correlationId,
        method: req.method,
        url: req.originalUrl,
        statusCode,
        code,
        message: err.message,
        userId: (req as any).user?.id,
        ...(statusCode >= 500 && { stack: err.stack }),
    };

    if (statusCode >= 500) {
        console.error(`[${logLevel}] [reqId=${requestId}] [corrId=${correlationId}] ${req.method} ${req.originalUrl} → ${statusCode} ${code}: ${err.message}`);
        if (env.NODE_ENV === 'development') console.error(err.stack);
    } else {
        console.warn(`[${logLevel}] [reqId=${requestId}] ${req.method} ${req.originalUrl} → ${statusCode} ${code}: ${err.message}`);
    }

    // ── Response ──
    const response: any = {
        success: false,
        error: {
            code,
            message: statusCode >= 500 && env.NODE_ENV !== 'development'
                ? 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau'
                : message,
            requestId,
            correlationId,
        },
    };

    // Dev-only: include stack trace
    if (env.NODE_ENV === 'development') {
        response.error.stack = err.stack;
    }

    res.status(statusCode).json(response);
};
