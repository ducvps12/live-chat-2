import prisma from '../../../infra/prisma';
import type { KnowledgeEntry } from '@prisma/client';

export const knowledgeRepo = {
    async create(data: {
        workspaceId: string;
        product: string;
        question: string;
        answer: string;
        upsaleText?: string;
        keywords?: string[];
        source?: string;
        sheetRowIndex?: number;
    }) {
        return prisma.knowledgeEntry.create({ data: data as any });
    },

    async createMany(entries: Array<{
        workspaceId: string;
        product: string;
        question: string;
        answer: string;
        upsaleText?: string;
        keywords?: string[];
        source?: string;
        sheetRowIndex?: number;
    }>) {
        if (entries.length === 0) return 0;

        let count = 0;
        for (const entry of entries) {
            if (entry.source === 'google_sheets' && entry.sheetRowIndex !== undefined) {
                // Upsert by workspace + source + sheetRowIndex
                const existing = await prisma.knowledgeEntry.findFirst({
                    where: { workspaceId: entry.workspaceId, source: 'google_sheets', sheetRowIndex: entry.sheetRowIndex },
                });
                if (existing) {
                    await prisma.knowledgeEntry.update({ where: { id: existing.id }, data: entry as any });
                } else {
                    await prisma.knowledgeEntry.create({ data: entry as any });
                }
            } else {
                await prisma.knowledgeEntry.create({ data: entry as any });
            }
            count++;
        }
        return count;
    },

    async findByWorkspace(workspaceId: string, filters?: { product?: string; source?: string }) {
        const where: any = { workspaceId };
        if (filters?.product) where.product = filters.product;
        if (filters?.source) where.source = filters.source;
        return prisma.knowledgeEntry.findMany({
            where,
            orderBy: [{ product: 'asc' }, { createdAt: 'desc' }],
        });
    },

    async search(workspaceId: string, queryText: string, limit = 5) {
        // Strategy: LIKE search for Vietnamese text (MySQL FULLTEXT doesn't handle Vietnamese well)
        const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        if (words.length === 0) return [];

        // Build OR conditions: each word matches any of question/answer/product
        const orConditions = words.flatMap(w => [
            { question: { contains: w } },
            { answer: { contains: w } },
            { product: { contains: w } },
        ]);

        return prisma.knowledgeEntry.findMany({
            where: { workspaceId, OR: orConditions },
            take: limit,
        });
    },

    async findById(id: string) {
        return prisma.knowledgeEntry.findUnique({ where: { id } });
    },

    async update(id: string, data: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>>) {
        return prisma.knowledgeEntry.update({ where: { id }, data: data as any });
    },

    async remove(id: string) {
        return prisma.knowledgeEntry.delete({ where: { id } });
    },

    async removeByWorkspaceAndSource(workspaceId: string, source: string) {
        return prisma.knowledgeEntry.deleteMany({ where: { workspaceId, source } });
    },

    async getProducts(workspaceId: string) {
        const results = await prisma.knowledgeEntry.findMany({
            where: { workspaceId },
            select: { product: true },
            distinct: ['product'],
        });
        return results.map(r => r.product);
    },

    async count(workspaceId: string) {
        return prisma.knowledgeEntry.count({ where: { workspaceId } });
    },
};
