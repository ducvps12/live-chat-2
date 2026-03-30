import prisma from '../../infra/prisma';
import type { Lead } from '@prisma/client';

export type LeadStage = 'mới' | 'tiềm_năng' | 'đang_tư_vấn' | 'chốt_đơn' | 'khách_hàng' | 'từ_chối';

interface ListLeadsQuery {
    workspaceId: string;
    stage?: LeadStage;
    source?: string;
    search?: string;
    tag?: string;
    assignedTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export const leadService = {
    async list(query: ListLeadsQuery) {
        const { workspaceId, stage, source, search, tag, assignedTo, page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = query;
        const where: any = { workspaceId };

        if (stage) where.stage = stage;
        if (source) where.source = source;
        if (assignedTo) where.assignedTo = assignedTo;
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } },
            ];
        }

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
                include: { assignedUser: { select: { id: true, name: true, email: true, avatarUrl: true } } },
            }),
            prisma.lead.count({ where }),
        ]);

        return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
    },

    async getById(leadId: string) {
        return prisma.lead.findUnique({
            where: { id: leadId },
            include: { assignedUser: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        });
    },

    async create(data: {
        workspaceId: string;
        name: string;
        phone?: string;
        email?: string;
        avatar?: string;
        stage?: string;
        source?: string;
        tags?: string[];
        assignedTo?: string;
        zaloUserId?: string;
        fbUserId?: string;
    }) {
        return prisma.lead.create({ data: data as any });
    },

    async update(leadId: string, data: Partial<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>) {
        return prisma.lead.update({ where: { id: leadId }, data: data as any });
    },

    async updateStage(leadId: string, stage: LeadStage) {
        return prisma.lead.update({ where: { id: leadId }, data: { stage } });
    },

    async addNote(leadId: string, text: string, createdBy: string) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { notes: true } });
        const notes = (lead?.notes as any[]) || [];
        notes.push({ text, createdAt: new Date(), createdBy });
        return prisma.lead.update({ where: { id: leadId }, data: { notes } });
    },

    async delete(leadId: string) {
        return prisma.lead.delete({ where: { id: leadId } });
    },

    async getStats(workspaceId: string) {
        const [total, stageResults, sourceResults] = await Promise.all([
            prisma.lead.count({ where: { workspaceId } }),
            prisma.lead.groupBy({ by: ['stage'], where: { workspaceId }, _count: true }),
            prisma.lead.groupBy({ by: ['source'], where: { workspaceId }, _count: true }),
        ]);

        return {
            total,
            byStage: Object.fromEntries(stageResults.map(s => [s.stage, s._count])),
            bySource: Object.fromEntries(sourceResults.map(s => [s.source, s._count])),
        };
    },

    async convertFromContact(workspaceId: string, contactData: { name: string; phone?: string; avatar?: string; zaloUserId?: string; source?: string }) {
        if (contactData.zaloUserId) {
            const existing = await prisma.lead.findFirst({ where: { workspaceId, zaloUserId: contactData.zaloUserId } });
            if (existing) return existing;
        }

        return prisma.lead.create({
            data: {
                workspaceId,
                name: contactData.name,
                phone: contactData.phone || '',
                avatar: contactData.avatar || '',
                zaloUserId: contactData.zaloUserId || '',
                source: contactData.source || 'zalo',
                stage: 'mới',
            },
        });
    },

    async bulkConvertFromGroup(workspaceId: string, data: {
        groupId: string;
        groupName: string;
        members: Array<{ userId: string; displayName: string; avatar?: string }>;
    }) {
        const { groupId, groupName, members } = data;
        let created = 0, skipped = 0;
        const results: any[] = [];

        for (const member of members) {
            const existing = await prisma.lead.findFirst({ where: { workspaceId, zaloUserId: member.userId } });

            if (existing) {
                const groupTag = `group:${groupName}`;
                const tags = (existing.tags as string[]) || [];
                if (!tags.includes(groupTag)) {
                    tags.push(groupTag);
                    await prisma.lead.update({ where: { id: existing.id }, data: { tags } });
                }
                skipped++;
                results.push({ userId: member.userId, status: 'skipped', leadId: existing.id });
                continue;
            }

            const lead = await prisma.lead.create({
                data: {
                    workspaceId,
                    name: member.displayName || `Thành viên ${member.userId.slice(-6)}`,
                    avatar: member.avatar || '',
                    zaloUserId: member.userId,
                    source: 'zalo',
                    stage: 'mới',
                    tags: [`group:${groupName}`],
                },
            });
            created++;
            results.push({ userId: member.userId, status: 'created', leadId: lead.id });
        }

        return { total: members.length, created, skipped, groupId, groupName, results };
    },

    async bulkConvertFromGroupEnriched(workspaceId: string, data: {
        groupId: string;
        groupName: string;
        members: Array<{ userId: string; displayName: string; avatar?: string; phone?: string; email?: string }>;
    }) {
        const { groupId, groupName, members } = data;
        let created = 0, skipped = 0, updated = 0;
        const results: any[] = [];

        for (const member of members) {
            const existing = await prisma.lead.findFirst({ where: { workspaceId, zaloUserId: member.userId } });

            if (existing) {
                const updates: any = {};
                const groupTag = `group:${groupName}`;
                if (member.phone && !existing.phone) updates.phone = member.phone;
                if (member.email && !existing.email) updates.email = member.email;
                if (member.avatar && !existing.avatar) updates.avatar = member.avatar;

                const tags = (existing.tags as string[]) || [];
                const needsTag = !tags.includes(groupTag);
                const hasUpdates = Object.keys(updates).length > 0;

                if (hasUpdates || needsTag) {
                    if (needsTag) { tags.push(groupTag); updates.tags = tags; }
                    await prisma.lead.update({ where: { id: existing.id }, data: updates });
                    if (hasUpdates) updated++;
                }

                skipped++;
                results.push({ userId: member.userId, status: hasUpdates ? 'updated' : 'skipped', leadId: existing.id });
                continue;
            }

            const lead = await prisma.lead.create({
                data: {
                    workspaceId,
                    name: member.displayName || `Thành viên ${member.userId.slice(-6)}`,
                    phone: member.phone || '',
                    email: member.email || '',
                    avatar: member.avatar || '',
                    zaloUserId: member.userId,
                    source: 'zalo',
                    stage: 'mới',
                    tags: [`group:${groupName}`],
                },
            });
            created++;
            results.push({ userId: member.userId, status: 'created', leadId: lead.id });
        }

        return { total: members.length, created, skipped, updated, groupId, groupName, results };
    },
};
