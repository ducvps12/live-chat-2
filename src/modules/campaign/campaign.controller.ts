import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { campaignService } from './campaign.service';

export const campaignController = {
    /**
     * Create a new campaign (draft)
     * POST /campaigns
     */
    create: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id || (req as any).user?._id;
        const { name, messages, audience, schedule, antiSpam } = req.body;

        const campaign = await campaignService.create(workspaceId, userId, {
            name, messages, audience, schedule, antiSpam,
        });

        res.status(201).json({ success: true, data: campaign });
    }),

    /**
     * List campaigns
     * GET /campaigns
     */
    list: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { status, page, limit } = req.query;

        const result = await campaignService.list(workspaceId, {
            status: status as any,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });

        res.status(200).json({ success: true, data: result });
    }),

    /**
     * Get campaign details
     * GET /campaigns/:campaignId
     */
    getById: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        const campaign = await campaignService.getById(campaignId, workspaceId);
        res.status(200).json({ success: true, data: campaign });
    }),

    /**
     * Update draft campaign
     * PUT /campaigns/:campaignId
     */
    update: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        const { name, messages, audience, schedule, antiSpam } = req.body;

        const updated = await campaignService.update(campaignId, workspaceId, {
            name, messages, audience, schedule, antiSpam,
        });

        res.status(200).json({ success: true, data: updated });
    }),

    /**
     * Start campaign execution
     * POST /campaigns/:campaignId/start
     */
    start: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        const result = await campaignService.start(campaignId, workspaceId);
        res.status(200).json({
            success: true,
            data: result,
            message: `Đã bắt đầu gửi campaign cho ${result.total} người nhận`,
        });
    }),

    /**
     * Pause campaign
     * POST /campaigns/:campaignId/pause
     */
    pause: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        await campaignService.pause(campaignId, workspaceId);
        res.status(200).json({ success: true, message: 'Đã tạm dừng campaign' });
    }),

    /**
     * Resume campaign
     * POST /campaigns/:campaignId/resume
     */
    resume: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        await campaignService.resume(campaignId, workspaceId);
        res.status(200).json({ success: true, message: 'Đã tiếp tục campaign' });
    }),

    /**
     * Cancel/delete campaign
     * DELETE /campaigns/:campaignId
     */
    cancel: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const campaignId = req.params.campaignId as string;
        await campaignService.cancel(campaignId, workspaceId);
        res.status(200).json({ success: true, message: 'Đã hủy campaign' });
    }),

    /**
     * Get workspace campaign stats
     * GET /campaigns/stats
     */
    getStats: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const stats = await campaignService.getStats(workspaceId);
        res.status(200).json({ success: true, data: stats });
    }),
};
