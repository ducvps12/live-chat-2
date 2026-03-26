import { Request, Response } from 'express';
import { businessHoursService } from './businessHours.service';
import expressAsyncHandler from 'express-async-handler';

export const businessHoursController = {
    get: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const config = await businessHoursService.getByWorkspace(workspaceId);
        res.json({ success: true, data: config });
    }),

    upsert: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const config = await businessHoursService.upsert(workspaceId, req.body);
        res.json({ success: true, data: config });
    }),

    checkStatus: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const status = await businessHoursService.getOfflineConfig(workspaceId);
        res.json({ success: true, data: status });
    }),
};
