import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { workspaceService, widgetService, offlineMessageService } from './workspace.service';
import { presenceStore } from '../../infra/presence';

export const workspaceController = {
    create: asyncHandler(async (req: Request, res: Response) => {
        const { name, slug } = (req as any).validated.body;
        const ownerId = (req as any).user.id;
        const workspace = await workspaceService.createWorkspace(name, slug, ownerId);
        res.status(201).json({ success: true, data: workspace });
    }),

    getMyWorkspaces: asyncHandler(async (req: Request, res: Response) => {
        const userId = (req as any).user.id;
        const workspaces = await workspaceService.getMyWorkspaces(userId);
        res.status(200).json({ success: true, data: workspaces });
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const workspace = await workspaceService.getWorkspace(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: workspace });
    }),

    getDashboardStats: asyncHandler(async (req: Request, res: Response) => {
        const stats = await workspaceService.getDashboardStats(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: stats });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const workspace = await workspaceService.updateWorkspace(
            req.params.workspaceId as string,
            (req as any).validated.body
        );
        res.status(200).json({ success: true, data: workspace });
    }),

    addMember: asyncHandler(async (req: Request, res: Response) => {
        const { email, role } = (req as any).validated.body;
        const workspace = await workspaceService.addMember(req.params.workspaceId as string, email, role);
        res.status(200).json({ success: true, data: workspace });
    }),

    removeMember: asyncHandler(async (req: Request, res: Response) => {
        const workspace = await workspaceService.removeMember(
            req.params.workspaceId as string,
            req.params.userId as string
        );
        res.status(200).json({ success: true, data: workspace });
    }),

    delete: asyncHandler(async (req: Request, res: Response) => {
        await workspaceService.deleteWorkspace(req.params.workspaceId as string);
        res.status(200).json({ success: true, message: 'Workspace đã bị xóa' });
    }),

    getMembers: asyncHandler(async (req: Request, res: Response) => {
        const members = await workspaceService.getMembers(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: members });
    }),

    // ── Tag registry CRUD ──

    getTags: asyncHandler(async (req: Request, res: Response) => {
        const tags = await workspaceService.getTags(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: tags });
    }),

    addTag: asyncHandler(async (req: Request, res: Response) => {
        const { tag } = req.body;
        const tags = await workspaceService.addTag(req.params.workspaceId as string, tag);
        res.status(200).json({ success: true, data: tags });
    }),

    removeTag: asyncHandler(async (req: Request, res: Response) => {
        const { tag } = req.body;
        const tags = await workspaceService.removeTag(req.params.workspaceId as string, tag);
        res.status(200).json({ success: true, data: tags });
    }),

    updateTag: asyncHandler(async (req: Request, res: Response) => {
        const { oldTag, newTag } = req.body;
        const tags = await workspaceService.updateTag(req.params.workspaceId as string, oldTag, newTag);
        res.status(200).json({ success: true, data: tags });
    }),

    // GET /:workspaceId/presence — get online/away agents in workspace
    getPresence: asyncHandler(async (req: Request, res: Response) => {
        const agents = presenceStore.getOnlineAgents(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: { agents } });
    }),

    // GET /:workspaceId/presence/visitor/:visitorId — get visitor presence
    getVisitorPresence: asyncHandler(async (req: Request, res: Response) => {
        const status = presenceStore.getVisitorStatus(req.params.visitorId as string);
        res.status(200).json({ success: true, data: { status } });
    }),

    // GET /:workspaceId/agent-performance — per-agent stats
    getAgentPerformance: asyncHandler(async (req: Request, res: Response) => {
        const data = await workspaceService.getAgentPerformance(req.params.workspaceId as string);
        res.status(200).json({ success: true, data });
    }),
};

export const widgetController = {
    create: asyncHandler(async (req: Request, res: Response) => {
        const data = (req as any).validated.body;
        const widget = await widgetService.createWidget(req.params.workspaceId as string, data);
        res.status(201).json({ success: true, data: widget });
    }),

    getByWorkspace: asyncHandler(async (req: Request, res: Response) => {
        const widgets = await widgetService.getWidgetsByWorkspace(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: widgets });
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const widget = await widgetService.getWidget(req.params.widgetId as string);
        res.status(200).json({ success: true, data: widget });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const data = (req as any).validated.body;
        const widget = await widgetService.updateWidget(req.params.widgetId as string, data);
        res.status(200).json({ success: true, data: widget });
    }),

    delete: asyncHandler(async (req: Request, res: Response) => {
        await widgetService.deleteWidget(req.params.widgetId as string);
        res.status(200).json({ success: true, message: 'Widget đã bị xoá' });
    }),

    // Public: no auth
    getPublicConfig: asyncHandler(async (req: Request, res: Response) => {
        const config = await widgetService.getPublicConfig(req.params.widgetId as string);
        res.status(200).json({ success: true, data: config });
    }),

    // Public: domain check
    checkDomain: asyncHandler(async (req: Request, res: Response) => {
        const { origin } = req.query as { origin: string };
        const allowed = await widgetService.checkDomain(req.params.widgetId as string, origin || '');
        res.status(200).json({ success: true, data: { allowed } });
    }),
};

export const offlineMessageController = {
    // Public: visitor sends offline message (no auth)
    create: asyncHandler(async (req: Request, res: Response) => {
        const { name, email, message, visitorId } = req.body;
        const msg = await offlineMessageService.createOfflineMessage(
            req.params.widgetId as string,
            { name, email, message, visitorId }
        );
        res.status(201).json({ success: true, data: { id: msg._id } });
    }),

    // Authenticated: list offline messages for workspace
    getByWorkspace: asyncHandler(async (req: Request, res: Response) => {
        const { status, page, limit } = req.query as any;
        const result = await offlineMessageService.getOfflineMessages(
            req.params.workspaceId as string,
            { status, page: Number(page) || 1, limit: Number(limit) || 20 }
        );
        res.status(200).json({ success: true, data: result });
    }),

    // Authenticated: mark as read
    markAsRead: asyncHandler(async (req: Request, res: Response) => {
        const msg = await offlineMessageService.markAsRead(req.params.messageId as string);
        res.status(200).json({ success: true, data: msg });
    }),

    // Authenticated: mark as replied
    markAsReplied: asyncHandler(async (req: Request, res: Response) => {
        const msg = await offlineMessageService.markAsReplied(req.params.messageId as string);
        res.status(200).json({ success: true, data: msg });
    }),

    // Authenticated: count pending
    countPending: asyncHandler(async (req: Request, res: Response) => {
        const count = await offlineMessageService.countPending(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: { count } });
    }),
};
