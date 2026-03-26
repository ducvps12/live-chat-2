import { PopupModel, IPopup } from './popup.model';

export const popupRepo = {
    async create(data: Partial<IPopup>): Promise<IPopup> {
        return PopupModel.create(data);
    },

    async findById(id: string): Promise<IPopup | null> {
        return PopupModel.findById(id).exec();
    },

    async findByWorkspace(workspaceId: string): Promise<IPopup[]> {
        return PopupModel.find({ workspaceId }).sort({ createdAt: -1 }).exec();
    },

    async update(id: string, data: Partial<IPopup>): Promise<IPopup | null> {
        return PopupModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async delete(id: string): Promise<void> {
        await PopupModel.findByIdAndDelete(id).exec();
    },

    async incrementStat(id: string, stat: 'views' | 'submissions' | 'closes'): Promise<void> {
        await PopupModel.findByIdAndUpdate(id, { $inc: { [`stats.${stat}`]: 1 } }).exec();
    },

    async findActive(workspaceId: string): Promise<IPopup[]> {
        return PopupModel.find({ workspaceId, status: 'active' }).exec();
    }
};
