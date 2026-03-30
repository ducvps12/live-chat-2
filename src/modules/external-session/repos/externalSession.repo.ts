import prisma from '../../../infra/prisma';
import type { ExternalSession, SessionAuditLog } from '@prisma/client';

export type SessionStatus = 'pending_login' | 'connected' | 'disconnected' | 'expired' | 'revoked';
export type AuditAction = 'session_created' | 'qr_rendered' | 'login_success' | 'login_failed' | 'disconnected' | 'control_taken' | 'control_released' | 'viewer_joined' | 'viewer_left' | 'revoked';

export const externalSessionRepo = {
    create: async (data: {
        workspaceId: string;
        provider?: string;
        label: string;
        status?: string;
        createdById: string;
        browserProfileId: string;
    }) => {
        return prisma.externalSession.create({ data: data as any });
    },

    findById: async (id: string) => {
        return prisma.externalSession.findUnique({ where: { id } });
    },

    findByWorkspace: async (workspaceId: string) => {
        return prisma.externalSession.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                controlledBy: { select: { id: true, name: true, email: true } },
            },
        });
    },

    findActive: async (sessionId: string) => {
        return prisma.externalSession.findFirst({
            where: { id: sessionId, status: { not: 'revoked' } },
        });
    },

    updateStatus: async (sessionId: string, status: SessionStatus, extra: Record<string, any> = {}) => {
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: { status, lastActiveAt: new Date(), ...extra },
        });
    },

    setController: async (sessionId: string, userId: string | null) => {
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: {
                controlledById: userId,
                controlLockedAt: userId ? new Date() : null,
                lastActiveAt: new Date(),
            },
        });
    },

    addViewer: async (sessionId: string, userId: string) => {
        const session = await prisma.externalSession.findUnique({ where: { id: sessionId }, select: { viewers: true } });
        const viewers = (session?.viewers as string[]) || [];
        if (!viewers.includes(userId)) viewers.push(userId);
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: { viewers, lastActiveAt: new Date() },
        });
    },

    removeViewer: async (sessionId: string, userId: string) => {
        const session = await prisma.externalSession.findUnique({ where: { id: sessionId }, select: { viewers: true } });
        const viewers = ((session?.viewers as string[]) || []).filter(v => v !== userId);
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: { viewers },
        });
    },

    clearViewers: async (sessionId: string) => {
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: { viewers: [] },
        });
    },

    setMetadata: async (sessionId: string, metadata: { accountName?: string | null; avatarUrl?: string | null }) => {
        return prisma.externalSession.update({
            where: { id: sessionId },
            data: {
                metadataAccountName: metadata.accountName,
                metadataAvatarUrl: metadata.avatarUrl,
            },
        });
    },

    // ── Audit Log ──
    logAudit: async (data: {
        sessionId: string;
        workspaceId: string;
        userId: string;
        action: AuditAction;
        details?: any;
    }) => {
        return prisma.sessionAuditLog.create({
            data: {
                sessionId: data.sessionId,
                workspaceId: data.workspaceId,
                userId: data.userId,
                action: data.action,
                details: data.details || {},
            },
        });
    },

    getAuditLog: async (sessionId: string, limit = 50) => {
        return prisma.sessionAuditLog.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });
    },
};
