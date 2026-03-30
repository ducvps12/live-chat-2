import mongoose, { Document, Schema } from 'mongoose';

export interface IVisitor extends Document {
    visitorId: string;            // client-generated UUID
    widgetId: mongoose.Types.ObjectId;
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    email: string;
    phone: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    totalConversations: number;
    attributes: Record<string, any>;  // custom fields
    createdAt: Date;
    updatedAt: Date;
}

const visitorSchema = new Schema<IVisitor>(
    {
        visitorId: { type: String, required: true },
        widgetId: { type: Schema.Types.ObjectId, ref: 'Widget', required: true },
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        name: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        totalConversations: { type: Number, default: 0 },
        attributes: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// ── Indexes ──
visitorSchema.index({ visitorId: 1, widgetId: 1 }, { unique: true }); // one profile per visitor per widget
visitorSchema.index({ workspaceId: 1, lastSeenAt: -1 });              // agent: list visitors
visitorSchema.index({ email: 1, workspaceId: 1 });                    // lookup by email
visitorSchema.index({ createdAt: -1 });

export const VisitorModel = mongoose.model<IVisitor>('Visitor', visitorSchema);
