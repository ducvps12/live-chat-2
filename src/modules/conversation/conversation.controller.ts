import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { conversationService } from './conversation.service';

export const conversationController = {
    // ── Public Widget Endpoints ──

    getByVisitor: asyncHandler(async (req: Request, res: Response) => {
        const conversations = await conversationService.getByVisitor(req.params.visitorId as string, req.params.widgetId as string);
        res.status(200).json({ success: true, data: conversations });
    }),

    findOrCreate: asyncHandler(async (req: Request, res: Response) => {
        const { widgetId, visitorId, visitorInfo, metadata, forceNew } = (req as any).validated.body;
        const result = await conversationService.findOrCreate(widgetId, visitorId, visitorInfo, metadata, forceNew);
        res.status(200).json({ success: true, data: result });
    }),

    getMessages: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = req.query as any;
        const result = await conversationService.getMessages(
            req.params.conversationId as string,
            { page: Number(page) || 1, limit: Number(limit) || 50 }
        );
        res.status(200).json({ success: true, data: result });
    }),

    // Reconnect sync: get messages since a timestamp
    syncMessages: asyncHandler(async (req: Request, res: Response) => {
        const { since } = req.query as any;
        if (!since) {
            res.status(400).json({ success: false, error: 'Missing since parameter' });
            return;
        }
        const messages = await conversationService.getMessagesSince(
            req.params.conversationId as string, since
        );
        res.status(200).json({ success: true, data: messages });
    }),

    sendMessage: asyncHandler(async (req: Request, res: Response) => {
        const { content, visitorId, type, attachments, clientMessageId, replyTo } = (req as any).validated.body;
        const msg = await conversationService.addMessage(
            req.params.conversationId as string,
            { type: 'visitor', id: visitorId, name: '' },
            content || '',
            type || 'text',
            attachments,
            clientMessageId,
            replyTo
        );
        res.status(201).json({ success: true, data: msg });
    }),

    updateTracking: asyncHandler(async (req: Request, res: Response) => {
        const { visitorId, pageUrl } = req.body;
        const convId = req.params.conversationId as string;

        // Update conversation metadata
        await conversationService.updateTracking(convId, visitorId, {
            pageUrl,
            lastTrackedAt: new Date().toISOString(),
        });

        // Also enrich visitor profile with latest page
        const conv = await conversationService.getOne(convId);
        await conversationService.enrichVisitor(visitorId, (conv.widgetId as any).toString(), {
            attributes: { lastPageUrl: pageUrl, lastPageAt: new Date().toISOString() },
        });

        res.status(200).json({ success: true });
    }),

    // ── Authenticated: agent dashboard ──

    getByWorkspace: asyncHandler(async (req: Request, res: Response) => {
        const { status, assignee, tags, channel, dateFrom, dateTo, sortBy, page, limit, domain } = req.query as any;
        const result = await conversationService.getByWorkspace(
            req.params.workspaceId as string,
            { 
                status, 
                assignee,
                tags,
                channel,
                dateFrom,
                dateTo,
                sortBy,
                page: Number(page) || 1, 
                limit: Number(limit) || 20,
                domain
            },
            { userId: (req as any).user.id, type: 'agent' }
        );
        res.status(200).json({ success: true, data: result });
    }),

    getDomainsByWorkspace: asyncHandler(async (req: Request, res: Response) => {
        const domains = await conversationService.getDomainsByWorkspace(req.params.workspaceId as string);
        res.status(200).json({ success: true, data: domains.filter(Boolean) });
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const conv = await conversationService.getOne(
            req.params.conversationId as string,
            { userId: (req as any).user.id, type: 'agent' }
        );
        res.status(200).json({ success: true, data: conv });
    }),

    getUnreadCount: asyncHandler(async (req: Request, res: Response) => {
        const result = await conversationService.getTotalUnreadCount(
            req.params.workspaceId as string,
            { userId: (req as any).user.id, type: 'agent' }
        );
        res.status(200).json({ success: true, data: result });
    }),

    getConversationMessages: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = req.query as any;
        const result = await conversationService.getMessages(
            req.params.conversationId as string,
            { page: Number(page) || 1, limit: Number(limit) || 50 }
        );
        res.status(200).json({ success: true, data: result });
    }),

    agentSendMessage: asyncHandler(async (req: Request, res: Response) => {
        const { content, type, attachments, clientMessageId, replyTo } = (req as any).validated.body;
        const userId = (req as any).user.id;
        const userName = (req as any).user.name || 'Agent';

        // ── Assignment lock: only assigned agent can send messages ──
        const conv = await conversationService.getOne(
            req.params.conversationId as string,
            { userId, type: 'agent' }
        );
        if (conv && conv.assignedTo) {
            const assignedId = typeof conv.assignedTo === 'object' ? (conv.assignedTo as any)._id?.toString() : conv.assignedTo?.toString();
            if (assignedId && assignedId !== userId) {
                throw new (require('../../middlewares/errorHandler').AppError)(
                    'Cuộc hội thoại đã được gán cho agent khác. Bạn không có quyền nhắn tin.',
                    403,
                    'FORBIDDEN'
                );
            }
        }

        const msg = await conversationService.addMessage(
            req.params.conversationId as string,
            { type: 'agent', id: userId, name: userName },
            content || '',
            type || 'text',
            attachments,
            clientMessageId,
            replyTo
        );

        // ── Zalo Integration: Push message to Zalo if applicable ──
        if (conv?.channel === 'zalo') {
            const zaloUserId = conv.metadata?.zaloUserId;
            if (zaloUserId) {
                try {
                    // Lazy load to avoid circular dependency if any
                    const { zaloService } = require('../zalo/zalo.service'); 
                    await zaloService.sendMessage(
                        (conv.workspaceId as any).toString(),
                        zaloUserId,
                        content || '',
                        type || 'text',
                        attachments?.[0]?.data || undefined 
                    );
                } catch (e) {
                    console.error('[ConversationController] Failed to send Zalo message:', e);
                }
            }
        }

        res.status(201).json({ success: true, data: msg });
    }),

    editMessage: asyncHandler(async (req: Request, res: Response) => {
        const agentId = (req as any).user.id;
        const msg = await conversationService.editMessage(
            req.params.conversationId as string,
            req.params.messageId as string,
            req.body.content,
            agentId
        );
        res.status(200).json({ success: true, data: msg });
    }),

    recallMessage: asyncHandler(async (req: Request, res: Response) => {
        const agentId = (req as any).user.id;
        const msg = await conversationService.recallMessage(
            req.params.conversationId as string,
            req.params.messageId as string,
            agentId
        );
        res.status(200).json({ success: true, data: msg });
    }),

    closeConversation: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const conv = await conversationService.closeConversation(req.params.conversationId as string, agentName);
        res.status(200).json({ success: true, data: conv });
    }),

    reopenConversation: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const conv = await conversationService.reopenConversation(req.params.conversationId as string, agentName);
        res.status(200).json({ success: true, data: conv });
    }),

    setPending: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const conv = await conversationService.setPendingConversation(req.params.conversationId as string, agentName);
        res.status(200).json({ success: true, data: conv });
    }),

    assignToMe: asyncHandler(async (req: Request, res: Response) => {
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Agent';
        const conv = await conversationService.assignConversation(
            req.params.conversationId as string,
            agentId,
            agentName,
            true // expectUnassigned: atomic CAS to prevent collision
        );
        res.status(200).json({ success: true, data: conv });
    }),

    unassign: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const conv = await conversationService.unassignConversation(
            req.params.conversationId as string,
            agentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    // Admin/manager assign to specific agent
    assignToAgent: asyncHandler(async (req: Request, res: Response) => {
        const { agentId, agentName } = req.body;
        if (!agentId || !agentName) {
            throw new (require('../../middlewares/errorHandler').AppError)(
                'agentId và agentName là bắt buộc',
                400,
                'VALIDATION_ERROR'
            );
        }
        const conv = await conversationService.assignConversation(
            req.params.conversationId as string,
            agentId,
            agentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    // Transfer conversation to another agent
    transfer: asyncHandler(async (req: Request, res: Response) => {
        const fromAgentName = (req as any).user.name || 'Agent';
        const { toAgentId, toAgentName } = req.body;
        if (!toAgentId || !toAgentName) {
            throw new (require('../../middlewares/errorHandler').AppError)(
                'toAgentId và toAgentName là bắt buộc',
                400,
                'VALIDATION_ERROR'
            );
        }
        const conv = await conversationService.transferConversation(
            req.params.conversationId as string,
            fromAgentName,
            toAgentId,
            toAgentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    markRead: asyncHandler(async (req: Request, res: Response) => {
        const requester = { userId: (req as any).user.id, type: 'agent' as const };
        await conversationService.markRead(req.params.conversationId as string, requester);
        res.status(200).json({ success: true });
    }),

    // ── Priority / SLA ──
    setPriority: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const { priority, slaDeadline } = req.body;
        const validPriorities = ['urgent', 'high', 'normal', 'low'];
        if (!priority || !validPriorities.includes(priority)) {
            throw new (require('../../middlewares/errorHandler').AppError)(
                'priority phải là urgent | high | normal | low',
                400,
                'VALIDATION_ERROR'
            );
        }
        const conv = await conversationService.setPriority(
            req.params.conversationId as string,
            priority,
            slaDeadline ? new Date(slaDeadline) : undefined,
            agentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    checkSLA: asyncHandler(async (_req: Request, res: Response) => {
        const result = await conversationService.checkSLABreaching();
        res.status(200).json({
            success: true,
            data: {
                approaching: result.approaching.length,
                breached: result.breached.length,
            },
        });
    }),

    getMessageContext: asyncHandler(async (req: Request, res: Response) => {
        const conversationId = req.params.conversationId as string;
        const workspaceId = req.params.workspaceId as string;
        const messageId = req.params.messageId as string;
        const limitParam = req.query.limit;
        const limit = Number(Array.isArray(limitParam) ? limitParam[0] : limitParam) || 30;
        
        // Ensure access control by relying on generic auth middleware in routes,
        // but it's safe to perform an additional check if needed.
        const data = await conversationService.getMessageContextPage(conversationId, messageId, limit);
        res.status(200).json({ success: true, data });
    }),

    getReceipts: asyncHandler(async (req: Request, res: Response) => {
        const conversationId = req.params.conversationId as string;
        const limitParam = req.query.limit;
        const limit = Number(Array.isArray(limitParam) ? limitParam[0] : limitParam) || 100;
        const data = await conversationService.getReceipts(conversationId, limit);
        res.status(200).json({ success: true, data });
    }),

    // ── Visitor profile (agent dashboard) ──

    getVisitors: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, search } = req.query as any;
        const result = await conversationService.getVisitors(
            req.params.workspaceId as string,
            { page: Number(page) || 1, limit: Number(limit) || 20, search }
        );
        res.status(200).json({ success: true, data: result });
    }),

    exportVisitors: asyncHandler(async (req: Request, res: Response) => {
        const result = await conversationService.getVisitors(
            req.params.workspaceId as string,
            { page: 1, limit: 10000, search: req.query.search as string }
        );

        // Build CSV
        const BOM = '\uFEFF'; // UTF-8 BOM for Excel
        const headers = ['Tên', 'Email', 'Số điện thoại', 'Lần đầu', 'Lần cuối', 'Số hội thoại', 'Kênh'];
        const rows = result.items.map((v: any) => [
            `"${(v.name || '').replace(/"/g, '""')}"`,
            `"${(v.email || '').replace(/"/g, '""')}"`,
            `"${(v.phone || '').replace(/"/g, '""')}"`,
            v.firstSeenAt ? new Date(v.firstSeenAt).toLocaleDateString('vi-VN') : '',
            v.lastSeenAt ? new Date(v.lastSeenAt).toLocaleDateString('vi-VN') : '',
            v.totalConversations || 0,
            'Widget',
        ].join(','));

        const csv = BOM + headers.join(',') + '\n' + rows.join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="visitors_${Date.now()}.csv"`);
        res.send(csv);
    }),

    enrichVisitor: asyncHandler(async (req: Request, res: Response) => {
        const { visitorId, widgetId, name, email, phone, attributes } = req.body;
        const visitor = await conversationService.enrichVisitor(
            visitorId, widgetId, { name, email, phone, attributes }
        );
        res.status(200).json({ success: true, data: visitor });
    }),

    getVisitor: asyncHandler(async (req: Request, res: Response) => {
        const visitor = await conversationService.getVisitorByWorkspace(
            req.params.workspaceId as string,
            req.params.visitorId as string
        );
        res.status(200).json({ success: true, data: visitor });
    }),

    updateVisitor: asyncHandler(async (req: Request, res: Response) => {
        const { name, email, phone, attributes } = req.body;
        const visitor = await conversationService.updateVisitorByWorkspace(
            req.params.workspaceId as string,
            req.params.visitorId as string,
            { name, email, phone, attributes }
        );
        res.status(200).json({ success: true, data: visitor });
    }),

    // ── Tags on conversation ──

    addTag: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const { tag } = req.body;
        const conv = await conversationService.addTagToConversation(
            req.params.conversationId as string,
            tag,
            agentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    removeConvTag: asyncHandler(async (req: Request, res: Response) => {
        const agentName = (req as any).user.name || 'Agent';
        const { tag } = req.body;
        const conv = await conversationService.removeTagFromConversation(
            req.params.conversationId as string,
            tag,
            agentName
        );
        res.status(200).json({ success: true, data: conv });
    }),

    // ── Internal notes ──

    addNote: asyncHandler(async (req: Request, res: Response) => {
        const sender = { id: (req as any).user.id, name: (req as any).user.name || 'Agent' };
        const { content } = req.body;
        const note = await conversationService.addInternalNote(
            req.params.conversationId as string,
            sender,
            content
        );
        res.status(201).json({ success: true, data: note });
    }),

    // ── Reset all messages (keep visitor profiles) ──

    resetMessages: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const result = await conversationService.resetWorkspaceMessages(workspaceId);
        res.status(200).json({
            success: true,
            message: `Đã xóa ${result.deletedMessages} tin nhắn, ${result.deletedZaloMessages} tin Zalo, reset ${result.resetConversations} cuộc hội thoại.`,
            data: result,
        });
    }),
};
