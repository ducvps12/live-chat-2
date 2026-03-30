import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction =
    | 'session_created'
    | 'qr_rendered'
    | 'login_success'
    | 'login_failed'
    | 'control_taken'
    | 'control_released'
    | 'session_disconnected'
    | 'session_revoked'
    | 'session_reconnected'
    | 'viewer_joined'
    | 'viewer_left';

export interface ISessionAuditLog extends Document {
    sessionId: mongoose.Types.ObjectId;
    workspaceId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    action: AuditAction;
    details: any;
    createdAt: Date;
}

const sessionAuditLogSchema = new Schema<ISessionAuditLog>(
    {
        sessionId: { type: Schema.Types.ObjectId, ref: 'ExternalSession', required: true, index: true },
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        action: {
            type: String,
            enum: [
                'session_created', 'qr_rendered', 'login_success', 'login_failed',
                'control_taken', 'control_released', 'session_disconnected',
                'session_revoked', 'session_reconnected', 'viewer_joined', 'viewer_left',
            ],
            required: true,
        },
        details: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

sessionAuditLogSchema.index({ sessionId: 1, createdAt: -1 });

export const SessionAuditLogModel = mongoose.model<ISessionAuditLog>('SessionAuditLog', sessionAuditLogSchema);
