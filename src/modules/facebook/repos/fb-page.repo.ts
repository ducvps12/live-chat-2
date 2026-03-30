import prisma from '../../../infra/prisma';
import type { FBPage } from '@prisma/client';

export const fbPageRepo = {
    async create(data: {
        workspaceId: string;
        pageId: string;
        pageName?: string;
        pageAvatar?: string;
        accessToken: string;
        userAccessToken?: string;
        status?: string;
        subscribedFields?: string[];
    }): Promise<FBPage> {
        return prisma.fBPage.create({ data: data as any });
    },

    async findById(id: string): Promise<FBPage | null> {
        return prisma.fBPage.findUnique({ where: { id } });
    },

    async findByWorkspaceId(workspaceId: string): Promise<FBPage[]> {
        return prisma.fBPage.findMany({ where: { workspaceId } });
    },

    async findByPageId(pageId: string): Promise<FBPage | null> {
        return prisma.fBPage.findFirst({ where: { pageId } });
    },

    async findActive(): Promise<FBPage[]> {
        return prisma.fBPage.findMany({ where: { status: 'active' } });
    },

    async update(id: string, data: Partial<Omit<FBPage, 'id' | 'createdAt' | 'updatedAt'>>): Promise<FBPage | null> {
        return prisma.fBPage.update({ where: { id }, data: data as any });
    },

    async updateByPageId(pageId: string, data: Partial<Omit<FBPage, 'id' | 'createdAt' | 'updatedAt'>>): Promise<FBPage | null> {
        const page = await prisma.fBPage.findFirst({ where: { pageId } });
        if (!page) return null;
        return prisma.fBPage.update({ where: { id: page.id }, data: data as any });
    },

    async delete(id: string): Promise<void> {
        await prisma.fBPage.delete({ where: { id } });
    },

    async upsertPage(workspaceId: string, pageId: string, data: Partial<Omit<FBPage, 'id' | 'createdAt' | 'updatedAt'>>): Promise<FBPage> {
        return prisma.fBPage.upsert({
            where: { pageId_workspaceId: { pageId, workspaceId } },
            create: { ...data, workspaceId, pageId, accessToken: (data as any).accessToken || '' } as any,
            update: data as any,
        });
    },
};
