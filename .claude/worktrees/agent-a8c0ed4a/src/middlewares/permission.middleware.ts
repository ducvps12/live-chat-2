import { Request, Response, NextFunction } from 'express';
import { hasPermission, PermissionKey } from '../config/permissions';
import { AppError } from './errorHandler';

/**
 * Middleware: check if authenticated user's role has the required permission.
 * Usage: router.post('/...', requireAuth, requirePermission('workspace:create'), controller)
 */
export const requirePermission = (...requiredPermissions: PermissionKey[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) {
            return next(new AppError('Chưa xác thực, vui lòng đăng nhập', 401, 'UNAUTHORIZED'));
        }

        const hasAll = requiredPermissions.every((perm) => hasPermission(user.role, perm));
        if (!hasAll) {
            return next(
                new AppError(
                    'Bạn không có quyền thực hiện hành động này',
                    403,
                    'FORBIDDEN'
                )
            );
        }

        next();
    };
};
