import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import prisma from '../infra/prisma';

export const scopeCheck = async (req: Request, _res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return next(new AppError('Chưa xác thực', 401, 'UNAUTHORIZED'));
        const { workspaceId, conversationId } = req.params;
        if (!workspaceId) return next();
        if (user.role === 'admin') { (req as any).workspaceRole = 'admin'; return next(); }

        if (user.workspaces && Array.isArray(user.workspaces)) {
            const membership = user.workspaces.find((ws: any) => ws.workspaceId?.toString() === workspaceId);
            if (!membership) return next(new AppError('Bạn không thuộc workspace này', 403, 'FORBIDDEN_WORKSPACE'));
            (req as any).workspaceRole = membership.role;
        } else {
            const member = await prisma.workspaceMember.findFirst({
                where: { workspaceId: workspaceId as string, userId: user.id },
                include: { workspace: { select: { isActive: true } } },
            });
            if (!member || !member.workspace.isActive) return next(new AppError('Bạn không thuộc workspace này', 403, 'FORBIDDEN_WORKSPACE'));
            (req as any).workspaceRole = member.role || 'member';
        }

        if (conversationId) {
            try {
                const conv = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
                if (!conv) return next(new AppError('Conversation không tồn tại', 404, 'CONVERSATION_NOT_FOUND'));
                const wsRole = (req as any).workspaceRole;
                if (wsRole !== 'owner' && wsRole !== 'admin' && conv.assignedTo !== user.id) {
                    return next(new AppError('Không có quyền truy cập conversation này', 403, 'FORBIDDEN_CONVERSATION'));
                }
            } catch { /* skip */ }
        }
        next();
    } catch (err) { next(err); }
};

export const socketScopeCheck = async (
    user: { id: string; role: string; workspaces?: any[] },
    scope: { workspaceId?: string; conversationId?: string }
): Promise<{ allowed: boolean; code?: string; message?: string }> => {
    if (!user) return { allowed: false, code: 'UNAUTHORIZED', message: 'Chưa xác thực' };
    const { workspaceId, conversationId } = scope;
    if (!workspaceId) return { allowed: true };
    if (user.role === 'admin') return { allowed: true };

    if (user.workspaces && Array.isArray(user.workspaces)) {
        if (!user.workspaces.find((ws: any) => ws.workspaceId?.toString() === workspaceId))
            return { allowed: false, code: 'FORBIDDEN_WORKSPACE', message: 'Không thuộc workspace' };
    } else {
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: user.id },
            include: { workspace: { select: { isActive: true } } },
        });
        if (!member || !member.workspace.isActive)
            return { allowed: false, code: 'FORBIDDEN_WORKSPACE', message: 'Không thuộc workspace' };
    }

    if (conversationId) {
        try {
            const conv = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
            if (!conv) return { allowed: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation không tồn tại' };
            if (conv.assignedTo !== user.id) return { allowed: false, code: 'FORBIDDEN_CONVERSATION', message: 'Không có quyền' };
        } catch { /* skip */ }
    }
    return { allowed: true };
};
