import mongoose, { Schema, Document } from 'mongoose';

export interface IFBPage extends Document {
    workspaceId: mongoose.Types.ObjectId;
    pageId: string;       // Facebook Page ID
    pageName: string;
    pageAvatar: string;
    accessToken: string;  // Long-lived Page Access Token
    userAccessToken?: string; // User token that generated this page token
    status: 'active' | 'disconnected' | 'token_expired';
    subscribedFields: string[];
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const FBPageSchema: Schema = new Schema(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        pageId: { type: String, required: true },
        pageName: { type: String, default: 'Facebook Page' },
        pageAvatar: { type: String, default: '' },
        accessToken: { type: String, required: true },
        userAccessToken: { type: String, default: '' },
        status: { type: String, enum: ['active', 'disconnected', 'token_expired'], default: 'active' },
        subscribedFields: { type: [String], default: ['messages', 'messaging_postbacks'] },
        lastActiveAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Unique constraint: 1 page can only be connected to 1 workspace
FBPageSchema.index({ pageId: 1, workspaceId: 1 }, { unique: true });

export const FBPageModel = mongoose.model<IFBPage>('FBPage', FBPageSchema);
