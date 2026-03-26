import { Request, Response } from 'express';
import { distributionService } from './distribution.service';
import expressAsyncHandler from 'express-async-handler';

export const distributionController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const rules = await distributionService.list(workspaceId);
        res.json({ success: true, data: rules });
    }),

    getById: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const ruleId = req.params.ruleId as string;
        const rule = await distributionService.getById(ruleId, workspaceId);
        res.json({ success: true, data: rule });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const rule = await distributionService.create(workspaceId, userId, req.body);
        res.status(201).json({ success: true, data: rule });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const ruleId = req.params.ruleId as string;
        const rule = await distributionService.update(ruleId, workspaceId, req.body);
        res.json({ success: true, data: rule });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const ruleId = req.params.ruleId as string;
        await distributionService.delete(ruleId, workspaceId);
        res.json({ success: true, message: 'Đã xóa rule' });
    }),
};
