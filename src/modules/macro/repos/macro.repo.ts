import prisma from '../../../infra/prisma';
import type { Macro } from '@prisma/client';

export const macroRepo = {
    async create(data: {
        workspaceId: string;
        userId?: string;
        scope?: string;
        title: string;
        content: string;
        shortcut?: string;
        category?: string;
        channel?: string;
        mediaAttachments?: any[];
        variables?: string[];
    }): Promise<Macro> {
        return prisma.macro.create({ data: data as any });
    },

    async findById(id: string): Promise<Macro | null> {
        return prisma.macro.findUnique({ where: { id } });
    },

    async findPersonal(workspaceId: string, userId: string): Promise<Macro[]> {
        return prisma.macro.findMany({
            where: { workspaceId, userId, scope: 'personal' },
            orderBy: [{ category: 'asc' }, { title: 'asc' }],
        });
    },

    async findTeam(workspaceId: string): Promise<Macro[]> {
        return prisma.macro.findMany({
            where: { workspaceId, scope: 'team' },
            orderBy: [{ category: 'asc' }, { title: 'asc' }],
        });
    },

    async findAllForAgent(workspaceId: string, userId: string): Promise<Macro[]> {
        return prisma.macro.findMany({
            where: {
                workspaceId,
                OR: [
                    { scope: 'team' },
                    { scope: 'personal', userId },
                ],
            },
            orderBy: [{ scope: 'asc' }, { category: 'asc' }, { title: 'asc' }],
        });
    },

    async update(id: string, data: Partial<Omit<Macro, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Macro | null> {
        return prisma.macro.update({ where: { id }, data: data as any });
    },

    async remove(id: string): Promise<Macro | null> {
        return prisma.macro.delete({ where: { id } });
    },

    async findByShortcut(workspaceId: string, userId: string, shortcut: string): Promise<Macro | null> {
        return prisma.macro.findFirst({
            where: {
                workspaceId,
                shortcut,
                OR: [
                    { scope: 'team' },
                    { scope: 'personal', userId },
                ],
            },
        });
    },

    async incrementUsage(id: string): Promise<void> {
        await prisma.macro.update({
            where: { id },
            data: { usageCount: { increment: 1 } },
        });
    },
};
