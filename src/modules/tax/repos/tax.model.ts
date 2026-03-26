import mongoose, { Schema, Document } from 'mongoose';

export interface ITax extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    rate: number;         // percentage (e.g. 10 = 10%)
    locale: string;       // e.g. 'vi-VN'
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const taxSchema = new Schema<ITax>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true, trim: true },
        rate: { type: Number, required: true, min: 0, max: 100 },
        locale: { type: String, default: 'vi-VN' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

taxSchema.index({ workspaceId: 1, isActive: 1 });

export const TaxModel = mongoose.model<ITax>('Tax', taxSchema);
