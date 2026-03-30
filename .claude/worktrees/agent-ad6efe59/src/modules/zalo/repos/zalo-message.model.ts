import mongoose, { Schema, Document } from 'mongoose';

export interface IZaloMessage extends Document {
    workspaceId: mongoose.Types.ObjectId;
    threadId: string;           // Zalo conversation/user ID
    threadType: 'user' | 'group';
    msgId: string;              // Zalo original message ID (unique per workspace)
    senderId: string;           // Zalo user ID of sender
    senderName: string;         // Display name of sender
    content: string;            // Text content
    msgType: string;            // text | image | media | sticker | file
    attachmentUrl?: string;     // Full-size image/file URL
    thumbUrl?: string;          // Thumbnail URL
    isSelf: boolean;            // Sent by the workspace's own Zalo account
    timestamp: Date;            // Original Zalo timestamp
    createdAt: Date;
    updatedAt: Date;
}

const ZaloMessageSchema = new Schema<IZaloMessage>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        threadId:    { type: String, required: true },
        threadType:  { type: String, enum: ['user', 'group'], default: 'user' },
        msgId:       { type: String, required: true },
        senderId:    { type: String, default: '' },
        senderName:  { type: String, default: '' },
        content:     { type: String, default: '' },
        msgType:     { type: String, default: 'text' },
        attachmentUrl: { type: String },
        thumbUrl:    { type: String },
        isSelf:      { type: Boolean, default: false },
        timestamp:   { type: Date, required: true, default: Date.now },
    },
    { timestamps: true }
);

// ── Performance Indexes ──

// 1. Primary query: lấy lịch sử chat theo thread, sắp xếp theo thời gian (CORE)
//    Covers: findByThread(workspaceId, threadId) ORDER BY timestamp DESC
ZaloMessageSchema.index({ workspaceId: 1, threadId: 1, timestamp: -1 });

// 2. Deduplicate: đảm bảo mỗi tin nhắn chỉ lưu 1 lần (upsert by msgId)
ZaloMessageSchema.index({ workspaceId: 1, msgId: 1 }, { unique: true });

// 3. Full-text search: tìm kiếm nội dung tin nhắn nhanh
ZaloMessageSchema.index({ content: 'text' }, {
    default_language: 'none',  // Hỗ trợ tiếng Việt tốt hơn (không stemming)
    name: 'zalo_msg_fulltext'
});

// 4. Timeline: lấy tin nhắn theo workspace + thời gian (dashboard, reports)
ZaloMessageSchema.index({ workspaceId: 1, timestamp: -1 });

// 5. Sender lookup: tìm tất cả tin nhắn của 1 user (customer history)
ZaloMessageSchema.index({ workspaceId: 1, senderId: 1, timestamp: -1 });

export const ZaloMessageModel = mongoose.model<IZaloMessage>('ZaloMessage', ZaloMessageSchema);
