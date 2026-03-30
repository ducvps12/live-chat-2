import prisma from '../../../infra/prisma';
import type { ZaloAccount } from '@prisma/client';

export const zaloAccountRepo = {
    async create(data: {
        workspaceId: string;
        zaloId: string;
        name?: string;
        avatar?: string;
        phone?: string;
        imei: string;
        cookie: any;
        userAgent: string;
        status?: string;
    }): Promise<ZaloAccount> {
        return prisma.zaloAccount.create({ data: data as any });
    },

    async findById(id: string): Promise<ZaloAccount | null> {
        return prisma.zaloAccount.findUnique({ where: { id } });
    },

    async findByWorkspaceId(workspaceId: string): Promise<ZaloAccount[]> {
        return prisma.zaloAccount.findMany({ where: { workspaceId } });
    },

    async findActive(): Promise<ZaloAccount[]> {
        return prisma.zaloAccount.findMany({ where: { status: 'active' } });
    },

    async update(id: string, data: Partial<Omit<ZaloAccount, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ZaloAccount | null> {
        return prisma.zaloAccount.update({ where: { id }, data: data as any });
    },

    async updateStatus(id: string, status: 'active' | 'disconnected' | 'banned'): Promise<ZaloAccount | null> {
        return prisma.zaloAccount.update({ where: { id }, data: { status } });
    },

    async updateLastActive(id: string): Promise<void> {
        await prisma.zaloAccount.update({ where: { id }, data: { lastActiveAt: new Date() } });
    },

    async delete(id: string): Promise<void> {
        await prisma.zaloAccount.delete({ where: { id } });
    },
};
