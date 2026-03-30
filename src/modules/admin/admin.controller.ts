import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import prisma from '../../infra/prisma';
import os from 'os';
import axios from 'axios';

const AI_API_URL = process.env.AI_API_URL || 'http://163.61.111.226:8318/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'friend-key-alpha';

export const adminController = {
    overview: asyncHandler(async (_req: Request, res: Response) => {
        const [
            workspaces, users, conversations, messages,
            visitors, widgets, aiBots, leads,
            campaigns, knowledge, macros,
        ] = await Promise.all([
            prisma.workspace.count(),
            prisma.user.count(),
            prisma.conversation.count(),
            prisma.message.count(),
            prisma.visitor.count(),
            prisma.widget.count(),
            prisma.aIBot.count(),
            prisma.lead.count().catch(() => 0),
            prisma.campaign.count().catch(() => 0),
            prisma.knowledgeEntry.count().catch(() => 0),
            prisma.macro.count().catch(() => 0),
        ]);

        const [openConvs, closedConvs, pendingConvs] = await Promise.all([
            prisma.conversation.count({ where: { status: 'open' } }),
            prisma.conversation.count({ where: { status: 'closed' } }),
            prisma.conversation.count({ where: { status: 'pending' } }),
        ]);

        const activeBots = await prisma.aIBot.count({ where: { isActive: true } });

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [msgsToday, convsToday, visitorsToday] = await Promise.all([
            prisma.message.count({ where: { createdAt: { gte: oneDayAgo } } }),
            prisma.conversation.count({ where: { createdAt: { gte: oneDayAgo } } }),
            prisma.visitor.count({ where: { createdAt: { gte: oneDayAgo } } }),
        ]);

        const uptime = process.uptime();
        const memUsage = process.memoryUsage();

        res.json({
            success: true,
            data: {
                collections: {
                    workspaces, users, conversations, messages,
                    visitors, widgets, aiBots, leads,
                    campaigns, knowledge, macros, labels: 0,
                },
                conversationStats: {
                    open: openConvs, closed: closedConvs, pending: pendingConvs, total: conversations,
                },
                botStats: { total: aiBots, active: activeBots },
                recentActivity: { messagesToday: msgsToday, conversationsToday: convsToday, visitorsToday },
                server: {
                    uptime: Math.floor(uptime),
                    uptimeFormatted: formatUptime(uptime),
                    memoryUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    memoryTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    platform: os.platform(),
                    hostname: os.hostname(),
                    nodeVersion: process.version,
                    cpus: os.cpus().length,
                    totalRAM: Math.round(os.totalmem() / 1024 / 1024 / 1024),
                    freeRAM: Math.round(os.freemem() / 1024 / 1024 / 1024),
                },
                database: { name: 'MySQL (Prisma)', collections: 0, dataSize: 0, storageSize: 0, indexes: 0 },
                ai: { apiUrl: AI_API_URL, model: process.env.AI_MODEL || 'gpt-5' },
            },
        });
    }),

    listWorkspaces: asyncHandler(async (_req: Request, res: Response) => {
        const workspaces = await prisma.workspace.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                members: true,
                _count: { select: { conversations: true, widgets: true } },
            },
        });

        const enriched = workspaces.map(ws => ({
            ...ws,
            _convCount: (ws as any)._count.conversations,
            _memberCount: ws.members.length,
            _widgetCount: (ws as any)._count.widgets,
        }));

        res.json({ success: true, data: enriched });
    }),

    listUsers: asyncHandler(async (_req: Request, res: Response) => {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            omit: { passwordHash: true },
        });
        res.json({ success: true, data: users });
    }),

    listBots: asyncHandler(async (_req: Request, res: Response) => {
        const bots = await prisma.aIBot.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: bots });
    }),

    toggleBot: asyncHandler(async (req: Request, res: Response) => {
        const { botId } = req.params;
        const { isActive } = req.body;
        await prisma.aIBot.update({
            where: { id: botId as string },
            data: { isActive, isDraft: !isActive },
        });
        res.json({ success: true, message: isActive ? 'Bot activated' : 'Bot deactivated' });
    }),

    aiHealth: asyncHandler(async (_req: Request, res: Response) => {
        try {
            const start = Date.now();
            const response = await axios.get(`${AI_API_URL}/models`, {
                headers: { 'Authorization': `Bearer ${AI_API_KEY}` },
                timeout: 10000,
            });
            const latency = Date.now() - start;
            const models = response.data?.data || [];
            res.json({
                success: true,
                data: {
                    status: 'online', latency,
                    models: models.map((m: any) => ({ id: m.id, owned_by: m.owned_by })),
                    modelCount: models.length,
                },
            });
        } catch (err: any) {
            res.json({
                success: true,
                data: {
                    status: 'offline', error: err?.response?.status || err.message,
                    latency: -1, models: [], modelCount: 0,
                },
            });
        }
    }),

    recentMessages: asyncHandler(async (_req: Request, res: Response) => {
        const msgs = await prisma.message.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json({ success: true, data: msgs });
    }),

    collections: asyncHandler(async (_req: Request, res: Response) => {
        // List all Prisma model counts
        const counts = await Promise.all([
            prisma.user.count().then(c => ({ name: 'User', count: c })),
            prisma.workspace.count().then(c => ({ name: 'Workspace', count: c })),
            prisma.conversation.count().then(c => ({ name: 'Conversation', count: c })),
            prisma.message.count().then(c => ({ name: 'Message', count: c })),
            prisma.visitor.count().then(c => ({ name: 'Visitor', count: c })),
            prisma.widget.count().then(c => ({ name: 'Widget', count: c })),
            prisma.aIBot.count().then(c => ({ name: 'AIBot', count: c })),
            prisma.lead.count().then(c => ({ name: 'Lead', count: c })),
            prisma.campaign.count().then(c => ({ name: 'Campaign', count: c })),
            prisma.knowledgeEntry.count().then(c => ({ name: 'KnowledgeEntry', count: c })),
            prisma.macro.count().then(c => ({ name: 'Macro', count: c })),
            prisma.order.count().then(c => ({ name: 'Order', count: c })),
            prisma.product.count().then(c => ({ name: 'Product', count: c })),
            prisma.zaloAccount.count().then(c => ({ name: 'ZaloAccount', count: c })),
            prisma.zaloContact.count().then(c => ({ name: 'ZaloContact', count: c })),
            prisma.zaloMessage.count().then(c => ({ name: 'ZaloMessage', count: c })),
        ]);
        counts.sort((a, b) => b.count - a.count);
        res.json({ success: true, data: counts });
    }),
};

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}
