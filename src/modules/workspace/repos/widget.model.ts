import mongoose, { Document, Schema } from 'mongoose';

export interface IPreChatField {
    key: string;       // 'name' | 'email' | 'phone' | 'message' | custom
    label: string;
    type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
    required: boolean;
    enabled: boolean;
    placeholder?: string;  // custom placeholder per field
    options?: string[];    // for select type
}

export interface IWidgetConfig {
    primaryColor: string;
    gradient?: string;
    launcherStyle?: 'bubble' | 'tab' | 'pill' | 'image';
    launcherText?: string;
    launcherIcon?: string;
    tooltipText?: string;
    greeting: string;
    placeholder: string;
    position: 'bottom-right' | 'bottom-left' | 'side-right' | 'side-left';
    language: string;
    avatarUrl?: string;
    showBranding: boolean;
    offlineMessage: string;
    autoReply?: string;
    preChatForm: {
        enabled: boolean;
        title: string;
        fields: IPreChatField[];
    };
}

export interface IWidget extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    config: IWidgetConfig;
    domainRules: {
        mode: 'allowlist' | 'blocklist';
        domains: string[];
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const preChatFieldSchema = new Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, enum: ['text', 'email', 'tel', 'textarea', 'select'], default: 'text' },
        required: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        placeholder: { type: String },
        options: [{ type: String }],
    },
    { _id: false }
);

const widgetSchema = new Schema<IWidget>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true },
        config: {
            primaryColor: { type: String, default: '#6366f1' },
            gradient: { type: String },
            launcherStyle: { type: String, enum: ['bubble', 'tab', 'pill', 'image'], default: 'bubble' },
            launcherText: { type: String },
            launcherIcon: { type: String },
            tooltipText: { type: String },
            greeting: { type: String, default: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?' },
            placeholder: { type: String, default: 'Nhập tin nhắn...' },
            position: { type: String, enum: ['bottom-right', 'bottom-left', 'side-right', 'side-left'], default: 'bottom-right' },
            language: { type: String, default: 'vi' },
            avatarUrl: { type: String },
            showBranding: { type: Boolean, default: true },
            offlineMessage: { type: String, default: 'Hiện tại không có agent trực tuyến. Vui lòng để lại lời nhắn.' },
            autoReply: { type: String },
            preChatForm: {
                enabled: { type: Boolean, default: true },
                title: { type: String, default: 'Vui lòng nhập thông tin để bắt đầu' },
                fields: {
                    type: [preChatFieldSchema],
                    default: [
                        { key: 'name', label: 'Họ và tên', type: 'text', required: true, enabled: true },
                        { key: 'email', label: 'Email', type: 'email', required: false, enabled: true },
                        { key: 'phone', label: 'Số điện thoại', type: 'tel', required: false, enabled: true },
                    ],
                },
            },
        },
        domainRules: {
            mode: { type: String, enum: ['allowlist', 'blocklist'], default: 'allowlist' },
            domains: [{ type: String }],
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// ── Indexes ──
widgetSchema.index({ workspaceId: 1, isActive: 1 });      // active widgets per workspace
widgetSchema.index({ isActive: 1, createdAt: -1 });       // active widgets listing
widgetSchema.index({ createdAt: -1 });                    // chronological sort

export const WidgetModel = mongoose.model<IWidget>('Widget', widgetSchema);
