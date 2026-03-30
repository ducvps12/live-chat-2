import prisma from '../../../infra/prisma';
import type { ZaloMessage } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface ZaloMessageQuery {
    workspaceId: string;
    threadId?: string;
    senderId?: string;
    msgType?: string;
    search?: string;
    before?: Date;
    after?: Date;
    limit?: number;
}

export interface ZaloMessagePage {
    items: ZaloMessage[];
    total: number;
    hasMore: boolean;
    oldestTimestamp?: string;
}

export const zaloMessageRepo = {
    async saveMessage(data: {
        workspaceId: string;
        threadId: string;
        threadType: 'user' | 'group';
        msgId: string;
        senderId: string;
        senderName: string;
        content: string;
        msgType: string;
        attachmentUrl?: string;
        thumbUrl?: string;
        isSelf: boolean;
        timestamp: Date;
    }): Promise<ZaloMessage> {
        return prisma.zaloMessage.upsert({
            where: { workspaceId_msgId: { workspaceId: data.workspaceId, msgId: data.msgId } },
            create: data as any,
            update: {
                threadId: data.threadId,
                threadType: data.threadType,
                senderId: data.senderId,
                senderName: data.senderName,
                content: data.content,
                msgType: data.msgType,
                attachmentUrl: data.attachmentUrl,
                thumbUrl: data.thumbUrl,
                isSelf: data.isSelf,
                timestamp: data.timestamp,
            },
        });
    },

    async saveMany(messages: Array<{
        workspaceId: string;
        threadId: string;
        threadType: 'user' | 'group';
        msgId: string;
        senderId: string;
        senderName: string;
        content: string;
        msgType: string;
        attachmentUrl?: string;
        thumbUrl?: string;
        isSelf: boolean;
        timestamp: Date;
    }>): Promise<number> {
        if (messages.length === 0) return 0;

        // Use transaction with upserts for bulk operation
        let count = 0;
        const batchSize = 50;
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            await prisma.$transaction(
                batch.map(m =>
                    prisma.zaloMessage.upsert({
                        where: { workspaceId_msgId: { workspaceId: m.workspaceId, msgId: m.msgId } },
                        create: m as any,
                        update: {
                            threadId: m.threadId,
                            threadType: m.threadType,
                            senderId: m.senderId,
                            senderName: m.senderName,
                            content: m.content,
                            msgType: m.msgType,
                            attachmentUrl: m.attachmentUrl,
                            thumbUrl: m.thumbUrl,
                            isSelf: m.isSelf,
                            timestamp: m.timestamp,
                        },
                    })
                )
            );
            count += batch.length;
        }
        return count;
    },

    async findByThread(query: ZaloMessageQuery): Promise<ZaloMessagePage> {
        const limit = Math.min(query.limit || 50, 100);

        const where: any = { workspaceId: query.workspaceId };
        if (query.threadId) where.threadId = query.threadId;
        if (query.senderId) where.senderId = query.senderId;
        if (query.msgType) where.msgType = query.msgType;

        if (query.before || query.after) {
            where.timestamp = {};
            if (query.before) where.timestamp.lt = query.before;
            if (query.after) where.timestamp.gt = query.after;
        }

        if (query.search && query.search.trim()) {
            where.content = { contains: query.search.trim() };
        }

        const items = await prisma.zaloMessage.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit + 1,
        });

        const hasMore = items.length > limit;
        const result = hasMore ? items.slice(0, limit) : items;

        return {
            items: result,
            total: result.length,
            hasMore,
            oldestTimestamp: result.length > 0
                ? new Date(result[result.length - 1].timestamp).toISOString()
                : undefined,
        };
    },

    async searchMessages(
        workspaceId: string,
        keyword: string,
        options?: { threadId?: string; limit?: number }
    ): Promise<ZaloMessage[]> {
        const limit = Math.min(options?.limit || 30, 100);
        const where: any = { workspaceId, content: { contains: keyword } };
        if (options?.threadId) where.threadId = options.threadId;

        return prisma.zaloMessage.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
        });
    },

    async countByThread(workspaceId: string, threadId: string): Promise<number> {
        return prisma.zaloMessage.count({ where: { workspaceId, threadId } });
    },

    async getLatestPerThread(workspaceId: string): Promise<any[]> {
        const results = await prisma.$queryRaw<any[]>`
            SELECT
                threadId as _id,
                threadType,
                content as lastMessage,
                timestamp as lastMessageAt,
                senderName,
                msgType,
                COUNT(*) as totalMessages
            FROM ZaloMessage
            WHERE workspaceId = ${workspaceId}
            GROUP BY threadId, threadType, content, timestamp, senderName, msgType
            HAVING timestamp = (
                SELECT MAX(z2.timestamp)
                FROM ZaloMessage z2
                WHERE z2.workspaceId = ${workspaceId}
                AND z2.threadId = ZaloMessage.threadId
            )
            ORDER BY lastMessageAt DESC
        `;
        return results.map(r => ({ ...r, totalMessages: Number(r.totalMessages) }));
    },

    async deleteByThread(workspaceId: string, threadId: string): Promise<number> {
        const result = await prisma.zaloMessage.deleteMany({ where: { workspaceId, threadId } });
        return result.count;
    },
};
