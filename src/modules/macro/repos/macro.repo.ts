import { MacroModel, IMacro } from './macro.model';

export const macroRepo = {
    async create(data: Partial<IMacro>): Promise<IMacro> {
        return MacroModel.create(data);
    },

    async findById(id: string): Promise<IMacro | null> {
        return MacroModel.findById(id).exec();
    },

    /**
     * Get personal macros for an agent in a workspace
     */
    async findPersonal(workspaceId: string, userId: string): Promise<IMacro[]> {
        return MacroModel.find({ workspaceId, userId, scope: 'personal' })
            .sort({ category: 1, title: 1 })
            .exec();
    },

    /**
     * Get team macros for a workspace
     */
    async findTeam(workspaceId: string): Promise<IMacro[]> {
        return MacroModel.find({ workspaceId, scope: 'team' })
            .sort({ category: 1, title: 1 })
            .exec();
    },

    /**
     * Get all macros available to an agent (personal + team)
     */
    async findAllForAgent(workspaceId: string, userId: string): Promise<IMacro[]> {
        return MacroModel.find({
            workspaceId,
            $or: [
                { scope: 'team' },
                { scope: 'personal', userId },
            ],
        })
            .sort({ scope: 1, category: 1, title: 1 })
            .exec();
    },

    async update(id: string, data: Partial<IMacro>): Promise<IMacro | null> {
        return MacroModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async remove(id: string): Promise<IMacro | null> {
        return MacroModel.findByIdAndDelete(id).exec();
    },

    async findByShortcut(workspaceId: string, userId: string, shortcut: string): Promise<IMacro | null> {
        return MacroModel.findOne({
            workspaceId,
            shortcut,
            $or: [
                { scope: 'team' },
                { scope: 'personal', userId },
            ],
        }).exec();
    },

    async incrementUsage(id: string): Promise<void> {
        await MacroModel.findByIdAndUpdate(id, { $inc: { usageCount: 1 } }).exec();
    },
};
