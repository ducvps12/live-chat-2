import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { zaloService } from './zalo.service';

export const zaloController = {
    /**
     * Bị gọi từ giao diện Dashboard để lấy mã QR link với Zalo
     */
    generateQR: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const qrUrl = await zaloService.generateQRLogin(workspaceId);

        res.status(200).json({
            success: true,
            data: { qrUrl }
        });
    }),

    /**
     * Kiểm tra trạng thái hiện tại
     */
    getStatus: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const status = await zaloService.getStatus(workspaceId);

        res.status(200).json({
            success: true,
            data: status
        });
    }),

    /**
     * Hủy kết nối (1 account hoặc tất cả)
     */
    disconnect: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.body?.accountId || req.query?.accountId as string;
        await zaloService.disconnect(workspaceId, accountId);

        res.status(200).json({
            success: true,
            message: accountId ? 'Đã huỷ kết nối tài khoản Zalo' : 'Đã huỷ kết nối toàn bộ Zalo'
        });
    }),

    /**
     * Gửi tin nhắn qua Zalo Client
     */
    sendMessage: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { threadId, text, type, attachmentUrl } = req.body;

        const result = await zaloService.sendMessage(workspaceId, threadId, text, type, attachmentUrl);

        res.status(200).json({
            success: true,
            data: result
        });
    }),

    // ══════════════════════════════════════
    // HISTORY & CONTACTS
    // ══════════════════════════════════════

    /**
     * Lấy lịch sử tin nhắn Zalo theo thread
     * 
     * Query params:
     *   threadId (required) — Zalo thread ID
     *   before   — ISO timestamp cursor (lấy tin nhắn cũ hơn)
     *   limit    — số lượng (default 50, max 100)
     *   search   — tìm kiếm full-text trong thread
     *   senderId — lọc theo người gửi
     *   msgType  — lọc theo loại (text, image, ...)
     */
    getHistory: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { threadId, before, after, limit, search, senderId, msgType } = req.query;

        const result = await zaloService.getHistory({
            workspaceId,
            threadId: threadId as string,
            before: before ? new Date(before as string) : undefined,
            after: after ? new Date(after as string) : undefined,
            limit: limit ? parseInt(limit as string) : 50,
            search: search as string,
            senderId: senderId as string,
            msgType: msgType as string,
        });

        res.status(200).json({
            success: true,
            data: result
        });
    }),

    /**
     * Tìm kiếm tin nhắn Zalo (full-text trên toàn workspace hoặc theo thread)
     * 
     * Query params:
     *   q        (required) — từ khóa
     *   threadId — giới hạn trong 1 thread
     */
    searchMessages: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const keyword = req.query.q as string;
        const threadId = req.query.threadId as string;

        if (!keyword || !keyword.trim()) {
            res.status(400).json({ success: false, error: 'Thiếu từ khóa tìm kiếm (q)' });
            return;
        }

        const results = await zaloService.searchMessages(workspaceId, keyword, threadId);

        res.status(200).json({
            success: true,
            data: { items: results, total: results.length }
        });
    }),

    /**
     * Danh sách khách hàng Zalo
     * 
     * Query params:
     *   search  — tìm theo tên hoặc SĐT
     *   source  — friend | stranger | group
     *   page    — trang (default 1)
     *   limit   — số lượng (default 20, max 100)
     *   sortBy  — lastMessageAt | displayName | totalMessages
     *   sortOrder — asc | desc
     */
    getContacts: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { search, source, page, limit, sortBy, sortOrder } = req.query;

        const result = await zaloService.getContacts({
            workspaceId,
            search: search as string,
            source: source as any,
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 20,
            sortBy: sortBy as any,
            sortOrder: sortOrder as any,
        });

        res.status(200).json({
            success: true,
            data: result
        });
    }),

    /**
     * Xem chi tiết 1 contact
     */
    getContact: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const zaloUserId = req.params.zaloUserId as string;

        const contact = await zaloService.getContact(workspaceId, zaloUserId);

        if (!contact) {
            res.status(404).json({ success: false, error: 'Contact không tồn tại' });
            return;
        }

        res.status(200).json({
            success: true,
            data: contact
        });
    }),

    /**
     * Cập nhật thông tin contact (VD: thêm SĐT thủ công)
     */
    updateContact: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const zaloUserId = req.params.zaloUserId as string;
        const { displayName, phoneNumber, metadata } = req.body;

        const updated = await zaloService.updateContact(workspaceId, zaloUserId, {
            displayName,
            phoneNumber,
            metadata,
        });

        if (!updated) {
            res.status(404).json({ success: false, error: 'Contact không tồn tại' });
            return;
        }

        res.status(200).json({
            success: true,
            data: updated
        });
    }),

    /**
     * Export CSV danh sách contacts Zalo
     */
    exportContacts: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const result = await zaloService.getContacts({
            workspaceId,
            page: 1,
            limit: 10000,
        });

        const BOM = '\uFEFF';
        const headers = ['Tên', 'Zalo ID', 'Số điện thoại', 'Nguồn', 'Tổng tin nhắn', 'Tin nhắn cuối', 'Liên hệ đầu tiên', 'Kênh'];
        const rows = result.items.map((c: any) => [
            `"${(c.displayName || '').replace(/"/g, '""')}"`,
            c.zaloUserId || '',
            `"${(c.phoneNumber || '').replace(/"/g, '""')}"`,
            c.source || '',
            c.totalMessages || 0,
            c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString('vi-VN') : '',
            c.firstContactAt ? new Date(c.firstContactAt).toLocaleDateString('vi-VN') : '',
            'Zalo',
        ].join(','));

        const csv = BOM + headers.join(',') + '\n' + rows.join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="zalo_contacts_${Date.now()}.csv"`);
        res.send(csv);
    }),

    /**
     * Tổng quan tin nhắn mới nhất mỗi thread (cho sidebar hội thoại)
     */
    getConversationSummaries: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const summaries = await zaloService.getConversationSummaries(workspaceId);

        res.status(200).json({
            success: true,
            data: summaries
        });
    }),

    // ══════════════════════════════════════
    // HISTORICAL SYNC
    // ══════════════════════════════════════

    /**
     * Bắt đầu đồng bộ toàn bộ lịch sử Zalo
     * POST /api/v1/workspaces/:workspaceId/zalo/sync
     */
    startSync: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const result = await zaloService.syncAllHistory(workspaceId);

        res.status(200).json({
            success: true,
            data: result,
            message: 'Đã bắt đầu đồng bộ lịch sử. Dùng GET /sync/status để theo dõi tiến trình.'
        });
    }),

    /**
     * Lấy trạng thái sync hiện tại
     * GET /api/v1/workspaces/:workspaceId/zalo/sync/status
     */
    getSyncStatus: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const status = zaloService.getSyncStatus(workspaceId);

        if (!status) {
            res.status(200).json({
                success: true,
                data: { status: 'idle', message: 'Chưa có tiến trình đồng bộ nào.' }
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: status
        });
    }),
};
