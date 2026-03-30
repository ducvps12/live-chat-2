import { ZaloMessageModel, IZaloMessage } from './zalo-message.model';
import mongoose from 'mongoose';

export interface ZaloMessageQuery {
    workspaceId: string;
    threadId?: string;
    senderId?: string;
    msgType?: string;
    search?: string;          // full-text search keyword
    before?: Date;            // cursor-based pagination (lấy tin nhắn trước thời điểm này)
    after?: Date;             // cursor-based pagination (lấy tin nhắn sau thời điểm này)
    limit?: number;           // default 50, max 100
}

export interface ZaloMessagePage {
    items: IZaloMessage[];
    total: number;
    hasMore: boolean;
    oldestTimestamp?: string;  // cursor cho trang tiếp theo
}

export const zaloMessageRepo = {
    /**
     * Lưu 1 tin nhắn (upsert theo msgId, tránh duplicate)
     */
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
    }): Promise<IZaloMessage> {
        return ZaloMessageModel.findOneAndUpdate(
            { workspaceId: new mongoose.Types.ObjectId(data.workspaceId), msgId: data.msgId },
            {
                $set: {
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
                $setOnInsert: {
                    workspaceId: new mongoose.Types.ObjectId(data.workspaceId),
                    msgId: data.msgId,
                }
            },
            { upsert: true, new: true, lean: true }
        ).exec() as Promise<IZaloMessage>;
    },

    /**
     * Lưu nhiều tin nhắn cùng lúc (bulk upsert — hiệu năng cao)
     */
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

        const ops = messages.map(m => ({
            updateOne: {
                filter: {
                    workspaceId: new mongoose.Types.ObjectId(m.workspaceId),
                    msgId: m.msgId,
                },
                update: {
                    $set: {
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
                    $setOnInsert: {
                        workspaceId: new mongoose.Types.ObjectId(m.workspaceId),
                        msgId: m.msgId,
                    }
                },
                upsert: true,
            }
        }));

        const result = await ZaloMessageModel.bulkWrite(ops, { ordered: false });
        return result.upsertedCount + result.modifiedCount;
    },

    /**
     * Lấy lịch sử chat theo thread (cursor-based pagination cho tốc độ cao)
     * 
     * Dùng cursor-based thay vì offset-based vì:
     * - Không cần đếm total rows (O(1) thay vì O(n))
     * - Không bị shift khi có tin nhắn mới
     * - Tận dụng compound index { workspaceId, threadId, timestamp }
     */
    async findByThread(query: ZaloMessageQuery): Promise<ZaloMessagePage> {
        const limit = Math.min(query.limit || 50, 100);
        const wsId = new mongoose.Types.ObjectId(query.workspaceId);

        const filter: any = { workspaceId: wsId };
        if (query.threadId) filter.threadId = query.threadId;
        if (query.senderId) filter.senderId = query.senderId;
        if (query.msgType) filter.msgType = query.msgType;
        
        // Cursor-based pagination
        if (query.before) {
            filter.timestamp = { ...(filter.timestamp || {}), $lt: query.before };
        }
        if (query.after) {
            filter.timestamp = { ...(filter.timestamp || {}), $gt: query.after };
        }

        // Full-text search (sử dụng text index)
        if (query.search && query.search.trim()) {
            filter.$text = { $search: query.search.trim() };
        }

        const items = await ZaloMessageModel.find(filter)
            .sort({ timestamp: -1 })
            .limit(limit + 1)  // fetch +1 để biết có trang tiếp không
            .lean()
            .exec();

        const hasMore = items.length > limit;
        const result = hasMore ? items.slice(0, limit) : items;

        return {
            items: result as IZaloMessage[],
            total: result.length,
            hasMore,
            oldestTimestamp: result.length > 0
                ? new Date(result[result.length - 1].timestamp).toISOString()
                : undefined,
        };
    },

    /**
     * Tìm kiếm tin nhắn (full-text search trên content)
     */
    async searchMessages(
        workspaceId: string,
        keyword: string,
        options?: { threadId?: string; limit?: number }
    ): Promise<IZaloMessage[]> {
        const limit = Math.min(options?.limit || 30, 100);
        const filter: any = {
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            $text: { $search: keyword },
        };
        if (options?.threadId) filter.threadId = options.threadId;

        return ZaloMessageModel.find(filter, { score: { $meta: 'textScore' } })
            .sort({ score: { $meta: 'textScore' }, timestamp: -1 })
            .limit(limit)
            .lean()
            .exec() as Promise<IZaloMessage[]>;
    },

    /**
     * Đếm tin nhắn theo thread (cho thống kê)
     */
    async countByThread(workspaceId: string, threadId: string): Promise<number> {
        return ZaloMessageModel.countDocuments({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            threadId,
        }).exec();
    },

    /**
     * Lấy tin nhắn gần nhất của mỗi thread (cho danh sách conversations)
     */
    async getLatestPerThread(workspaceId: string): Promise<any[]> {
        return ZaloMessageModel.aggregate([
            { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: '$threadId',
                    threadType: { $first: '$threadType' },
                    lastMessage: { $first: '$content' },
                    lastMessageAt: { $first: '$timestamp' },
                    senderName: { $first: '$senderName' },
                    msgType: { $first: '$msgType' },
                    totalMessages: { $sum: 1 },
                }
            },
            { $sort: { lastMessageAt: -1 } },
        ]).exec();
    },

    /**
     * Xoá lịch sử theo thread
     */
    async deleteByThread(workspaceId: string, threadId: string): Promise<number> {
        const result = await ZaloMessageModel.deleteMany({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            threadId,
        }).exec();
        return result.deletedCount;
    },
};
