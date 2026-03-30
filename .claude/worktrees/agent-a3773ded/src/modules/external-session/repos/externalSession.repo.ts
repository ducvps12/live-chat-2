import { ExternalSessionModel, IExternalSession, SessionStatus } from './externalSession.model';
import { SessionAuditLogModel, AuditAction } from './sessionAuditLog.model';

export const externalSessionRepo = {
    create: async (data: Partial<IExternalSession>) => {
        return ExternalSessionModel.create(data);
    },

    findById: async (id: string) => {
        return ExternalSessionModel.findById(id);
    },

    findByWorkspace: async (workspaceId: string) => {
        return ExternalSessionModel.find({ workspaceId })
            .sort({ createdAt: -1 })
            .populate('createdBy', 'name email')
            .populate('controlledBy', 'name email');
    },

    findActive: async (sessionId: string) => {
        return ExternalSessionModel.findOne({
            _id: sessionId,
            status: { $nin: ['revoked'] },
        });
    },

    updateStatus: async (sessionId: string, status: SessionStatus, extra: Record<string, any> = {}) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            { $set: { status, lastActiveAt: new Date(), ...extra } },
            { new: true }
        );
    },

    setController: async (sessionId: string, userId: string | null) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            {
                $set: {
                    controlledBy: userId,
                    controlLockedAt: userId ? new Date() : null,
                    lastActiveAt: new Date(),
                },
            },
            { new: true }
        );
    },

    addViewer: async (sessionId: string, userId: string) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            { $addToSet: { viewers: userId }, $set: { lastActiveAt: new Date() } },
            { new: true }
        );
    },

    removeViewer: async (sessionId: string, userId: string) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            { $pull: { viewers: userId } },
            { new: true }
        );
    },

    clearViewers: async (sessionId: string) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            { $set: { viewers: [] } },
            { new: true }
        );
    },

    setMetadata: async (sessionId: string, metadata: { accountName?: string | null; avatarUrl?: string | null }) => {
        return ExternalSessionModel.findByIdAndUpdate(
            sessionId,
            { $set: { metadata } },
            { new: true }
        );
    },

    // ── Audit Log ──
    logAudit: async (data: {
        sessionId: string;
        workspaceId: string;
        userId: string;
        action: AuditAction;
        details?: any;
    }) => {
        return SessionAuditLogModel.create(data);
    },

    getAuditLog: async (sessionId: string, limit = 50) => {
        return SessionAuditLogModel.find({ sessionId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('userId', 'name email');
    },
};
