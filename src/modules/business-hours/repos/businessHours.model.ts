import mongoose, { Schema, Document } from 'mongoose';

export interface IDaySchedule {
    day: number;  // 0 = Sunday, 6 = Saturday
    startTime: string;  // "08:00"
    endTime: string;    // "17:30"
    isActive: boolean;
}

export interface IHoliday {
    date: Date;
    name: string;
}

export interface IBusinessHours extends Document {
    workspaceId: mongoose.Types.ObjectId;
    timezone: string;
    schedule: IDaySchedule[];
    holidays: IHoliday[];
    offlineAction: 'bot_reply' | 'show_form' | 'custom_message';
    offlineMessage: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const businessHoursSchema = new Schema<IBusinessHours>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
        timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
        schedule: [{
            day: { type: Number, min: 0, max: 6, required: true },
            startTime: { type: String, required: true },
            endTime: { type: String, required: true },
            isActive: { type: Boolean, default: true },
        }],
        holidays: [{
            date: { type: Date, required: true },
            name: { type: String, required: true },
        }],
        offlineAction: { type: String, enum: ['bot_reply', 'show_form', 'custom_message'], default: 'custom_message' },
        offlineMessage: { type: String, default: 'Chúng tôi hiện ngoài giờ làm việc. Vui lòng để lại tin nhắn!' },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const BusinessHoursModel = mongoose.model<IBusinessHours>('BusinessHours', businessHoursSchema);
