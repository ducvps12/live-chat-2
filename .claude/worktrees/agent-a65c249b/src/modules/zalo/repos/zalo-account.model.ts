import mongoose, { Schema, Document } from 'mongoose';

export interface IZaloAccount extends Document {
    workspaceId: mongoose.Types.ObjectId;
    zaloId: string; // ID thật của tài khoản Zalo (lấy từ getOwnId)
    name: string;
    avatar: string;
    phone: string;
    imei: string;
    cookie: any; // Lưu Cookie dạng JSON linh hoạt
    userAgent: string;
    status: 'active' | 'disconnected' | 'banned';
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ZaloAccountSchema: Schema = new Schema(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        zaloId: { type: String, required: true },
        name: { type: String, default: 'Unknown Zalo' },
        avatar: { type: String, default: '' },
        phone: { type: String, default: '' },
        imei: { type: String, required: true },
        cookie: { type: Schema.Types.Mixed, required: true },
        userAgent: { type: String, required: true },
        status: { type: String, enum: ['active', 'disconnected', 'banned'], default: 'active' },
        lastActiveAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Đảm bảo 1 workspace chỉ kết nối 1 account zalo chính (nếu requirement yêu cầu nhiều thì bỏ index này đi)
// Tuy nhiên ở đây để linh hoạt, ta chỉ index workspaceId. Một workspace có thể có nhiều Zalo account.

export const ZaloAccountModel = mongoose.model<IZaloAccount>('ZaloAccount', ZaloAccountSchema);
