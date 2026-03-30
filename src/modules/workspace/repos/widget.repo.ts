import prisma from '../../../infra/prisma';
import type { Widget } from '@prisma/client';

export const widgetRepo = {
    async create(data: {
        workspaceId: string;
        name: string;
        config: any;
        domainRules?: any;
        isActive?: boolean;
    }): Promise<Widget> {
        return prisma.widget.create({ data: data as any });
    },

    async findById(id: string): Promise<Widget | null> {
        return prisma.widget.findUnique({ where: { id } });
    },

    async findByWorkspace(workspaceId: string): Promise<Widget[]> {
        return prisma.widget.findMany({ where: { workspaceId, isActive: true } });
    },

    async update(id: string, data: Partial<Omit<Widget, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Widget | null> {
        return prisma.widget.update({ where: { id }, data: data as any });
    },

    async delete(id: string): Promise<void> {
        await prisma.widget.update({ where: { id }, data: { isActive: false } });
    },
};
