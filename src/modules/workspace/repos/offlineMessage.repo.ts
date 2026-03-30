import prisma from '../../../infra/prisma';
import type { OfflineMessage } from '@prisma/client';

export const offlineMessageRepo = {
    async create(data: {
        widgetId: string;
        workspaceId: string;
        visitorId: string;
        name: string;
        email: string;
        message: string;
        status?: string;
        metadata?: any;
    }): Promise<OfflineMessage> {
        return prisma.offlineMessage.create({ data: data as any });
    },

    async findByWorkspace(
        workspaceId: string,
        options?: { status?: string; page?: number; limit?: number }
    ): Promise<{ items: OfflineMessage[]; total: number }> {
        const where: any = { workspaceId };
        if (options?.status) where.status = options.status;

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.offlineMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.offlineMessage.count({ where }),
        ]);

        return { items, total };
    },

    async findById(id: string): Promise<OfflineMessage | null> {
        return prisma.offlineMessage.findUnique({ where: { id } });
    },

    async updateStatus(id: string, status: string): Promise<OfflineMessage | null> {
        return prisma.offlineMessage.update({ where: { id }, data: { status } });
    },

    async countPending(workspaceId: string): Promise<number> {
        return prisma.offlineMessage.count({ where: { workspaceId, status: 'pending' } });
    },
};
