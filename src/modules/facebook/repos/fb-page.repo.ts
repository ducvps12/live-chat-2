import { FBPageModel, IFBPage } from './fb-page.model';

export const fbPageRepo = {
    async create(data: Partial<IFBPage>): Promise<IFBPage> {
        return FBPageModel.create(data);
    },

    async findById(id: string): Promise<IFBPage | null> {
        return FBPageModel.findById(id).exec();
    },

    async findByWorkspaceId(workspaceId: string): Promise<IFBPage[]> {
        return FBPageModel.find({ workspaceId }).exec();
    },

    async findByPageId(pageId: string): Promise<IFBPage | null> {
        return FBPageModel.findOne({ pageId }).exec();
    },

    async findActive(): Promise<IFBPage[]> {
        return FBPageModel.find({ status: 'active' }).exec();
    },

    async update(id: string, data: Partial<IFBPage>): Promise<IFBPage | null> {
        return FBPageModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async updateByPageId(pageId: string, data: Partial<IFBPage>): Promise<IFBPage | null> {
        return FBPageModel.findOneAndUpdate({ pageId }, data, { new: true }).exec();
    },

    async delete(id: string): Promise<void> {
        await FBPageModel.findByIdAndDelete(id).exec();
    },

    async upsertPage(workspaceId: string, pageId: string, data: Partial<IFBPage>): Promise<IFBPage> {
        const result = await FBPageModel.findOneAndUpdate(
            { workspaceId, pageId },
            { $set: { ...data, workspaceId, pageId } },
            { upsert: true, new: true }
        ).exec();
        return result!;
    },
};
