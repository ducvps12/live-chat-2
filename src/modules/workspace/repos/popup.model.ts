import mongoose, { Document, Schema } from 'mongoose';

export interface IPopupFormField {
    type: 'text' | 'email' | 'phone' | 'button';
    label: string;
    placeholder?: string;
    required?: boolean;
}

export interface IPopup extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    type: 'popup' | 'notification';
    category: string;           // 'general', 'tet', 'quoc_khanh', '30_4', 'giang_sinh', etc.
    status: 'active' | 'paused';
    design: {
        imageUrl: string;       // background/banner image
        width: number;
        height: number | 'auto';
        layout: string;         // layout template ID
        fields: IPopupFormField[];
        buttonText: string;
        buttonColor: string;
    };
    thankYou: {
        title: string;
        message: string;
        buttonText?: string;
        buttonUrl?: string;
    };
    settings: {
        triggerMode: 'immediate' | 'delay' | 'scroll' | 'exit_intent';
        triggerDelay?: number;   // seconds
        scrollPercent?: number;
        frequency: 'once' | 'every_visit' | 'every_day';
        urlRules: {
            domains: { type: string; value: string }[];
            paths: { type: string; value: string }[];
        };
        startDate?: Date;
        endDate?: Date;
    };
    stats: {
        views: number;
        submissions: number;
        closes: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

const popupFormFieldSchema = new Schema(
    {
        type: { type: String, enum: ['text', 'email', 'phone', 'button'], default: 'text' },
        label: { type: String, required: true },
        placeholder: { type: String },
        required: { type: Boolean, default: false },
    },
    { _id: false }
);

const popupSchema = new Schema<IPopup>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true },
        type: { type: String, enum: ['popup', 'notification'], default: 'popup' },
        category: { type: String, default: 'general' },
        status: { type: String, enum: ['active', 'paused'], default: 'paused' },
        design: {
            imageUrl: { type: String, default: '' },
            width: { type: Number, default: 400 },
            height: { type: Schema.Types.Mixed, default: 600 }, // number or 'auto'
            layout: { type: String, default: 'center' },
            fields: { type: [popupFormFieldSchema], default: [] },
            buttonText: { type: String, default: 'Đăng ký ngay' },
            buttonColor: { type: String, default: '#6366f1' },
        },
        thankYou: {
            title: { type: String, default: 'Thank you' },
            message: { type: String, default: 'We had received your request' },
            buttonText: { type: String },
            buttonUrl: { type: String },
        },
        settings: {
            triggerMode: { type: String, enum: ['immediate', 'delay', 'scroll', 'exit_intent'], default: 'delay' },
            triggerDelay: { type: Number, default: 5 },
            scrollPercent: { type: Number },
            frequency: { type: String, enum: ['once', 'every_visit', 'every_day'], default: 'once' },
            urlRules: {
                domains: [{
                    type: { type: String, enum: ['include', 'exclude'], default: 'include' },
                    value: { type: String },
                }],
                paths: [{
                    type: { type: String, enum: ['include', 'exclude'], default: 'include' },
                    value: { type: String },
                }],
            },
            startDate: { type: Date },
            endDate: { type: Date },
        },
        stats: {
            views: { type: Number, default: 0 },
            submissions: { type: Number, default: 0 },
            closes: { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

popupSchema.index({ workspaceId: 1, status: 1 });
popupSchema.index({ workspaceId: 1, createdAt: -1 });

export const PopupModel = mongoose.model<IPopup>('Popup', popupSchema);
