import { macroRepo } from './repos/macro.repo';
import { AppError } from '../../middlewares/errorHandler';

export const macroService = {
    /**
     * Get all macros available to an agent (personal + team)
     */
    async getAllForAgent(workspaceId: string, userId: string) {
        return macroRepo.findAllForAgent(workspaceId, userId);
    },

    /**
     * Get only team macros
     */
    async getTeamMacros(workspaceId: string) {
        return macroRepo.findTeam(workspaceId);
    },

    /**
     * Create personal macro
     */
    async createPersonal(workspaceId: string, userId: string, data: { title: string; content: string; shortcut?: string; category?: string }) {
        if (!data.title?.trim()) throw new AppError('Tiêu đề không được rỗng', 400, 'VALIDATION_ERROR');
        if (!data.content?.trim()) throw new AppError('Nội dung không được rỗng', 400, 'VALIDATION_ERROR');

        return macroRepo.create({
            workspaceId: workspaceId as any,
            userId: userId as any,
            scope: 'personal',
            title: data.title.trim(),
            content: data.content.trim(),
            shortcut: data.shortcut?.trim(),
            category: data.category?.trim(),
        });
    },

    /**
     * Create team macro (requires manager/admin permission)
     */
    async createTeam(workspaceId: string, data: { title: string; content: string; shortcut?: string; category?: string }) {
        if (!data.title?.trim()) throw new AppError('Tiêu đề không được rỗng', 400, 'VALIDATION_ERROR');
        if (!data.content?.trim()) throw new AppError('Nội dung không được rỗng', 400, 'VALIDATION_ERROR');

        return macroRepo.create({
            workspaceId: workspaceId as any,
            userId: null as any,
            scope: 'team',
            title: data.title.trim(),
            content: data.content.trim(),
            shortcut: data.shortcut?.trim(),
            category: data.category?.trim(),
        });
    },

    /**
     * Update macro (personal: owner only, team: manager/admin only)
     */
    async update(macroId: string, userId: string, isManagerOrAdmin: boolean, data: { title?: string; content?: string; shortcut?: string; category?: string }) {
        const macro = await macroRepo.findById(macroId);
        if (!macro) throw new AppError('Macro không tồn tại', 404, 'NOT_FOUND');

        // Permission check
        if (macro.scope === 'personal' && macro.userId?.toString() !== userId) {
            throw new AppError('Bạn không có quyền chỉnh sửa macro này', 403, 'FORBIDDEN');
        }
        if (macro.scope === 'team' && !isManagerOrAdmin) {
            throw new AppError('Chỉ manager/admin mới có quyền chỉnh sửa macro team', 403, 'FORBIDDEN');
        }

        const updateData: any = {};
        if (data.title?.trim()) updateData.title = data.title.trim();
        if (data.content?.trim()) updateData.content = data.content.trim();
        if (data.shortcut !== undefined) updateData.shortcut = data.shortcut?.trim() || undefined;
        if (data.category !== undefined) updateData.category = data.category?.trim() || undefined;

        return macroRepo.update(macroId, updateData);
    },

    /**
     * Delete macro (personal: owner only, team: manager/admin only)
     */
    async remove(macroId: string, userId: string, isManagerOrAdmin: boolean) {
        const macro = await macroRepo.findById(macroId);
        if (!macro) throw new AppError('Macro không tồn tại', 404, 'NOT_FOUND');

        if (macro.scope === 'personal' && macro.userId?.toString() !== userId) {
            throw new AppError('Bạn không có quyền xóa macro này', 403, 'FORBIDDEN');
        }
        if (macro.scope === 'team' && !isManagerOrAdmin) {
            throw new AppError('Chỉ manager/admin mới có quyền xóa macro team', 403, 'FORBIDDEN');
        }

        return macroRepo.remove(macroId);
    },

    /**
     * Find macro by shortcut (for /command lookup)
     */
    async findByShortcut(workspaceId: string, userId: string, shortcut: string) {
        return macroRepo.findByShortcut(workspaceId, userId, shortcut);
    },

    /**
     * Apply placeholder substitution to macro content
     */
    applyPlaceholders(content: string, context: Record<string, string>): string {
        return content.replace(/\{\{(\w+)\}\}/g, (match, key) => context[key] || match);
    },
};
