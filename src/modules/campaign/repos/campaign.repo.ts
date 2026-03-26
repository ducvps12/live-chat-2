import { CampaignModel, ICampaign, CampaignStatus } from './campaign.model';

class CampaignRepo {
    async create(data: Partial<ICampaign>): Promise<ICampaign> {
        return CampaignModel.create(data);
    }

    async findByWorkspace(workspaceId: string, options?: {
        status?: CampaignStatus;
        page?: number;
        limit?: number;
    }): Promise<{ items: ICampaign[]; total: number }> {
        const filter: any = { workspaceId };
        if (options?.status) filter.status = options.status;

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            CampaignModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CampaignModel.countDocuments(filter),
        ]);

        return { items: items as ICampaign[], total };
    }

    async findById(id: string): Promise<ICampaign | null> {
        return CampaignModel.findById(id).lean() as Promise<ICampaign | null>;
    }

    async update(id: string, data: Partial<ICampaign>): Promise<ICampaign | null> {
        return CampaignModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean() as Promise<ICampaign | null>;
    }

    async updateStats(id: string, stats: Partial<ICampaign['stats']>, currentIndex?: number): Promise<void> {
        const update: any = {};
        if (stats.sent !== undefined) update['stats.sent'] = stats.sent;
        if (stats.failed !== undefined) update['stats.failed'] = stats.failed;
        if (stats.pending !== undefined) update['stats.pending'] = stats.pending;
        if (stats.total !== undefined) update['stats.total'] = stats.total;
        if (currentIndex !== undefined) update.currentIndex = currentIndex;
        await CampaignModel.findByIdAndUpdate(id, { $set: update });
    }

    async pushFailedRecipient(id: string, threadId: string, error: string): Promise<void> {
        await CampaignModel.findByIdAndUpdate(id, {
            $push: { failedRecipients: { threadId, error, timestamp: new Date() } },
            $inc: { 'stats.failed': 1 },
        });
    }

    async setStatus(id: string, status: CampaignStatus): Promise<void> {
        const update: any = { status };
        if (status === 'completed') update.completedAt = new Date();
        await CampaignModel.findByIdAndUpdate(id, { $set: update });
    }

    async setRecipientIds(id: string, recipientIds: string[], total: number): Promise<void> {
        await CampaignModel.findByIdAndUpdate(id, {
            $set: {
                recipientIds,
                'stats.total': total,
                'stats.pending': total,
            },
        });
    }

    async delete(id: string): Promise<void> {
        await CampaignModel.findByIdAndDelete(id);
    }

    async getWorkspaceStats(workspaceId: string): Promise<{
        totalCampaigns: number;
        activeCampaigns: number;
        totalSent: number;
        totalFailed: number;
    }> {
        const [totalCampaigns, activeCampaigns, aggregate] = await Promise.all([
            CampaignModel.countDocuments({ workspaceId }),
            CampaignModel.countDocuments({ workspaceId, status: { $in: ['running', 'scheduled'] } }),
            CampaignModel.aggregate([
                { $match: { workspaceId: require('mongoose').Types.ObjectId.createFromHexString(workspaceId) } },
                { $group: { _id: null, totalSent: { $sum: '$stats.sent' }, totalFailed: { $sum: '$stats.failed' } } },
            ]),
        ]);

        return {
            totalCampaigns,
            activeCampaigns,
            totalSent: aggregate[0]?.totalSent || 0,
            totalFailed: aggregate[0]?.totalFailed || 0,
        };
    }
}

export const campaignRepo = new CampaignRepo();
