import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
    conversationId: mongoose.Types.ObjectId;
    clientMessageId?: string;  // idempotency key from client
    sender: {
        type: 'visitor' | 'agent' | 'system';
        id: string; // visitorId or userId
        name?: string;
    };
    content: string;
    type: 'text' | 'image' | 'file' | 'system';
    status: 'sent' | 'delivered' | 'read';  // ack lifecycle
    attachments?: Array<{
        data: string;       // base64 data URI (e.g. data:image/png;base64,...)
        filename: string;
        mimeType: string;
        size: number;
    }>;
    sanitizeFlags?: string[]; // flags from content sanitization
    isInternal?: boolean; // internal note (visible to agents only)
    replyTo?: {
        messageId: string;
        content: string;
        senderName: string;
    };
    editedAt?: Date;
    isDeleted?: boolean;
    originalContent?: string;
    createdAt: Date;
    updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
    {
        conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
        clientMessageId: { type: String, default: null },
        sender: {
            type: { type: String, enum: ['visitor', 'agent', 'system'], required: true },
            id: { type: String, required: true },
            name: String,
        },
        content: { type: String, default: '' },
        type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
        status: { type: String, enum: ['sent', 'delivered', 'read', 'error'], default: 'sent' },
        replyTo: {
            messageId: { type: String },
            content: { type: String },
            senderName: { type: String },
        },
        editedAt: { type: Date },
        isDeleted: { type: Boolean, default: false },
        originalContent: { type: String },
        attachments: [
            {
                data: String,         // base64 data URI
                filename: String,
                mimeType: String,
                size: Number,
            },
        ],
        sanitizeFlags: [{ type: String }],
        isInternal: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// ── Indexes ──
messageSchema.index({ conversationId: 1, createdAt: 1 });   // load history (asc)
messageSchema.index({ conversationId: 1, createdAt: -1 });  // latest messages
messageSchema.index({ createdAt: -1 });
// Idempotency: unique clientMessageId per conversation (sparse — only indexed when present)
messageSchema.index(
    { conversationId: 1, clientMessageId: 1 },
    { unique: true, sparse: true }
);

export const MessageModel = mongoose.model<IMessage>('Message', messageSchema);
