import mongoose, { Schema, Document } from 'mongoose';

export interface ICampaignAudience {
    type: 'all' | 'filter' | 'manual' | 'group';
    filters?: {
        source?: 'friend' | 'stranger' | 'group';
        minMessages?: number;
        lastActiveWithinDays?: number;
        tags?: string[];
    };
    manualIds?: string[];  // Specific zaloUserIds
    groupId?: string;      // Zalo group ID (when type === 'group')
}

export interface ICampaignSchedule {
    startAt: Date;
    sendWindow?: {
        startHour: number;  // 0-23
        endHour: number;    // 0-23
    };
}

export interface ICampaignAntiSpam {
    delayBetweenMs: number;  // Min 5000ms
    maxPerHour: number;      // Default 30
    randomizeDelay: boolean; // ±30% jitter
}

export interface ICampaignStats {
    total: number;
    sent: number;
    failed: number;
    pending: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';

export interface ICampaign extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    status: CampaignStatus;
    messages: string[];               // Array of message content templates
    audience: ICampaignAudience;
    schedule: ICampaignSchedule;
    antiSpam: ICampaignAntiSpam;
    stats: ICampaignStats;
    recipientIds: string[];           // Resolved list of threadIds/zaloUserIds
    failedRecipients: Array<{ threadId: string; error: string; timestamp: Date }>;
    currentIndex: number;             // Progress tracker for resume
    createdBy: mongoose.Types.ObjectId;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'],
            default: 'draft',
        },
        messages: [{ type: String }],
        audience: {
            type: { type: String, enum: ['all', 'filter', 'manual', 'group'], default: 'all' },
            filters: {
                source: { type: String, enum: ['friend', 'stranger', 'group'] },
                minMessages: Number,
                lastActiveWithinDays: Number,
                tags: [String],
            },
            manualIds: [String],
        },
        schedule: {
            startAt: { type: Date },
            sendWindow: {
                startHour: { type: Number, default: 8 },
                endHour: { type: Number, default: 21 },
            },
        },
        antiSpam: {
            delayBetweenMs: { type: Number, default: 8000, min: 5000 },
            maxPerHour: { type: Number, default: 30, min: 5, max: 100 },
            randomizeDelay: { type: Boolean, default: true },
        },
        stats: {
            total: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            pending: { type: Number, default: 0 },
        },
        recipientIds: [{ type: String }],
        failedRecipients: [{
            threadId: String,
            error: String,
            timestamp: { type: Date, default: Date.now },
        }],
        currentIndex: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        completedAt: Date,
    },
    { timestamps: true }
);

// Indexes
CampaignSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

export const CampaignModel = mongoose.model<ICampaign>('Campaign', CampaignSchema);
