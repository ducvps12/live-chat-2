import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { chatbotService } from './chatbot.service';
import axios from 'axios';

const AI_API_URL = process.env.AI_API_URL || 'http://163.61.111.226:8318/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'friend-key-alpha';

export const chatbotController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const bots = await chatbotService.list(workspaceId);
        res.json({ success: true, data: bots });
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const botId = req.params.botId as string;
        const bot = await chatbotService.getOne(botId);
        res.json({ success: true, data: bot });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const bot = await chatbotService.create(workspaceId, req.body);
        res.status(201).json({ success: true, data: bot });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const botId = req.params.botId as string;
        const bot = await chatbotService.update(botId, req.body);
        res.json({ success: true, data: bot });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        const botId = req.params.botId as string;
        await chatbotService.remove(botId);
        res.json({ success: true, message: 'Bot đã được xóa' });
    }),

    toggleActive: asyncHandler(async (req: Request, res: Response) => {
        const botId = req.params.botId as string;
        const { isActive } = req.body;
        const bot = await chatbotService.toggleActive(botId, isActive);
        res.json({ success: true, data: bot });
    }),

    getStats: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const stats = await chatbotService.getStats(workspaceId);
        res.json({ success: true, data: stats });
    }),

    // Public endpoint: bot processes a message (called from widget/socket)
    processMessage: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { message, channel } = req.body;
        const result = await chatbotService.processIncomingMessage(workspaceId, message, channel);
        res.json({ success: true, data: result });
    }),

    // List available AI models from the custom API
    listModels: asyncHandler(async (_req: Request, res: Response) => {
        try {
            const response = await axios.get(`${AI_API_URL}/models`, {
                headers: { 'Authorization': `Bearer ${AI_API_KEY}` },
                timeout: 10000,
            });
            const models = (response.data?.data || []).map((m: any) => ({
                id: m.id,
                name: m.id,
                owned_by: m.owned_by || 'custom',
            }));
            res.json({ success: true, data: models });
        } catch (err: any) {
            console.error('[AI] Failed to list models:', err?.response?.status, err.message);
            // Return default model as fallback
            res.json({
                success: true,
                data: [{ id: process.env.AI_MODEL || 'gpt-5', name: process.env.AI_MODEL || 'gpt-5', owned_by: 'custom' }],
            });
        }
    }),
};
