import { Request, Response } from 'express';
import { orderService } from './order.service';
import expressAsyncHandler from 'express-async-handler';

export const orderController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { status, search, page, limit } = req.query;
        const result = await orderService.list(workspaceId, {
            status: status as any,
            search: search as string,
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
        });
        res.json({ success: true, data: result });
    }),

    getById: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const orderId = req.params.orderId as string;
        const order = await orderService.getById(orderId, workspaceId);
        res.json({ success: true, data: order });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const order = await orderService.create(workspaceId, userId, req.body);
        res.status(201).json({ success: true, data: order });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const orderId = req.params.orderId as string;
        const order = await orderService.update(orderId, workspaceId, req.body);
        res.json({ success: true, data: order });
    }),

    updateStatus: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const orderId = req.params.orderId as string;
        const userId = (req as any).user?.id;
        const { status } = req.body;
        const order = await orderService.updateStatus(orderId, workspaceId, status, userId);
        res.json({ success: true, data: order });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const orderId = req.params.orderId as string;
        await orderService.delete(orderId, workspaceId);
        res.json({ success: true, message: 'Đã xóa đơn hàng' });
    }),

    getStats: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const stats = await orderService.getStats(workspaceId);
        res.json({ success: true, data: stats });
    }),
};
