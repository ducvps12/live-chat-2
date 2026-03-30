import prisma from '../../../infra/prisma';
import type { Campaign } from '@prisma/client';

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';

class CampaignRepo {
    async create(data: {
        workspaceId: string;
        name: string;
        status?: string;
        messages?: string[];
        audience?: any;
        schedule?: any;
        antiSpam?: any;
        recipientIds?: string[];
        createdById?: string;
    }): Promise<Campaign> {
        return prisma.campaign.create({ data: data as any });
    }

    async findByWorkspace(workspaceId: string, options?: {
        status?: CampaignStatus;
        page?: number;
        limit?: number;
    }): Promise<{ items: Campaign[]; total: number }> {
        const where: any = { workspaceId };
        if (options?.status) where.status = options.status;

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
            prisma.campaign.count({ where }),
        ]);

        return { items, total };
    }

    async findById(id: string): Promise<Campaign | null> {
        return prisma.campaign.findUnique({ where: { id } });
    }

    async update(id: string, data: Partial<Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Campaign | null> {
        return prisma.campaign.update({ where: { id }, data: data as any });
    }

    async updateStats(id: string, stats: Record<string, number>, currentIndex?: number): Promise<void> {
        const campaign = await prisma.campaign.findUnique({ where: { id }, select: { stats: true } });
        const currentStats = (campaign?.stats as any) || {};
        Object.assign(currentStats, stats);
        const data: any = { stats: currentStats };
        if (currentIndex !== undefined) data.currentIndex = currentIndex;
        await prisma.campaign.update({ where: { id }, data });
    }

    async pushFailedRecipient(id: string, threadId: string, error: string): Promise<void> {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            select: { failedRecipients: true, stats: true },
        });
        const recipients = (campaign?.failedRecipients as any[]) || [];
        recipients.push({ threadId, error, timestamp: new Date() });
        const stats = (campaign?.stats as any) || {};
        stats.failed = (stats.failed || 0) + 1;
        await prisma.campaign.update({
            where: { id },
            data: { failedRecipients: recipients, stats },
        });
    }

    async setStatus(id: string, status: CampaignStatus): Promise<void> {
        const data: any = { status };
        if (status === 'completed') data.completedAt = new Date();
        await prisma.campaign.update({ where: { id }, data });
    }

    async setRecipientIds(id: string, recipientIds: string[], total: number): Promise<void> {
        const campaign = await prisma.campaign.findUnique({ where: { id }, select: { stats: true } });
        const stats = (campaign?.stats as any) || {};
        stats.total = total;
        stats.pending = total;
        await prisma.campaign.update({
            where: { id },
            data: { recipientIds, stats },
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.campaign.delete({ where: { id } });
    }

    async getWorkspaceStats(workspaceId: string): Promise<{
        totalCampaigns: number;
        activeCampaigns: number;
        totalSent: number;
        totalFailed: number;
    }> {
        const [totalCampaigns, activeCampaigns, allCampaigns] = await Promise.all([
            prisma.campaign.count({ where: { workspaceId } }),
            prisma.campaign.count({ where: { workspaceId, status: { in: ['running', 'scheduled'] } } }),
            prisma.campaign.findMany({ where: { workspaceId }, select: { stats: true } }),
        ]);

        let totalSent = 0, totalFailed = 0;
        for (const c of allCampaigns) {
            const s = c.stats as any;
            totalSent += s?.sent || 0;
            totalFailed += s?.failed || 0;
        }

        return { totalCampaigns, activeCampaigns, totalSent, totalFailed };
    }
}

export const campaignRepo = new CampaignRepo();
