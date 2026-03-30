import { OfflineMessageModel, IOfflineMessage } from './offlineMessage.model';

export const offlineMessageRepo = {
    async create(data: Partial<IOfflineMessage>): Promise<IOfflineMessage> {
        return OfflineMessageModel.create(data);
    },

    async findByWorkspace(
        workspaceId: string,
        options?: { status?: string; page?: number; limit?: number }
    ): Promise<{ items: IOfflineMessage[]; total: number }> {
        const filter: any = { workspaceId };
        if (options?.status) filter.status = options.status;

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            OfflineMessageModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            OfflineMessageModel.countDocuments(filter).exec(),
        ]);

        return { items, total };
    },

    async findById(id: string): Promise<IOfflineMessage | null> {
        return OfflineMessageModel.findById(id).exec();
    },

    async updateStatus(id: string, status: string): Promise<IOfflineMessage | null> {
        return OfflineMessageModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    },

    async countPending(workspaceId: string): Promise<number> {
        return OfflineMessageModel.countDocuments({ workspaceId, status: 'pending' }).exec();
    },
};
