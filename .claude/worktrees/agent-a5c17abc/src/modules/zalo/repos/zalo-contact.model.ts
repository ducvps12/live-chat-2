import mongoose, { Schema, Document } from 'mongoose';

export interface IZaloContact extends Document {
    workspaceId: mongoose.Types.ObjectId;
    zaloUserId: string;             // Zalo user ID (unique per workspace)
    displayName: string;            // Tên hiển thị
    avatar: string;                 // URL avatar
    phoneNumber: string;            // SĐT (nếu lấy được, thường rỗng do privacy)
    source: 'friend' | 'stranger' | 'group';  // Nguồn liên hệ
    totalMessages: number;          // Tổng số tin nhắn (đếm nhanh, ko cần aggregate)
    lastMessageAt: Date;            // Thời điểm tin nhắn cuối
    lastMessagePreview: string;     // Preview tin nhắn cuối (100 char)
    firstContactAt: Date;           // Lần liên hệ đầu tiên
    metadata: Record<string, any>;  // Dữ liệu bổ sung (gender, birthday nếu có)
    createdAt: Date;
    updatedAt: Date;
}

const ZaloContactSchema = new Schema<IZaloContact>(
    {
        workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        zaloUserId:   { type: String, required: true },
        displayName:  { type: String, default: '' },
        avatar:       { type: String, default: '' },
        phoneNumber:  { type: String, default: '' },
        source:       { type: String, enum: ['friend', 'stranger', 'group'], default: 'stranger' },
        totalMessages:     { type: Number, default: 0 },
        lastMessageAt:     { type: Date },
        lastMessagePreview: { type: String, default: '' },
        firstContactAt:    { type: Date, default: Date.now },
        metadata:     { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// ── Performance Indexes ──

// 1. Primary lookup: tìm contact theo workspace + zaloUserId (UNIQUE, upsert)
ZaloContactSchema.index({ workspaceId: 1, zaloUserId: 1 }, { unique: true });

// 2. Listing: danh sách contacts sắp theo tin nhắn gần nhất
ZaloContactSchema.index({ workspaceId: 1, lastMessageAt: -1 });

// 3. Search by name: tìm theo tên
ZaloContactSchema.index({ displayName: 'text' }, {
    default_language: 'none',
    name: 'zalo_contact_name_search'
});

// 4. Phone lookup: tìm theo SĐT (sparse — chỉ index khi có)
ZaloContactSchema.index(
    { workspaceId: 1, phoneNumber: 1 },
    { sparse: true }
);

export const ZaloContactModel = mongoose.model<IZaloContact>('ZaloContact', ZaloContactSchema);
