import { Request, Response, NextFunction } from 'express';
import { knowledgeService } from './knowledge.service';
import expressAsyncHandler from 'express-async-handler';

export const knowledgeController = {
    /**
     * POST /:workspaceId/knowledge/sync
     * Sync from Google Sheets URL
     */
    syncFromSheet: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const { sheetUrl } = req.body;

        if (!sheetUrl) {
            res.status(400).json({ success: false, message: 'sheetUrl là bắt buộc' });
            return;
        }

        const result = await knowledgeService.syncFromGoogleSheets(workspaceId, sheetUrl);
        res.json({ success: true, data: result });
    }),

    /**
     * GET /:workspaceId/knowledge
     * List all entries (with optional product filter)
     */
    getAll: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const { product } = req.query;
        const entries = await knowledgeService.getAll(workspaceId, {
            product: product as string | undefined,
        });
        res.json({ success: true, data: entries });
    }),

    /**
     * GET /:workspaceId/knowledge/search?q=...
     * Search entries
     */
    search: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const { q, limit } = req.query;

        if (!q || (q as string).length < 2) {
            res.json({ success: true, data: [] });
            return;
        }

        const results = await knowledgeService.search(
            workspaceId,
            q as string,
            limit ? parseInt(limit as string) : 5,
        );
        res.json({ success: true, data: results });
    }),

    /**
     * GET /:workspaceId/knowledge/suggest?message=...
     * Smart suggest based on customer message
     */
    suggest: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const { message } = req.query;

        const suggestions = await knowledgeService.smartSuggest(
            workspaceId,
            (message as string) || '',
        );
        res.json({ success: true, data: suggestions });
    }),

    /**
     * GET /:workspaceId/knowledge/products
     * Get distinct product categories
     */
    getProducts: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const products = await knowledgeService.getProducts(workspaceId);
        res.json({ success: true, data: products });
    }),

    /**
     * GET /:workspaceId/knowledge/stats
     * Get knowledge base stats
     */
    getStats: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const stats = await knowledgeService.getStats(workspaceId);
        res.json({ success: true, data: stats });
    }),

    /**
     * POST /:workspaceId/knowledge
     * Create manual entry
     */
    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const { workspaceId } = req.params;
        const { product, question, answer, upsaleText } = req.body;

        if (!product || !question || !answer) {
            res.status(400).json({ success: false, message: 'product, question, answer là bắt buộc' });
            return;
        }

        const entry = await knowledgeService.create(workspaceId, { product, question, answer, upsaleText });
        res.status(201).json({ success: true, data: entry });
    }),

    /**
     * PUT /:workspaceId/knowledge/:id
     * Update entry
     */
    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { product, question, answer, upsaleText } = req.body;
        const entry = await knowledgeService.update(id, { product, question, answer, upsaleText });
        res.json({ success: true, data: entry });
    }),

    /**
     * DELETE /:workspaceId/knowledge/:id
     * Delete entry
     */
    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        await knowledgeService.remove(id);
        res.json({ success: true, message: 'Đã xóa' });
    }),
};
