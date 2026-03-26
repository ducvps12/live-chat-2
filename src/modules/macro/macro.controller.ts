import { Request, Response } from 'express';
import { macroService } from './macro.service';
import asyncHandler from 'express-async-handler';

export const macroController = {
    /**
     * GET /macros/workspace/:workspaceId - get all macros available to agent (personal + team)
     */
    getAll: asyncHandler(async (req: Request, res: Response) => {
        const macros = await macroService.getAllForAgent(
            req.params.workspaceId as string,
            (req as any).user.id
        );
        res.status(200).json({ success: true, data: macros });
    }),

    /**
     * GET /macros/workspace/:workspaceId/team - get only team macros
     */
    getTeam: asyncHandler(async (req: Request, res: Response) => {
        const macros = await macroService.getTeamMacros(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: macros });
    }),

    /**
     * POST /macros/workspace/:workspaceId/personal - create personal macro
     */
    createPersonal: asyncHandler(async (req: Request, res: Response) => {
        const { title, content, shortcut, category } = req.body;
        const macro = await macroService.createPersonal(
            req.params.workspaceId as string,
            (req as any).user.id,
            { title, content, shortcut, category }
        );
        res.status(201).json({ success: true, data: macro });
    }),

    /**
     * POST /macros/workspace/:workspaceId/team - create team macro (manager/admin)
     */
    createTeam: asyncHandler(async (req: Request, res: Response) => {
        const { title, content, shortcut, category } = req.body;
        const macro = await macroService.createTeam(
            req.params.workspaceId as string,
            { title, content, shortcut, category }
        );
        res.status(201).json({ success: true, data: macro });
    }),

    /**
     * PATCH /macros/workspace/:workspaceId/:macroId - update macro
     */
    update: asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user;
        const isManagerOrAdmin = ['admin', 'manager'].includes(user.role);
        const { title, content, shortcut, category } = req.body;
        const macro = await macroService.update(
            req.params.macroId as string,
            user.id,
            isManagerOrAdmin,
            { title, content, shortcut, category }
        );
        res.status(200).json({ success: true, data: macro });
    }),

    /**
     * DELETE /macros/workspace/:workspaceId/:macroId - delete macro
     */
    remove: asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user;
        const isManagerOrAdmin = ['admin', 'manager'].includes(user.role);
        await macroService.remove(req.params.macroId as string, user.id, isManagerOrAdmin);
        res.status(200).json({ success: true, message: 'Đã xóa macro' });
    }),

    /**
     * POST /macros/workspace/:workspaceId/:macroId/use - track macro usage
     */
    trackUsage: asyncHandler(async (req: Request, res: Response) => {
        await macroService.incrementUsage(req.params.macroId as string);
        res.status(200).json({ success: true });
    }),
};
