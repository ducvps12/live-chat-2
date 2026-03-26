import { Request, Response } from 'express';
import { leadService } from './lead.service';
import asyncHandler from 'express-async-handler';

export const leadController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { stage, source, search, tag, assignedTo, page, limit, sortBy, sortOrder } = req.query;

        const result = await leadService.list({
            workspaceId,
            stage: stage as any,
            source: source as string,
            search: search as string,
            tag: tag as string,
            assignedTo: assignedTo as string,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            sortBy: sortBy as string,
            sortOrder: sortOrder as 'asc' | 'desc',
        });

        res.status(200).json({ success: true, data: result });
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
        const lead = await leadService.getById(req.params.leadId as string);
        if (!lead) { res.status(404).json({ success: false, message: 'Lead không tồn tại' }); return; }
        res.status(200).json({ success: true, data: lead });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const lead = await leadService.create({ ...req.body, workspaceId });
        res.status(201).json({ success: true, data: lead });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const lead = await leadService.update(req.params.leadId as string, req.body);
        if (!lead) { res.status(404).json({ success: false, message: 'Lead không tồn tại' }); return; }
        res.status(200).json({ success: true, data: lead });
    }),

    updateStage: asyncHandler(async (req: Request, res: Response) => {
        const { stage } = req.body;
        const lead = await leadService.updateStage(req.params.leadId as string, stage);
        if (!lead) { res.status(404).json({ success: false, message: 'Lead không tồn tại' }); return; }
        res.status(200).json({ success: true, data: lead });
    }),

    addNote: asyncHandler(async (req: Request, res: Response) => {
        const { text } = req.body;
        const userId = (req as any).userId as string;
        const lead = await leadService.addNote(req.params.leadId as string, text, userId);
        if (!lead) { res.status(404).json({ success: false, message: 'Lead không tồn tại' }); return; }
        res.status(200).json({ success: true, data: lead });
    }),

    delete: asyncHandler(async (req: Request, res: Response) => {
        await leadService.delete(req.params.leadId as string);
        res.status(200).json({ success: true, message: 'Đã xoá lead' });
    }),

    getStats: asyncHandler(async (req: Request, res: Response) => {
        const stats = await leadService.getStats(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: stats });
    }),

    convertFromContact: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const lead = await leadService.convertFromContact(workspaceId, req.body);
        res.status(201).json({ success: true, data: lead });
    }),

    bulkConvertFromGroup: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { groupId, groupName, members } = req.body;

        if (!groupId || !groupName || !members?.length) {
            res.status(400).json({ success: false, message: 'Cần groupId, groupName và danh sách members' });
            return;
        }

        const result = await leadService.bulkConvertFromGroup(workspaceId, { groupId, groupName, members });
        res.status(201).json({
            success: true,
            data: result,
            message: `Đã tạo ${result.created} lead mới, bỏ qua ${result.skipped} đã tồn tại`,
        });
    }),
};
