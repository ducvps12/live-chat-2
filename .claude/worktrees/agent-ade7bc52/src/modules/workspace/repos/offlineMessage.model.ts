import mongoose, { Document, Schema } from 'mongoose';

export interface IOfflineMessage extends Document {
    widgetId: mongoose.Types.ObjectId;
    workspaceId: mongoose.Types.ObjectId;
    visitorId: string;
    name: string;
    email: string;
    message: string;
    status: 'pending' | 'read' | 'replied';
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const offlineMessageSchema = new Schema<IOfflineMessage>(
    {
        widgetId: { type: Schema.Types.ObjectId, ref: 'Widget', required: true, index: true },
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        visitorId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        message: { type: String, required: true },
        status: { type: String, enum: ['pending', 'read', 'replied'], default: 'pending' },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

// Compound indexes for query performance
offlineMessageSchema.index({ workspaceId: 1, status: 1, createdAt: -1 }); // workspace listing by status
offlineMessageSchema.index({ widgetId: 1, status: 1, createdAt: -1 });    // widget-scoped queries
offlineMessageSchema.index({ email: 1, workspaceId: 1 });                 // find by visitor email
offlineMessageSchema.index({ createdAt: -1 });                            // chronological listing
offlineMessageSchema.index({ visitorId: 1, createdAt: -1 });              // visitor history

export const OfflineMessageModel = mongoose.model<IOfflineMessage>('OfflineMessage', offlineMessageSchema);
