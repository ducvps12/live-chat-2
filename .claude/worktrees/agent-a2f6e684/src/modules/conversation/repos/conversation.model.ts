import mongoose, { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
    workspaceId: mongoose.Types.ObjectId;
    widgetId: mongoose.Types.ObjectId;
    visitorId: string;
    visitorInfo: {
        name?: string;
        email?: string;
        phone?: string;
        [key: string]: any;
    };
    status: 'open' | 'pending' | 'closed' | 'resolved';
    priority: 'urgent' | 'high' | 'normal' | 'low';
    slaDeadline?: Date;
    assignedTo?: mongoose.Types.ObjectId;
    tags: string[];
    channel: string;
    lastMessageAt: Date;
    // ── Summary fields (denormalized for inbox list) ──
    lastMessageSnippet?: string;
    lastSender?: {
        type: 'visitor' | 'agent' | 'system';
        name?: string;
    };
    unreadCount: number;  // unread messages for agent side
    readContext?: Array<{
        participantId: string;
        participantType: 'visitor' | 'agent';
        lastReadMessageId: string;
    }>;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        widgetId: { type: Schema.Types.ObjectId, ref: 'Widget', required: true },
        visitorId: { type: String, required: true },
        visitorInfo: {
            name: String,
            email: String,
            phone: String,
        },
        status: { type: String, enum: ['open', 'pending', 'closed', 'resolved'], default: 'open' },
        priority: { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
        slaDeadline: { type: Date, default: null },
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
        tags: { type: [String], default: [] },
        channel: { type: String, default: 'widget' },
        lastMessageAt: { type: Date, default: Date.now },
        lastMessageSnippet: { type: String, default: '' },
        lastSender: {
            type: { type: String, enum: ['visitor', 'agent', 'system'] },
            name: String,
        },
        unreadCount: { type: Number, default: 0 },
        readContext: [
            {
                participantId: String,
                participantType: { type: String, enum: ['visitor', 'agent'] },
                lastReadMessageId: String,
            }
        ],
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true, strict: false }
);

// ── Indexes ──
conversationSchema.index({ visitorId: 1, widgetId: 1, status: 1 });     // find active by visitor
conversationSchema.index({ workspaceId: 1, status: 1, lastMessageAt: -1 }); // agent inbox
conversationSchema.index({ assignedTo: 1, status: 1 });                  // my conversations
conversationSchema.index({ widgetId: 1, createdAt: -1 });                // widget analytics
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ slaDeadline: 1, status: 1 });                  // SLA monitoring

export const ConversationModel = mongoose.model<IConversation>('Conversation', conversationSchema);
