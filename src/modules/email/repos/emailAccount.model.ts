import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailAccount extends Document {
    workspaceId: mongoose.Types.ObjectId;
    email: string;
    displayName: string;
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        password: string;
    };
    imap: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        password: string;
    };
    isActive: boolean;
    allowReceive: boolean;
    allowSend: boolean;
    ticketType: string;
    lastSyncAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const emailAccountSchema = new Schema<IEmailAccount>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        email: { type: String, required: true, trim: true },
        displayName: { type: String, default: '' },
        smtp: {
            host: { type: String, default: '' },
            port: { type: Number, default: 587 },
            secure: { type: Boolean, default: false },
            user: { type: String, default: '' },
            password: { type: String, default: '' },
        },
        imap: {
            host: { type: String, default: '' },
            port: { type: Number, default: 993 },
            secure: { type: Boolean, default: true },
            user: { type: String, default: '' },
            password: { type: String, default: '' },
        },
        isActive: { type: Boolean, default: true },
        allowReceive: { type: Boolean, default: true },
        allowSend: { type: Boolean, default: true },
        ticketType: { type: String, default: 'support' },
        lastSyncAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

emailAccountSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export const EmailAccountModel = mongoose.model<IEmailAccount>('EmailAccount', emailAccountSchema);
