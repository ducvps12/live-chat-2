import mongoose, { Schema, Document } from 'mongoose';

export type SessionStatus = 'pending_login' | 'connected' | 'disconnected' | 'expired' | 'revoked';

export interface IExternalSession extends Document {
    workspaceId: mongoose.Types.ObjectId;
    provider: 'zalo';
    label: string;
    status: SessionStatus;
    createdBy: mongoose.Types.ObjectId;
    connectedAt: Date | null;
    lastActiveAt: Date;
    controlledBy: mongoose.Types.ObjectId | null;
    controlLockedAt: Date | null;
    viewers: mongoose.Types.ObjectId[];
    browserProfileId: string;
    metadata: {
        accountName: string | null;
        avatarUrl: string | null;
    };
}

const externalSessionSchema = new Schema<IExternalSession>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        provider: { type: String, enum: ['zalo'], default: 'zalo' },
        label: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ['pending_login', 'connected', 'disconnected', 'expired', 'revoked'],
            default: 'pending_login',
        },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        connectedAt: { type: Date, default: null },
        lastActiveAt: { type: Date, default: Date.now },
        controlledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        controlLockedAt: { type: Date, default: null },
        viewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        browserProfileId: { type: String, required: true },
        metadata: {
            accountName: { type: String, default: null },
            avatarUrl: { type: String, default: null },
        },
    },
    { timestamps: true }
);

externalSessionSchema.index({ workspaceId: 1, status: 1 });

export const ExternalSessionModel = mongoose.model<IExternalSession>('ExternalSession', externalSessionSchema);
