import prisma from '../../../infra/prisma';
import type { Popup } from '@prisma/client';

export const popupRepo = {
    async create(data: {
        workspaceId: string;
        name: string;
        type?: string;
        category?: string;
        status?: string;
        design: any;
        thankYou?: any;
        settings?: any;
    }): Promise<Popup> {
        return prisma.popup.create({ data: data as any });
    },

    async findById(id: string): Promise<Popup | null> {
        return prisma.popup.findUnique({ where: { id } });
    },

    async findByWorkspace(workspaceId: string): Promise<Popup[]> {
        return prisma.popup.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
    },

    async update(id: string, data: Partial<Omit<Popup, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Popup | null> {
        return prisma.popup.update({ where: { id }, data: data as any });
    },

    async delete(id: string): Promise<void> {
        await prisma.popup.delete({ where: { id } });
    },

    async incrementStat(id: string, stat: 'views' | 'submissions' | 'closes'): Promise<void> {
        const popup = await prisma.popup.findUnique({ where: { id }, select: { stats: true } });
        const stats = (popup?.stats as any) || {};
        stats[stat] = (stats[stat] || 0) + 1;
        await prisma.popup.update({ where: { id }, data: { stats } });
    },

    async findActive(workspaceId: string): Promise<Popup[]> {
        return prisma.popup.findMany({ where: { workspaceId, status: 'active' } });
    },
};
