import prisma from '../../../infra/prisma';
import type { Session } from '@prisma/client';

export const sessionRepo = {
    async createSession(data: {
        userId: string;
        refreshToken: string;
        userAgent?: string;
        ipAddress?: string;
        expiresAt: Date;
    }): Promise<Session> {
        return prisma.session.create({ data });
    },

    async findByToken(refreshToken: string): Promise<Session | null> {
        return prisma.session.findUnique({ where: { refreshToken } });
    },

    async revokeToken(refreshToken: string): Promise<void> {
        await prisma.session.updateMany({
            where: { refreshToken },
            data: { revokedAt: new Date() },
        });
    },

    async revokeAllOtherSessions(userId: string, currentRefreshToken: string): Promise<void> {
        await prisma.session.updateMany({
            where: {
                userId,
                refreshToken: { not: currentRefreshToken },
                revokedAt: null,
            },
            data: { revokedAt: new Date() },
        });
    },

    async getActiveSessions(userId: string): Promise<Omit<Session, 'refreshToken'>[]> {
        return prisma.session.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            omit: { refreshToken: true },
        });
    },
};
