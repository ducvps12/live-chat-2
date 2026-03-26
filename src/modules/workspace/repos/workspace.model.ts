import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspace extends Document {
    name: string;
    slug: string;
    logoUrl?: string;
    ownerId: mongoose.Types.ObjectId;
    plan: string;
    settings: {
        timezone: string;
        language: string;
        businessHours?: {
            enabled: boolean;
            schedule: Array<{ day: number; start: string; end: string }>;
            holidays?: Array<{ date: string; name?: string }>; // 'YYYY-MM-DD'
        };
    };
    members: Array<{
        userId: mongoose.Types.ObjectId;
        role: string;       // 'owner' | 'admin' | 'agent' | 'member'
        joinedAt: Date;
    }>;
    tags: string[];  // workspace-level tag registry
    labels: Array<{ name: string; color: string }>;  // colored labels (Zalo-style)
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const memberSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['owner', 'admin', 'agent', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const workspaceSchema = new Schema<IWorkspace>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true, index: true },
        logoUrl: { type: String, default: '' },
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
        settings: {
            timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
            language: { type: String, default: 'vi' },
            businessHours: {
                enabled: { type: Boolean, default: false },
                schedule: [
                    {
                        day: Number,   // 0=Sunday, 1=Monday, ..., 6=Saturday
                        start: String, // 'HH:mm' e.g. '08:00'
                        end: String,   // 'HH:mm' e.g. '17:30'
                    },
                ],
                holidays: [
                    {
                        date: String,  // 'YYYY-MM-DD'
                        name: String,  // optional label
                    },
                ],
            },
        },
        members: [memberSchema],
        tags: { type: [String], default: [] },
        labels: {
            type: [{
                name: { type: String, required: true },
                color: { type: String, required: true },
            }],
            default: [],
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// ── Indexes ──
workspaceSchema.index({ ownerId: 1 });                          // owner's workspaces
workspaceSchema.index({ 'members.userId': 1 });                 // member lookup
workspaceSchema.index({ 'members.userId': 1, isActive: 1 });    // getMyWorkspaces
workspaceSchema.index({ isActive: 1, createdAt: -1 });          // active workspaces listing

export const WorkspaceModel = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
