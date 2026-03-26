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
        url?: string;       // external URL (e.g. Zalo CDN image link)
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
                url: String,          // external URL (e.g. Zalo CDN)
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
messageSchema.index({ content: 'text' });                    // full-text search
// Idempotency: unique clientMessageId per conversation
// NOTE: partialFilterExpression is required (not sparse) because sparse on compound indexes
// only skips documents where ALL fields are null — conversationId is never null, so
// sparse would still index null-clientMessageId docs and cause duplicate key errors.
messageSchema.index(
    { conversationId: 1, clientMessageId: 1 },
    { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } } }
);

export const MessageModel = mongoose.model<IMessage>('Message', messageSchema);

// Auto-drop the old broken sparse index if it exists (one-time migration)
// The old index used { sparse: true } which doesn't work on compound indexes
MessageModel.collection.dropIndex('conversationId_1_clientMessageId_1').catch(() => {
    // Index doesn't exist or already dropped — ignore
});
