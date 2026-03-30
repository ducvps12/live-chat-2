import prisma from '../../../infra/prisma';
import type { ZaloContact } from '@prisma/client';

export interface ZaloContactQuery {
    workspaceId: string;
    search?: string;
    source?: 'friend' | 'stranger' | 'group';
    page?: number;
    limit?: number;
    sortBy?: 'lastMessageAt' | 'displayName' | 'totalMessages';
    sortOrder?: 'asc' | 'desc';
}

export interface ZaloContactPage {
    items: ZaloContact[];
    total: number;
    page: number;
    totalPages: number;
}

export const zaloContactRepo = {
    async upsert(data: {
        workspaceId: string;
        zaloUserId: string;
        displayName?: string;
        avatar?: string;
        phoneNumber?: string;
        source?: 'friend' | 'stranger' | 'group';
        lastMessagePreview?: string;
        metadata?: Record<string, any>;
    }): Promise<ZaloContact> {
        const existing = await prisma.zaloContact.findUnique({
            where: { workspaceId_zaloUserId: { workspaceId: data.workspaceId, zaloUserId: data.zaloUserId } },
        });

        if (existing) {
            const updateData: any = {
                lastMessageAt: new Date(),
                totalMessages: { increment: 1 },
            };
            if (data.displayName) updateData.displayName = data.displayName;
            if (data.avatar) updateData.avatar = data.avatar;
            if (data.phoneNumber) updateData.phoneNumber = data.phoneNumber;
            if (data.source) updateData.source = data.source;
            if (data.lastMessagePreview) updateData.lastMessagePreview = data.lastMessagePreview.substring(0, 500);
            if (data.metadata) updateData.metadata = data.metadata;

            return prisma.zaloContact.update({
                where: { id: existing.id },
                data: updateData,
            });
        }

        return prisma.zaloContact.create({
            data: {
                workspaceId: data.workspaceId,
                zaloUserId: data.zaloUserId,
                displayName: data.displayName || '',
                avatar: data.avatar || '',
                phoneNumber: data.phoneNumber || '',
                source: data.source || 'stranger',
                lastMessagePreview: data.lastMessagePreview?.substring(0, 500) || '',
                metadata: data.metadata || {},
                lastMessageAt: new Date(),
                firstContactAt: new Date(),
                totalMessages: 1,
            },
        });
    },

    async findByZaloUserId(workspaceId: string, zaloUserId: string): Promise<ZaloContact | null> {
        return prisma.zaloContact.findUnique({
            where: { workspaceId_zaloUserId: { workspaceId, zaloUserId } },
        });
    },

    async findByWorkspace(query: ZaloContactQuery): Promise<ZaloContactPage> {
        const page = Math.max(query.page || 1, 1);
        const limit = Math.min(query.limit || 20, 100);
        const skip = (page - 1) * limit;
        const sortField = query.sortBy || 'lastMessageAt';
        const sortOrder = query.sortOrder || 'desc';

        const where: any = { workspaceId: query.workspaceId };
        if (query.source) where.source = query.source;

        if (query.search && query.search.trim()) {
            const keyword = query.search.trim();
            if (/^\d+$/.test(keyword)) {
                where.phoneNumber = { startsWith: keyword };
            } else {
                where.displayName = { contains: keyword };
            }
        }

        const [items, total] = await Promise.all([
            prisma.zaloContact.findMany({
                where,
                orderBy: { [sortField]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.zaloContact.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    async updateInfo(
        workspaceId: string,
        zaloUserId: string,
        data: Partial<Pick<ZaloContact, 'displayName' | 'avatar' | 'phoneNumber' | 'metadata'>>
    ): Promise<ZaloContact | null> {
        const update: any = {};
        if (data.displayName) update.displayName = data.displayName;
        if (data.avatar) update.avatar = data.avatar;
        if (data.phoneNumber) update.phoneNumber = data.phoneNumber;
        if (data.metadata) update.metadata = data.metadata;

        if (Object.keys(update).length === 0) return null;

        return prisma.zaloContact.update({
            where: { workspaceId_zaloUserId: { workspaceId, zaloUserId } },
            data: update,
        });
    },

    async countByWorkspace(workspaceId: string): Promise<number> {
        return prisma.zaloContact.count({ where: { workspaceId } });
    },

    async delete(workspaceId: string, zaloUserId: string): Promise<boolean> {
        try {
            await prisma.zaloContact.delete({
                where: { workspaceId_zaloUserId: { workspaceId, zaloUserId } },
            });
            return true;
        } catch {
            return false;
        }
    },
};
