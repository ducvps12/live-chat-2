import prisma from '../../../infra/prisma';
import type { Message } from '@prisma/client';
import { Prisma } from '@prisma/client';

function mapMessage(msg: any): any {
    if (!msg) return msg;
    if (!msg._id && msg.id) msg._id = msg.id;
    if (msg.senderType && !msg.sender) {
        msg.sender = {
            type: msg.senderType,
            id: msg.senderId,
            name: msg.senderName,
        };
    }
    return msg;
}

export const messageRepo = {
    async create(data: any): Promise<any> {
        const createData = {
            ...data,
            senderType: data.sender?.type || data.senderType,
            senderId: data.sender?.id || data.senderId,
            senderName: data.sender?.name || data.senderName,
            attachments: data.attachments || [],
            sanitizeFlags: data.sanitizeFlags || [],
        };
        delete createData.sender;

        const msg = await prisma.message.create({
            data: createData,
        });
        return mapMessage(msg);
    },

    async findById(messageId: string): Promise<any | null> {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        return mapMessage(msg);
    },

    async findByClientMessageId(conversationId: string, clientMessageId: string): Promise<any | null> {
        if (!clientMessageId) return null;
        const msg = await prisma.message.findFirst({ where: { conversationId, clientMessageId } });
        return mapMessage(msg);
    },

    async findByConversation(
        conversationId: string,
        options?: { page?: number; limit?: number; excludeInternal?: boolean }
    ): Promise<{ items: Message[]; total: number }> {
        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = { conversationId };
        if (options?.excludeInternal) {
            where.isInternal = false;
        }

        const [items, total] = await Promise.all([
            prisma.message.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.message.count({ where }),
        ]);

        return { items: items.reverse().map(mapMessage), total };
    },

    async getLatest(conversationId: string, limit: number = 30): Promise<any[]> {
        const msgs = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return msgs.reverse().map(mapMessage);
    },

    async getMessagePage(conversationId: string, messageId: string, limit: number = 50): Promise<number | null> {
        const targetMessage = await prisma.message.findFirst({
            where: { id: messageId, conversationId },
        });
        if (!targetMessage) return null;

        const count = await prisma.message.count({
            where: { conversationId, createdAt: { gte: targetMessage.createdAt } },
        });

        if (count === 0) return 1;
        return Math.floor((count - 1) / limit) + 1;
    },

    async findSince(conversationId: string, since: Date, limit: number = 50): Promise<any[]> {
        const msgs = await prisma.message.findMany({
            where: { conversationId, createdAt: { gt: since } },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
        return msgs.map(mapMessage);
    },

    async markAsDelivered(messageIds: string[]): Promise<void> {
        await prisma.message.updateMany({
            where: { id: { in: messageIds }, status: 'sent' },
            data: { status: 'delivered' },
        });
    },

    async markAsReadUpTo(
        conversationId: string,
        messageId: string,
        senderTypeToMatch: 'visitor' | 'agent' | 'system'
    ): Promise<void> {
        const targetMessage = await prisma.message.findFirst({
            where: { id: messageId, conversationId },
        });
        if (!targetMessage) return;

        await prisma.message.updateMany({
            where: {
                conversationId,
                senderType: senderTypeToMatch,
                createdAt: { lte: targetMessage.createdAt },
                status: { not: 'read' },
            },
            data: { status: 'read' },
        });
    },

    async findLatest(conversationId: string): Promise<any | null> {
        const msg = await prisma.message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
        });
        return mapMessage(msg);
    },

    async countUnreadSince(
        conversationId: string,
        participantType: 'visitor' | 'agent' | 'system',
        lastReadMessageId: string | null
    ): Promise<number> {
        const where: any = {
            conversationId,
            senderType: { not: participantType },
        };

        if (lastReadMessageId) {
            const lastReadMessage = await prisma.message.findFirst({
                where: { id: lastReadMessageId, conversationId },
            });
            if (lastReadMessage) {
                where.createdAt = { gt: lastReadMessage.createdAt };
            }
        }

        return prisma.message.count({ where });
    },

    async searchByContent(
        conversationIds: string[],
        query: string,
        limit: number = 50
    ): Promise<Array<{ conversationId: string; matchedSnippet: string; messageId: string }>> {
        if (!query || query.trim().length === 0 || conversationIds.length === 0) return [];

        const escapedQuery = `%${query}%`;

        const results = await prisma.$queryRaw<any[]>`
            SELECT
                conversationId,
                LEFT(content, 100) as matchedSnippet,
                id as messageId
            FROM Message
            WHERE conversationId IN (${Prisma.join(conversationIds)})
            AND content LIKE ${escapedQuery}
            AND (isDeleted = false OR isDeleted IS NULL)
            AND (isInternal = false OR isInternal IS NULL)
            ORDER BY createdAt DESC
            LIMIT ${limit}
        `;

        return results;
    },

    async countBySender(
        conversationId: string,
        senderType: 'visitor' | 'agent' | 'system'
    ): Promise<number> {
        return prisma.message.count({
            where: {
                conversationId,
                senderType,
                isDeleted: false,
            },
        });
    },
};
