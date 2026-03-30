import mongoose, { Schema, Document } from 'mongoose';

export interface IMacro extends Document {
    workspaceId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;       // null → team macro
    scope: 'personal' | 'team';
    title: string;
    content: string;                        // supports {{placeholders}}
    shortcut?: string;                      // e.g. "/hello"
    category?: string;
    createdAt: Date;
    updatedAt: Date;
}

const macroSchema = new Schema<IMacro>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        scope: { type: String, enum: ['personal', 'team'], required: true, default: 'personal' },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        shortcut: { type: String, trim: true },
        category: { type: String, trim: true },
    },
    { timestamps: true }
);

macroSchema.index({ workspaceId: 1, scope: 1 });
macroSchema.index({ workspaceId: 1, userId: 1 });

export const MacroModel = mongoose.model<IMacro>('Macro', macroSchema);
