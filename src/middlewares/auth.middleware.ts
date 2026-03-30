import { Request, Response, NextFunction } from 'express';
import { security } from '../infra/security';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        name: string;
        role: string;
        email: string;
    };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('Not authorized to access this route', 401, 'UNAUTHORIZED'));
    }

    try {
        const decoded = security.verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return next(new AppError('Token invalid or expired', 401, 'UNAUTHORIZED'));
    }
};

export const requireRole = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.role?.toLowerCase();
        if (!req.user || !userRole || !roles.some(r => r.toLowerCase() === userRole)) {
            return next(new AppError('Not authorized for this action', 403, 'FORBIDDEN'));
        }
        next();
    };
};
