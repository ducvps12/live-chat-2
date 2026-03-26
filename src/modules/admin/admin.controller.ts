import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import os from 'os';
import axios from 'axios';

const AI_API_URL = process.env.AI_API_URL || 'http://163.61.111.226:8318/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'friend-key-alpha';

function getDb() {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    return db;
}

export const adminController = {
    /**
     * Get full system overview — counts, health, server info
     */
    overview: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();

        // Parallel collection counts
        const [
            workspaces, users, conversations, messages,
            visitors, widgets, aiBots, leads,
            campaigns, knowledge, macros, labels,
        ] = await Promise.all([
            db.collection('workspaces').countDocuments(),
            db.collection('users').countDocuments(),
            db.collection('conversations').countDocuments(),
            db.collection('messages').countDocuments(),
            db.collection('visitors').countDocuments(),
            db.collection('widgets').countDocuments(),
            db.collection('aibots').countDocuments(),
            db.collection('leads').countDocuments().catch(() => 0),
            db.collection('campaigns').countDocuments().catch(() => 0),
            db.collection('knowledgebases').countDocuments().catch(() => 0),
            db.collection('macros').countDocuments().catch(() => 0),
            db.collection('labels').countDocuments().catch(() => 0),
        ]);

        // Conversation stats
        const [openConvs, closedConvs, pendingConvs] = await Promise.all([
            db.collection('conversations').countDocuments({ status: 'open' }),
            db.collection('conversations').countDocuments({ status: 'closed' }),
            db.collection('conversations').countDocuments({ status: 'pending' }),
        ]);

        // Active bots
        const activeBots = await db.collection('aibots').countDocuments({ isActive: true });

        // Recent activity — last 24h
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [msgsToday, convsToday, visitorsToday] = await Promise.all([
            db.collection('messages').countDocuments({ createdAt: { $gte: oneDayAgo } }),
            db.collection('conversations').countDocuments({ createdAt: { $gte: oneDayAgo } }),
            db.collection('visitors').countDocuments({ createdAt: { $gte: oneDayAgo } }),
        ]);

        // Server info
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();

        // MongoDB info
        const dbStats = await db.stats();

        res.json({
            success: true,
            data: {
                collections: {
                    workspaces, users, conversations, messages,
                    visitors, widgets, aiBots, leads,
                    campaigns, knowledge, macros, labels,
                },
                conversationStats: {
                    open: openConvs,
                    closed: closedConvs,
                    pending: pendingConvs,
                    total: conversations,
                },
                botStats: {
                    total: aiBots,
                    active: activeBots,
                },
                recentActivity: {
                    messagesToday: msgsToday,
                    conversationsToday: convsToday,
                    visitorsToday,
                },
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
                database: {
                    name: db.databaseName,
                    collections: dbStats.collections,
                    dataSize: Math.round((dbStats.dataSize || 0) / 1024 / 1024),
                    storageSize: Math.round((dbStats.storageSize || 0) / 1024 / 1024),
                    indexes: dbStats.indexes,
                },
                ai: {
                    apiUrl: AI_API_URL,
                    model: process.env.AI_MODEL || 'gpt-5',
                },
            },
        });
    }),

    /**
     * List all workspaces with basic info
     */
    listWorkspaces: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();
        const workspaces = await db.collection('workspaces').find({}).sort({ createdAt: -1 }).toArray();

        // Enrich with counts
        const enriched = await Promise.all(workspaces.map(async (ws) => {
            const [convCount, memberCount, widgetCount] = await Promise.all([
                db.collection('conversations').countDocuments({ workspaceId: ws._id }),
                db.collection('users').countDocuments({ 'workspaces.workspaceId': ws._id }),
                db.collection('widgets').countDocuments({ workspaceId: ws._id }),
            ]);
            return { ...ws, _convCount: convCount, _memberCount: memberCount, _widgetCount: widgetCount };
        }));

        res.json({ success: true, data: enriched });
    }),

    /**
     * List all users
     */
    listUsers: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();
        const users = await db.collection('users')
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
        res.json({ success: true, data: users });
    }),

    /**
     * List all bots
     */
    listBots: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();
        const bots = await db.collection('aibots').find({}).sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: bots });
    }),

    /**
     * Toggle bot active status
     */
    toggleBot: asyncHandler(async (req: Request, res: Response) => {
        const db = getDb();
        const { botId } = req.params;
        const { isActive } = req.body;
        await db.collection('aibots').updateOne(
            { _id: new mongoose.Types.ObjectId(botId as string) },
            { $set: { isActive, isDraft: !isActive, updatedAt: new Date() } }
        );
        res.json({ success: true, message: isActive ? 'Bot activated' : 'Bot deactivated' });
    }),

    /**
     * Check AI API health
     */
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
                    status: 'online',
                    latency,
                    models: models.map((m: any) => ({ id: m.id, owned_by: m.owned_by })),
                    modelCount: models.length,
                },
            });
        } catch (err: any) {
            res.json({
                success: true,
                data: {
                    status: 'offline',
                    error: err?.response?.status || err.message,
                    latency: -1,
                    models: [],
                    modelCount: 0,
                },
            });
        }
    }),

    /**
     * Get recent messages (last 50 across all conversations)
     */
    recentMessages: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();
        const msgs = await db.collection('messages')
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        res.json({ success: true, data: msgs });
    }),

    /**
     * Get all collections and their counts
     */
    collections: asyncHandler(async (_req: Request, res: Response) => {
        const db = getDb();
        const colls = await db.listCollections().toArray();
        const counts = await Promise.all(
            colls.map(async (c) => ({
                name: c.name,
                count: await db.collection(c.name).countDocuments(),
            }))
        );
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
