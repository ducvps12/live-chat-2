import { AIBotModel, IAIBot } from './chatbot.model';

export const chatbotRepo = {
    async findByWorkspace(workspaceId: string) {
        return AIBotModel.find({ workspaceId })
            .sort({ createdAt: -1 })
            .lean();
    },

    async findById(id: string) {
        return AIBotModel.findById(id).lean();
    },

    async findActive(workspaceId: string, channel?: string) {
        const query: any = { workspaceId, isActive: true };
        if (channel) {
            query[`channels.${channel}.enabled`] = true;
        }
        return AIBotModel.find(query).sort({ createdAt: -1 }).lean();
    },

    async create(data: Partial<IAIBot>) {
        const bot = new AIBotModel(data);
        return bot.save();
    },

    async update(id: string, data: Partial<IAIBot>) {
        return AIBotModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    },

    async remove(id: string) {
        return AIBotModel.findByIdAndDelete(id);
    },

    async toggleActive(id: string, isActive: boolean) {
        return AIBotModel.findByIdAndUpdate(id, { $set: { isActive, isDraft: false } }, { new: true }).lean();
    },

    async incrementStats(id: string, field: 'totalConversations' | 'totalReplies' | 'leadsCollected', amount = 1) {
        return AIBotModel.findByIdAndUpdate(id, { $inc: { [`stats.${field}`]: amount } }, { new: true });
    },

    async count(workspaceId: string) {
        return AIBotModel.countDocuments({ workspaceId });
    },

    async countActive(workspaceId: string) {
        return AIBotModel.countDocuments({ workspaceId, isActive: true });
    },
};
