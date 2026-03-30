import { ZaloAccountModel, IZaloAccount } from './zalo-account.model';

export const zaloAccountRepo = {
    async create(data: Partial<IZaloAccount>): Promise<IZaloAccount> {
        return ZaloAccountModel.create(data);
    },

    async findById(id: string): Promise<IZaloAccount | null> {
        return ZaloAccountModel.findById(id).exec();
    },

    async findByWorkspaceId(workspaceId: string): Promise<IZaloAccount[]> {
        return ZaloAccountModel.find({ workspaceId }).exec();
    },

    async findActive(): Promise<IZaloAccount[]> {
        return ZaloAccountModel.find({ status: 'active' }).exec();
    },

    async update(id: string, data: Partial<IZaloAccount>): Promise<IZaloAccount | null> {
        return ZaloAccountModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async updateStatus(id: string, status: 'active' | 'disconnected' | 'banned'): Promise<IZaloAccount | null> {
        return ZaloAccountModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    },

    async updateLastActive(id: string): Promise<void> {
        await ZaloAccountModel.findByIdAndUpdate(id, { lastActiveAt: new Date() }).exec();
    },

    async delete(id: string): Promise<void> {
        await ZaloAccountModel.findByIdAndDelete(id).exec();
    }
};
