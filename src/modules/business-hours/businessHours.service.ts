import prisma from '../../infra/prisma';
import type { BusinessHours } from '@prisma/client';

interface IDaySchedule {
    day: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
}

interface IHoliday {
    date: string;
    name: string;
}

class BusinessHoursService {
    async getByWorkspace(workspaceId: string): Promise<BusinessHours | null> {
        return prisma.businessHours.findUnique({ where: { workspaceId } });
    }

    async upsert(workspaceId: string, data: {
        timezone?: string;
        schedule?: IDaySchedule[];
        holidays?: IHoliday[];
        offlineAction?: string;
        offlineMessage?: string;
        isActive?: boolean;
    }): Promise<BusinessHours> {
        return prisma.businessHours.upsert({
            where: { workspaceId },
            create: {
                workspaceId,
                timezone: data.timezone || 'Asia/Ho_Chi_Minh',
                schedule: (data.schedule || this.getDefaultSchedule()) as any,
                holidays: (data.holidays || []) as any,
                offlineAction: data.offlineAction || 'custom_message',
                offlineMessage: data.offlineMessage || 'Chúng tôi hiện ngoài giờ làm việc. Vui lòng để lại tin nhắn!',
                isActive: data.isActive !== false,
            },
            update: data as any,
        });
    }

    async isWithinWorkingHours(workspaceId: string): Promise<boolean> {
        const config = await this.getByWorkspace(workspaceId);
        if (!config || !config.isActive) return true;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const holidays = (config.holidays as IHoliday[]) || [];
        const isHoliday = holidays.some(h => {
            const hDate = new Date(h.date);
            return hDate.getFullYear() === today.getFullYear() &&
                hDate.getMonth() === today.getMonth() &&
                hDate.getDate() === today.getDate();
        });
        if (isHoliday) return false;

        const dayOfWeek = now.getDay();
        const schedule = (config.schedule as IDaySchedule[]) || [];
        const daySchedule = schedule.find(s => s.day === dayOfWeek);
        if (!daySchedule || !daySchedule.isActive) return false;

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = daySchedule.startTime.split(':').map(Number);
        const [endH, endM] = daySchedule.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    async getOfflineConfig(workspaceId: string): Promise<{ isOffline: boolean; action: string; message: string }> {
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
            isActive: day >= 1 && day <= 5,
        }));
    }
}

export const businessHoursService = new BusinessHoursService();
