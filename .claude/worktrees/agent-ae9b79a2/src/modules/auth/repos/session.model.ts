import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
    userId: mongoose.Types.ObjectId;
    refreshToken: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
    revokedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        refreshToken: { type: String, required: true, unique: true },
        userAgent: { type: String },
        ipAddress: { type: String },
        expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
        revokedAt: { type: Date },
    },
    {
        timestamps: true,
    }
);

// ── Indexes ──
sessionSchema.index({ userId: 1, revokedAt: 1 });    // active sessions per user
sessionSchema.index({ createdAt: -1 });               // chronological listing

export const SessionModel = mongoose.model<ISession>('Session', sessionSchema);
