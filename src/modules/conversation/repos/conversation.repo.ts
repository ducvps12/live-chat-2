import prisma from '../../../infra/prisma';
import type { Conversation } from '@prisma/client';
import { Prisma } from '@prisma/client';

/** Map Prisma `id` to frontend-expected `_id` */
function mapConv(c: any): any {
    if (!c) return c;
    if (!c._id && c.id) c._id = c.id;
    return c;
}
function mapConvs(arr: any[]): any[] {
    return arr.map(mapConv);
}

export const conversationRepo = {
    async create(data: {
        workspaceId: string;
        widgetId: string;
        visitorId: string;
        visitorInfo?: any;
        status?: string;
        priority?: string;
        channel?: string;
        assignedTo?: string;
        metadata?: any;
    }): Promise<Conversation> {
        const c = await prisma.conversation.create({ data: data as any });
        return mapConv(c);
    },

    async findById(id: string): Promise<Conversation | null> {
        const c = await prisma.conversation.findUnique({ where: { id } });
        return mapConv(c);
    },

    async findActiveByVisitor(visitorId: string, widgetId: string): Promise<Conversation | null> {
        const c = await prisma.conversation.findFirst({
            where: { visitorId, widgetId, status: { in: ['open', 'pending'] } },
            orderBy: { lastMessageAt: 'desc' },
        });
        return mapConv(c);
    },

    async findLatestByVisitor(visitorId: string, widgetId: string): Promise<Conversation | null> {
        const c = await prisma.conversation.findFirst({
            where: { visitorId, widgetId },
            orderBy: { lastMessageAt: 'desc' },
        });
        return mapConv(c);
    },

    async findByVisitor(visitorId: string, widgetId: string) {
        return mapConvs(await prisma.conversation.findMany({
            where: { visitorId, widgetId },
            orderBy: { updatedAt: 'desc' },
        }));
    },

    async getDistinctDomains(workspaceId: string): Promise<string[]> {
        // metadata is JSON — raw query needed for JSON extraction
        const results = await prisma.$queryRaw<{ domain: string }[]>`
            SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.domain')) as domain
            FROM Conversation
            WHERE workspaceId = ${workspaceId}
            AND JSON_EXTRACT(metadata, '$.domain') IS NOT NULL
        `;
        return results.map(r => r.domain).filter(Boolean);
    },

    async findOpenByWorkspace(workspaceId: string): Promise<Conversation[]> {
        return mapConvs(await prisma.conversation.findMany({ where: { workspaceId, status: 'open' } }));
    },

    async findByWorkspace(
        workspaceId: string,
        options?: {
            status?: string;
            assignee?: string;
            tags?: string | string[];
            channel?: string;
            pageId?: string;
            dateFrom?: string;
            dateTo?: string;
            sortBy?: string;
            page?: number;
            limit?: number;
            domain?: string | string[];
        }
    ): Promise<{ items: Conversation[]; total: number }> {
        const where: any = { workspaceId };

        if (options?.status && options.status !== 'all') where.status = options.status;

        if (options?.assignee) {
            if (options.assignee === 'unassigned') where.assignedTo = null;
            else where.assignedTo = options.assignee;
        }

        if (options?.channel && options.channel !== 'all') where.channel = options.channel;

        // Tags filter: JSON contains check
        if (options?.tags) {
            const tagsArray = Array.isArray(options.tags) ? options.tags : [options.tags];
            if (tagsArray.length > 0) {
                // Use raw where for JSON array contains
                where.OR = tagsArray.map(tag => ({
                    tags: { path: '$', array_contains: tag },
                }));
            }
        }

        if (options?.dateFrom || options?.dateTo) {
            where.createdAt = {};
            if (options?.dateFrom) where.createdAt.gte = new Date(options.dateFrom);
            if (options?.dateTo) where.createdAt.lte = new Date(options.dateTo);
        }

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        let orderBy: any = { lastMessageAt: 'desc' };
        if (options?.sortBy === 'oldest') {
            orderBy = { lastMessageAt: 'asc' };
        } else if (options?.sortBy === 'unread') {
            orderBy = [{ unreadCount: 'desc' }, { lastMessageAt: 'desc' }];
        }

        const [items, total] = await Promise.all([
            prisma.conversation.findMany({
                where,
                orderBy,
                skip,
                take: limit,
            }),
            prisma.conversation.count({ where }),
        ]);
        return { items: mapConvs(items), total };
    },

    async updateStatus(id: string, status: string): Promise<Conversation | null> {
        return mapConv(await prisma.conversation.update({ where: { id }, data: { status } }));
    },

    async updateLastMessage(
        id: string,
        summary: {
            snippet: string;
            sender: { type: 'visitor' | 'agent' | 'system'; name?: string };
            incrementUnread?: boolean;
        }
    ): Promise<void> {
        await prisma.conversation.update({
            where: { id },
            data: {
                lastMessageAt: new Date(),
                lastMessageSnippet: summary.snippet,
                lastSenderType: summary.sender.type,
                lastSenderName: summary.sender.name || null,
                ...(summary.incrementUnread ? { unreadCount: { increment: 1 } } : {}),
            },
        });
    },

    async markRead(id: string): Promise<void> {
        await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    },

    async updateReadCursor(
        conversationId: string,
        participantId: string,
        participantType: 'visitor' | 'agent',
        lastReadMessageId: string
    ): Promise<void> {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { readContext: true },
        });
        let readContext = (conv?.readContext as any[]) || [];
        // Remove old entry
        readContext = readContext.filter((r: any) => r.participantId !== participantId);
        // Add new entry
        readContext.push({ participantId, participantType, lastReadMessageId });
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { readContext },
        });
    },

    async updateMetadata(id: string, metadata: Record<string, any>): Promise<Conversation | null> {
        return mapConv(await prisma.conversation.update({ where: { id }, data: { metadata } }));
    },

    async updateVisitorInfo(id: string, visitorInfo: { name?: string; avatar?: string }): Promise<Conversation | null> {
        const conv = await prisma.conversation.findUnique({ where: { id }, select: { visitorInfo: true } });
        const current = (conv?.visitorInfo as any) || {};
        if (visitorInfo.name) current.name = visitorInfo.name;
        if (visitorInfo.avatar) current.avatar = visitorInfo.avatar;
        return mapConv(await prisma.conversation.update({ where: { id }, data: { visitorInfo: current } }));
    },

    async countByWorkspace(workspaceId: string, status?: string): Promise<number> {
        const where: any = { workspaceId };
        if (status) where.status = status;
        return prisma.conversation.count({ where });
    },

    async assignTo(id: string, agentId: string, expectUnassigned = false): Promise<Conversation | null> {
        if (expectUnassigned) {
            // Atomic-like: only assign if currently unassigned
            const result = await prisma.conversation.updateMany({
                where: { id, assignedTo: null },
                data: { assignedTo: agentId },
            });
            if (result.count === 0) return null;
            return mapConv(await prisma.conversation.findUnique({ where: { id } }));
        }
        return mapConv(await prisma.conversation.update({ where: { id }, data: { assignedTo: agentId } }));
    },

    async unassign(id: string): Promise<Conversation | null> {
        return mapConv(await prisma.conversation.update({ where: { id }, data: { assignedTo: null } }));
    },

    async setPriority(id: string, priority: string, slaDeadline?: Date): Promise<Conversation | null> {
        return mapConv(await prisma.conversation.update({
            where: { id },
            data: { priority, slaDeadline: slaDeadline || null },
        }));
    },

    async findBreachingSLA(withinMs: number): Promise<Conversation[]> {
        const now = new Date();
        const threshold = new Date(now.getTime() + withinMs);
        return prisma.conversation.findMany({
            where: {
                slaDeadline: { lte: threshold, gt: now },
                status: { in: ['open', 'pending'] },
            },
        });
    },

    async findBreachedSLA(): Promise<Conversation[]> {
        return prisma.conversation.findMany({
            where: {
                slaDeadline: { lte: new Date() },
                status: { in: ['open', 'pending'] },
            },
        });
    },

    async requeueByAgent(agentId: string): Promise<number> {
        const result = await prisma.conversation.updateMany({
            where: { assignedTo: agentId, status: { in: ['open', 'pending'] } },
            data: { assignedTo: null },
        });
        return result.count;
    },

    // ── Tags ──

    async addTag(id: string, tag: string): Promise<Conversation | null> {
        const conv = await prisma.conversation.findUnique({ where: { id }, select: { tags: true } });
        const tags = (conv?.tags as string[]) || [];
        if (!tags.includes(tag)) tags.push(tag);
        return mapConv(await prisma.conversation.update({ where: { id }, data: { tags } }));
    },

    async removeTag(id: string, tag: string): Promise<Conversation | null> {
        const conv = await prisma.conversation.findUnique({ where: { id }, select: { tags: true } });
        const tags = ((conv?.tags as string[]) || []).filter(t => t !== tag);
        return mapConv(await prisma.conversation.update({ where: { id }, data: { tags } }));
    },

    // ── Analytics ──

    async getAgentConversationStats(workspaceId: string) {
        const results = await prisma.$queryRaw<any[]>`
            SELECT
                c.assignedTo as _id,
                COUNT(*) as total,
                SUM(CASE WHEN c.status = 'open' THEN 1 ELSE 0 END) as \`open\`,
                SUM(CASE WHEN c.status IN ('closed', 'resolved') THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) as pending,
                MAX(c.lastMessageAt) as lastActivity,
                COALESCE(u.name, 'Unknown') as userName,
                COALESCE(u.email, '') as userEmail
            FROM Conversation c
            LEFT JOIN User u ON c.assignedTo = u.id
            WHERE c.workspaceId = ${workspaceId}
            AND c.assignedTo IS NOT NULL
            GROUP BY c.assignedTo, u.name, u.email
            ORDER BY total DESC
        `;
        return results.map(r => ({
            ...r,
            total: Number(r.total),
            open: Number(r.open),
            closed: Number(r.closed),
            pending: Number(r.pending),
        }));
    },

    async getAgentMessageCounts(workspaceId: string) {
        const results = await prisma.$queryRaw<any[]>`
            SELECT
                m.senderId as _id,
                COUNT(*) as messagesSent
            FROM Message m
            INNER JOIN Conversation c ON m.conversationId = c.id
            WHERE c.workspaceId = ${workspaceId}
            AND m.senderType = 'agent'
            GROUP BY m.senderId
        `;
        return results.map(r => ({ ...r, messagesSent: Number(r.messagesSent) }));
    },

    async searchByMessageContent(
        workspaceId: string,
        query: string,
        options?: { status?: string; limit?: number }
    ): Promise<{ items: Conversation[]; matchMap: Record<string, { snippet: string; messageId: string }> }> {
        if (!query || query.trim().length === 0) return { items: [], matchMap: {} };

        const statusFilter = options?.status && options.status !== 'all' ? options.status : null;
        const limit = options?.limit || 50;
        const escapedQuery = `%${query}%`;

        // Raw query for LIKE search with JOIN
        const matches = await prisma.$queryRaw<any[]>`
            SELECT
                m.conversationId,
                m.id as messageId,
                LEFT(m.content, 100) as matchedSnippet
            FROM Message m
            INNER JOIN Conversation c ON m.conversationId = c.id
            WHERE c.workspaceId = ${workspaceId}
            ${statusFilter ? Prisma.sql`AND c.status = ${statusFilter}` : Prisma.empty}
            AND m.content LIKE ${escapedQuery}
            AND (m.isDeleted = false OR m.isDeleted IS NULL)
            AND (m.isInternal = false OR m.isInternal IS NULL)
            ORDER BY m.createdAt DESC
            LIMIT ${limit}
        `;

        if (matches.length === 0) return { items: [], matchMap: {} };

        const convIds = [...new Set(matches.map(m => m.conversationId))];
        const items = mapConvs(await prisma.conversation.findMany({
            where: { id: { in: convIds } },
            orderBy: { lastMessageAt: 'desc' },
        }));

        const matchMap: Record<string, { snippet: string; messageId: string }> = {};
        for (const m of matches) {
            if (!matchMap[m.conversationId]) {
                matchMap[m.conversationId] = { snippet: m.matchedSnippet, messageId: m.messageId };
            }
        }

        return { items, matchMap };
    },
};
