import { Request, Response } from 'express';
import { productService } from './product.service';
import expressAsyncHandler from 'express-async-handler';

export const productController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { category, search, page, limit } = req.query;
        const result = await productService.list(workspaceId, {
            category: category as string,
            search: search as string,
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
        });
        res.json({ success: true, data: result });
    }),

    getById: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const productId = req.params.productId as string;
        const product = await productService.getById(productId, workspaceId);
        res.json({ success: true, data: product });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const product = await productService.create(workspaceId, userId, req.body);
        res.status(201).json({ success: true, data: product });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const productId = req.params.productId as string;
        const product = await productService.update(productId, workspaceId, req.body);
        res.json({ success: true, data: product });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const productId = req.params.productId as string;
        await productService.delete(productId, workspaceId);
        res.json({ success: true, message: 'Đã xóa sản phẩm' });
    }),

    syncGoogleSheet: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const { sheetUrl } = req.body;
        if (!sheetUrl) {
            res.status(400).json({ success: false, message: 'Cần cung cấp URL Google Sheet' });
            return;
        }
        const result = await productService.syncFromGoogleSheet(workspaceId, userId, sheetUrl);
        res.json({ success: true, data: result });
    }),

    getCategories: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const categories = await productService.getCategories(workspaceId);
        res.json({ success: true, data: categories });
    }),
};
