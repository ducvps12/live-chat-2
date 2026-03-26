import { BusinessHoursModel, IBusinessHours, IDaySchedule, IHoliday } from './repos/businessHours.model';
import mongoose from 'mongoose';

class BusinessHoursService {
    async getByWorkspace(workspaceId: string): Promise<IBusinessHours | null> {
        return BusinessHoursModel.findOne({ workspaceId: new mongoose.Types.ObjectId(workspaceId) }).lean();
    }

    async upsert(workspaceId: string, data: {
        timezone?: string;
        schedule?: IDaySchedule[];
        holidays?: IHoliday[];
        offlineAction?: IBusinessHours['offlineAction'];
        offlineMessage?: string;
        isActive?: boolean;
    }): Promise<IBusinessHours> {
        const existing = await BusinessHoursModel.findOne({ workspaceId: new mongoose.Types.ObjectId(workspaceId) });
        if (existing) {
            Object.assign(existing, data);
            return existing.save() as any;
        }
        return BusinessHoursModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            timezone: data.timezone || 'Asia/Ho_Chi_Minh',
            schedule: data.schedule || this.getDefaultSchedule(),
            holidays: data.holidays || [],
            offlineAction: data.offlineAction || 'custom_message',
            offlineMessage: data.offlineMessage || 'Chúng tôi hiện ngoài giờ làm việc. Vui lòng để lại tin nhắn!',
            isActive: data.isActive !== false,
        });
    }

    async isWithinWorkingHours(workspaceId: string): Promise<boolean> {
        const config = await this.getByWorkspace(workspaceId);
        if (!config || !config.isActive) return true; // No config = always open

        const now = new Date();
        // Check holidays
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isHoliday = config.holidays.some(h => {
            const hDate = new Date(h.date);
            return hDate.getFullYear() === today.getFullYear() &&
                hDate.getMonth() === today.getMonth() &&
                hDate.getDate() === today.getDate();
        });
        if (isHoliday) return false;

        // Check day schedule
        const dayOfWeek = now.getDay();
        const daySchedule = config.schedule.find(s => s.day === dayOfWeek);
        if (!daySchedule || !daySchedule.isActive) return false;

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = daySchedule.startTime.split(':').map(Number);
        const [endH, endM] = daySchedule.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    async getOfflineConfig(workspaceId: string): Promise<{
        isOffline: boolean;
        action: string;
        message: string;
    }> {
        const isWorking = await this.isWithinWorkingHours(workspaceId);
        if (isWorking) return { isOffline: false, action: '', message: '' };

        const config = await this.getByWorkspace(workspaceId);
        return {
            isOffline: true,
            action: config?.offlineAction || 'custom_message',
            message: config?.offlineMessage || '',
        };
    }

    private getDefaultSchedule(): IDaySchedule[] {
        return [0, 1, 2, 3, 4, 5, 6].map(day => ({
            day,
            startTime: '08:00',
            endTime: '17:30',
            isActive: day >= 1 && day <= 5, // Mon-Fri
        }));
    }
}

export const businessHoursService = new BusinessHoursService();
