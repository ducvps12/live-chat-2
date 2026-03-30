import { WidgetModel, IWidget } from './widget.model';

export const widgetRepo = {
    async create(data: Partial<IWidget>): Promise<IWidget> {
        return WidgetModel.create(data);
    },

    async findById(id: string): Promise<IWidget | null> {
        return WidgetModel.findById(id).exec();
    },

    async findByWorkspace(workspaceId: string): Promise<IWidget[]> {
        return WidgetModel.find({ workspaceId, isActive: true }).exec();
    },

    async update(id: string, data: Partial<IWidget>): Promise<IWidget | null> {
        return WidgetModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async delete(id: string): Promise<void> {
        await WidgetModel.findByIdAndUpdate(id, { isActive: false }).exec();
    }
};
