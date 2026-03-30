import { ZaloContactModel, IZaloContact } from './zalo-contact.model';
import mongoose from 'mongoose';

export interface ZaloContactQuery {
    workspaceId: string;
    search?: string;           // tìm theo tên hoặc SĐT
    source?: 'friend' | 'stranger' | 'group';
    page?: number;             // offset-based ok cho contacts (ít data hơn messages)
    limit?: number;
    sortBy?: 'lastMessageAt' | 'displayName' | 'totalMessages';
    sortOrder?: 'asc' | 'desc';
}

export interface ZaloContactPage {
    items: IZaloContact[];
    total: number;
    page: number;
    totalPages: number;
}

export const zaloContactRepo = {
    /**
     * Tạo hoặc cập nhật contact (upsert theo zaloUserId)
     * Tự động update lastMessageAt, totalMessages, lastMessagePreview
     */
    async upsert(data: {
        workspaceId: string;
        zaloUserId: string;
        displayName?: string;
        avatar?: string;
        phoneNumber?: string;
        source?: 'friend' | 'stranger' | 'group';
        lastMessagePreview?: string;
        metadata?: Record<string, any>;
    }): Promise<IZaloContact> {
        const update: any = {
            $set: {
                lastMessageAt: new Date(),
            },
            $inc: { totalMessages: 1 },
            $setOnInsert: {
                workspaceId: new mongoose.Types.ObjectId(data.workspaceId),
                zaloUserId: data.zaloUserId,
                firstContactAt: new Date(),
            },
        };

        // Chỉ update field khi có giá trị (không ghi đè bằng rỗng)
        if (data.displayName) update.$set.displayName = data.displayName;
        if (data.avatar) update.$set.avatar = data.avatar;
        if (data.phoneNumber) update.$set.phoneNumber = data.phoneNumber;
        if (data.source) update.$set.source = data.source;
        if (data.lastMessagePreview) update.$set.lastMessagePreview = data.lastMessagePreview.substring(0, 100);
        if (data.metadata) update.$set.metadata = data.metadata;

        return ZaloContactModel.findOneAndUpdate(
            {
                workspaceId: new mongoose.Types.ObjectId(data.workspaceId),
                zaloUserId: data.zaloUserId,
            },
            update,
            { upsert: true, new: true, lean: true }
        ).exec() as Promise<IZaloContact>;
    },

    /**
     * Tìm 1 contact theo zaloUserId
     */
    async findByZaloUserId(workspaceId: string, zaloUserId: string): Promise<IZaloContact | null> {
        return ZaloContactModel.findOne({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            zaloUserId,
        }).lean().exec() as Promise<IZaloContact | null>;
    },

    /**
     * Danh sách contacts (hỗ trợ search, pagination, sorting)
     */
    async findByWorkspace(query: ZaloContactQuery): Promise<ZaloContactPage> {
        const page = Math.max(query.page || 1, 1);
        const limit = Math.min(query.limit || 20, 100);
        const skip = (page - 1) * limit;
        const sortField = query.sortBy || 'lastMessageAt';
        const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

        const filter: any = {
            workspaceId: new mongoose.Types.ObjectId(query.workspaceId),
        };

        if (query.source) filter.source = query.source;

        // Search by name or phone
        if (query.search && query.search.trim()) {
            const keyword = query.search.trim();
            // Thử phone match trước (exact prefix), nếu không thì text search
            if (/^\d+$/.test(keyword)) {
                filter.phoneNumber = { $regex: `^${keyword}`, $options: 'i' };
            } else {
                filter.$text = { $search: keyword };
            }
        }

        const [items, total] = await Promise.all([
            ZaloContactModel.find(filter)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            ZaloContactModel.countDocuments(filter).exec(),
        ]);

        return {
            items: items as IZaloContact[],
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    },

    /**
     * Cập nhật thông tin contact (không tăng totalMessages)
     */
    async updateInfo(
        workspaceId: string,
        zaloUserId: string,
        data: Partial<Pick<IZaloContact, 'displayName' | 'avatar' | 'phoneNumber' | 'metadata'>>
    ): Promise<IZaloContact | null> {
        const update: any = {};
        if (data.displayName) update.displayName = data.displayName;
        if (data.avatar) update.avatar = data.avatar;
        if (data.phoneNumber) update.phoneNumber = data.phoneNumber;
        if (data.metadata) update.metadata = data.metadata;

        return ZaloContactModel.findOneAndUpdate(
            { workspaceId: new mongoose.Types.ObjectId(workspaceId), zaloUserId },
            { $set: update },
            { new: true, lean: true }
        ).exec() as Promise<IZaloContact | null>;
    },

    /**
     * Thống kê tổng contacts
     */
    async countByWorkspace(workspaceId: string): Promise<number> {
        return ZaloContactModel.countDocuments({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
        }).exec();
    },

    /**
     * Xoá contact
     */
    async delete(workspaceId: string, zaloUserId: string): Promise<boolean> {
        const result = await ZaloContactModel.deleteOne({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            zaloUserId,
        }).exec();
        return result.deletedCount > 0;
    },
};
