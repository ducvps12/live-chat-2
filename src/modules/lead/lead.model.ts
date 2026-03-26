import mongoose, { Document, Schema } from 'mongoose';

export type LeadStage = 'mới' | 'tiềm_năng' | 'đang_tư_vấn' | 'chốt_đơn' | 'khách_hàng' | 'từ_chối';

export interface ILead extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    email: string;
    avatar: string;
    stage: LeadStage;
    source: 'zalo' | 'facebook' | 'widget' | 'manual';
    tags: string[];
    assignedTo: mongoose.Types.ObjectId | null;
    score: number;
    notes: { text: string; createdAt: Date; createdBy: mongoose.Types.ObjectId }[];
    zaloUserId: string;
    fbUserId: string;
    lastContactedAt: Date | null;
    conversationCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true },
        phone: { type: String, default: '' },
        email: { type: String, default: '' },
        avatar: { type: String, default: '' },
        stage: {
            type: String,
            enum: ['mới', 'tiềm_năng', 'đang_tư_vấn', 'chốt_đơn', 'khách_hàng', 'từ_chối'],
            default: 'mới',
        },
        source: {
            type: String,
            enum: ['zalo', 'facebook', 'widget', 'manual'],
            default: 'manual',
        },
        tags: [{ type: String }],
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        score: { type: Number, default: 0, min: 0, max: 100 },
        notes: [{
            text: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        }],
        zaloUserId: { type: String, default: '' },
        fbUserId: { type: String, default: '' },
        lastContactedAt: { type: Date, default: null },
        conversationCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

leadSchema.index({ workspaceId: 1, stage: 1 });
leadSchema.index({ workspaceId: 1, source: 1 });
leadSchema.index({ workspaceId: 1, createdAt: -1 });
leadSchema.index({ workspaceId: 1, zaloUserId: 1 });
leadSchema.index({ workspaceId: 1, tags: 1 });

export const LeadModel = mongoose.model<ILead>('Lead', leadSchema);
