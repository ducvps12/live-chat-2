import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import mongoose from 'mongoose';

/**
 * Scope check middleware — multi-level.
 *
 * Checks membership at 3 levels (when the corresponding param exists):
 *   1. workspaceId  — user must be a member of the workspace
 *   2. teamId       — user must belong to the team within that workspace
 *   3. conversationId — user must be a participant of the conversation
 *
 * Usage:
 *   router.get('/:workspaceId/teams/:teamId/conversations/:conversationId', requireAuth, scopeCheck, controller)
 *
 * Admin role bypasses all scope checks.
 * The middleware attaches (req as any).workspaceRole for downstream permission use.
 */
export const scopeCheck = async (req: Request, _res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return next(new AppError('Chưa xác thực', 401, 'UNAUTHORIZED'));

        const { workspaceId, teamId, conversationId } = req.params;

        // No workspace param → nothing to scope
        if (!workspaceId) return next();

        // ── Admin bypass ──
        if (user.role === 'admin') {
            (req as any).workspaceRole = 'admin';
            return next();
        }

        // ── 1. Workspace scope ──
        // First try from user.workspaces array (populated at auth)
        if (user.workspaces && Array.isArray(user.workspaces)) {
            const membership = user.workspaces.find(
                (ws: any) => ws.workspaceId?.toString() === workspaceId
            );
            if (!membership) {
                return next(new AppError('Bạn không thuộc workspace này', 403, 'FORBIDDEN_WORKSPACE'));
            }
            (req as any).workspaceRole = membership.role;
        } else {
            // Fallback: query workspace directly
            const WorkspaceModel = mongoose.model('Workspace');
            const workspace = await WorkspaceModel.findOne({
                _id: workspaceId,
                'members.userId': user.id,
                isActive: true,
            }).lean();

            if (!workspace) {
                return next(new AppError('Bạn không thuộc workspace này', 403, 'FORBIDDEN_WORKSPACE'));
            }

            const member = (workspace as any).members.find(
                (m: any) => m.userId.toString() === user.id
            );
            (req as any).workspaceRole = member?.role || 'member';
        }

        // ── 2. Team scope (if teamId present) ──
        if (teamId) {
            try {
                const TeamModel = mongoose.model('Team');
                const team = await TeamModel.findOne({
                    _id: teamId,
                    workspaceId,
                }).lean();

                if (!team) {
                    return next(new AppError('Team không tồn tại trong workspace này', 404, 'TEAM_NOT_FOUND'));
                }

                // Check if user is a member of the team (or workspace admin/owner)
                const wsRole = (req as any).workspaceRole;
                if (wsRole !== 'owner' && wsRole !== 'admin') {
                    const isMember = (team as any).members?.some(
                        (m: any) => m.userId?.toString() === user.id
                    );
                    if (!isMember) {
                        return next(new AppError('Bạn không thuộc team này', 403, 'FORBIDDEN_TEAM'));
                    }
                }
                (req as any).teamRole = wsRole;
            } catch {
                // Team model might not exist yet — skip gracefully
            }
        }

        // ── 3. Conversation scope (if conversationId present) ──
        if (conversationId) {
            try {
                const ConversationModel = mongoose.model('Conversation');
                const conversation = await ConversationModel.findOne({
                    _id: conversationId,
                    workspaceId,
                }).lean();

                if (!conversation) {
                    return next(new AppError('Conversation không tồn tại', 404, 'CONVERSATION_NOT_FOUND'));
                }

                // Check agent assigned or workspace admin
                const wsRole = (req as any).workspaceRole;
                if (wsRole !== 'owner' && wsRole !== 'admin') {
                    const conv = conversation as any;
                    const isAssigned = conv.assignedTo?.toString() === user.id;
                    const isParticipant = conv.participants?.some(
                        (p: any) => p.userId?.toString() === user.id || p.toString() === user.id
                    );
                    if (!isAssigned && !isParticipant) {
                        return next(new AppError('Bạn không có quyền truy cập conversation này', 403, 'FORBIDDEN_CONVERSATION'));
                    }
                }
            } catch {
                // Conversation model might not exist yet — skip gracefully
            }
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Factory: scope check for Socket.IO events.
 * Returns a function that validates scope from event payload.
 *
 * Usage in socket handler:
 *   const ok = await socketScopeCheck(socket.user, { workspaceId, teamId, conversationId });
 *   if (!ok) return socket.emit('error', { code: 'FORBIDDEN' });
 */
export const socketScopeCheck = async (
    user: { id: string; role: string; workspaces?: any[] },
    scope: { workspaceId?: string; teamId?: string; conversationId?: string }
): Promise<{ allowed: boolean; code?: string; message?: string }> => {
    if (!user) return { allowed: false, code: 'UNAUTHORIZED', message: 'Chưa xác thực' };

    const { workspaceId, teamId, conversationId } = scope;
    if (!workspaceId) return { allowed: true };

    // Admin bypass
    if (user.role === 'admin') return { allowed: true };

    // Workspace check
    if (user.workspaces && Array.isArray(user.workspaces)) {
        const membership = user.workspaces.find(
            (ws: any) => ws.workspaceId?.toString() === workspaceId
        );
        if (!membership) return { allowed: false, code: 'FORBIDDEN_WORKSPACE', message: 'Không thuộc workspace' };
    } else {
        try {
            const WorkspaceModel = mongoose.model('Workspace');
            const ws = await WorkspaceModel.findOne({
                _id: workspaceId,
                'members.userId': user.id,
                isActive: true,
            }).lean();
            if (!ws) return { allowed: false, code: 'FORBIDDEN_WORKSPACE', message: 'Không thuộc workspace' };
        } catch {
            return { allowed: false, code: 'FORBIDDEN_WORKSPACE', message: 'Không thể xác minh workspace' };
        }
    }

    // Team check
    if (teamId) {
        try {
            const TeamModel = mongoose.model('Team');
            const team = await TeamModel.findOne({ _id: teamId, workspaceId }).lean();
            if (!team) return { allowed: false, code: 'TEAM_NOT_FOUND', message: 'Team không tồn tại' };
        } catch {
            // skip
        }
    }

    // Conversation check
    if (conversationId) {
        try {
            const ConversationModel = mongoose.model('Conversation');
            const conv = await ConversationModel.findOne({ _id: conversationId, workspaceId }).lean();
            if (!conv) return { allowed: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation không tồn tại' };

            const c = conv as any;
            const isAssigned = c.assignedTo?.toString() === user.id;
            const isParticipant = c.participants?.some(
                (p: any) => p.userId?.toString() === user.id || p.toString() === user.id
            );
            if (!isAssigned && !isParticipant) {
                return { allowed: false, code: 'FORBIDDEN_CONVERSATION', message: 'Không có quyền' };
            }
        } catch {
            // skip
        }
    }

    return { allowed: true };
};
