import { WorkspaceModel, IWorkspace } from './workspace.model';

export const workspaceRepo = {
    async create(data: Partial<IWorkspace>): Promise<IWorkspace> {
        return WorkspaceModel.create(data);
    },

    async findById(id: string): Promise<IWorkspace | null> {
        return WorkspaceModel.findById(id).exec();
    },

    async findBySlug(slug: string): Promise<IWorkspace | null> {
        return WorkspaceModel.findOne({ slug }).exec();
    },

    async findByMemberUserId(userId: string): Promise<IWorkspace[]> {
        return WorkspaceModel.find({ 'members.userId': userId, isActive: true }).exec();
    },

    async update(id: string, data: Partial<IWorkspace>): Promise<IWorkspace | null> {
        return WorkspaceModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async addMember(workspaceId: string, member: { userId: string; role: string }): Promise<IWorkspace | null> {
        return WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $push: { members: { ...member, joinedAt: new Date() } } },
            { new: true }
        ).exec();
    },

    async removeMember(workspaceId: string, userId: string): Promise<IWorkspace | null> {
        return WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $pull: { members: { userId } } },
            { new: true }
        ).exec();
    },

    async delete(id: string): Promise<void> {
        await WorkspaceModel.findByIdAndUpdate(id, { isActive: false }).exec();
    },

    async getMembers(workspaceId: string) {
        const ws = await WorkspaceModel.findById(workspaceId)
            .populate('members.userId', 'name email role avatarUrl')
            .exec();
        if (!ws) return [];
        return ws.members;
    },

    // ── Tag registry CRUD ──

    async getTags(workspaceId: string): Promise<string[]> {
        const ws = await WorkspaceModel.findById(workspaceId, 'tags').exec();
        return ws?.tags || [];
    },

    async addTag(workspaceId: string, tag: string): Promise<string[]> {
        const ws = await WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $addToSet: { tags: tag } },
            { new: true }
        ).exec();
        return ws?.tags || [];
    },

    async removeTag(workspaceId: string, tag: string): Promise<string[]> {
        const ws = await WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $pull: { tags: tag } },
            { new: true }
        ).exec();
        return ws?.tags || [];
    },

    async updateTag(workspaceId: string, oldTag: string, newTag: string): Promise<string[]> {
        // Pull old, push new (atomic-like)
        await WorkspaceModel.findByIdAndUpdate(workspaceId, { $pull: { tags: oldTag } }).exec();
        const ws = await WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $addToSet: { tags: newTag } },
            { new: true }
        ).exec();
        return ws?.tags || [];
    },

    // ── Label registry CRUD (colored tags, Zalo-style) ──

    async getLabels(workspaceId: string): Promise<Array<{ name: string; color: string }>> {
        const ws = await WorkspaceModel.findById(workspaceId, 'labels').exec();
        return ws?.labels || [];
    },

    async addLabel(workspaceId: string, label: { name: string; color: string }): Promise<Array<{ name: string; color: string }>> {
        const ws = await WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $push: { labels: label } },
            { new: true }
        ).exec();
        return ws?.labels || [];
    },

    async removeLabel(workspaceId: string, labelName: string): Promise<Array<{ name: string; color: string }>> {
        const ws = await WorkspaceModel.findByIdAndUpdate(
            workspaceId,
            { $pull: { labels: { name: labelName } } },
            { new: true }
        ).exec();
        return ws?.labels || [];
    },

    async updateLabel(workspaceId: string, oldName: string, newLabel: { name: string; color: string }): Promise<Array<{ name: string; color: string }>> {
        // Use array filter positional update
        const ws = await WorkspaceModel.findOneAndUpdate(
            { _id: workspaceId, 'labels.name': oldName },
            { $set: { 'labels.$.name': newLabel.name, 'labels.$.color': newLabel.color } },
            { new: true }
        ).exec();
        return ws?.labels || [];
    },
};
