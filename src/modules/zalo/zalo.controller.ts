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

    /**
     * Broadcast/forward messages to multiple Zalo friends
     * Body: { messages: string[], recipientIds: string[], delayMs?: number }
     */
    broadcast: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { messages, recipientIds, delayMs } = req.body;

        if (!messages?.length || !recipientIds?.length) {
            res.status(400).json({ success: false, error: { message: 'Cần chọn ít nhất 1 tin nhắn và 1 người nhận' } });
            return;
        }
        if (messages.length > 10) {
            res.status(400).json({ success: false, error: { message: 'Tối đa 10 tin nhắn mỗi lần chuyển tiếp' } });
            return;
        }

        // Auto-batch: split into chunks of 50, send with delay between batches
        const BATCH_SIZE = 50;
        const BATCH_COOLDOWN = 30_000; // 30s between batches
        const allResults: Array<{ threadId: string; success: boolean; error?: string }> = [];
        let totalSuccess = 0;
        let totalFailed = 0;

        for (let batchStart = 0; batchStart < recipientIds.length; batchStart += BATCH_SIZE) {
            const batch = recipientIds.slice(batchStart, batchStart + BATCH_SIZE);

            // Cooldown between batches (not before first batch)
            if (batchStart > 0) {
                console.log(`[Broadcast] Cooling down ${BATCH_COOLDOWN / 1000}s before batch ${Math.floor(batchStart / BATCH_SIZE) + 1}...`);
                await new Promise(resolve => setTimeout(resolve, BATCH_COOLDOWN));
            }

            const result = await zaloService.broadcastMessages(workspaceId, messages, batch, {
                delayMs: Math.max(delayMs || 3000, 2000),
            });

            allResults.push(...result.results);
            totalSuccess += result.successCount;
            totalFailed += result.failedCount;
        }

        res.status(200).json({
            success: true,
            data: {
                results: allResults,
                successCount: totalSuccess,
                failedCount: totalFailed,
                total: recipientIds.length,
                batches: Math.ceil(recipientIds.length / BATCH_SIZE),
            },
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

    /**
     * Get Zalo friends list (live from connected session)
     */
    getFriends: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { search, page, limit } = req.query as any;
        const result = await zaloService.getFriends(workspaceId, {
            search,
            page: Number(page) || 1,
            limit: Number(limit) || 50,
        });
        res.status(200).json({ success: true, data: result });
    }),

    /**
     * Manually trigger avatar backfill for all Zalo conversations
     */
    backfillAvatars: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { zaloAccountRepo } = await import('./repos/zalo-account.repo');
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const { isZaloSessionConnected } = await import('../../infra/zaloService');
        const connected = accounts.find((a: any) => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            res.status(400).json({ success: false, error: { message: 'Không có tài khoản Zalo nào đang kết nối' } });
            return;
        }
        const accountId = (connected._id as unknown as string).toString();
        await zaloService.backfillAvatars(workspaceId, accountId);
        res.status(200).json({ success: true, message: 'Đã cập nhật avatar cho các cuộc hội thoại' });
    }),

    // ══════════════════════════════════════
    // GROUPS & MEMBERS
    // ══════════════════════════════════════

    /**
     * Get all Zalo groups (live from connected session)
     * GET /zalo/groups
     */
    getGroups: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const result = await zaloService.getGroups(workspaceId);
        res.status(200).json({ success: true, data: result });
    }),

    /**
     * Get members of a specific Zalo group
     * GET /zalo/groups/:groupId/members
     */
    getGroupMembers: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const groupId = req.params.groupId as string;
        const result = await zaloService.getGroupMembers(workspaceId, groupId);
        res.status(200).json({ success: true, data: result });
    }),

    /**
     * Kick a member from a Zalo group
     * DELETE /zalo/groups/:groupId/members/:userId
     */
    kickMember: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const groupId = req.params.groupId as string;
        const userId = req.params.userId as string;
        const result = await zaloService.kickGroupMember(workspaceId, groupId, userId);
        res.status(200).json({ success: true, data: result, message: `Đã xóa thành viên ${userId} khỏi nhóm` });
    }),

    /**
     * Bulk sync ALL group members → Leads
     * POST /zalo/groups/sync-all-to-leads
     */
    bulkSyncGroupsToLeads: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const result = await zaloService.bulkSyncAllGroupsToLeads(workspaceId);
        res.status(200).json({
            success: true,
            data: result,
            message: `Đã đồng bộ ${result.totalCreated} lead mới từ ${result.totalGroups} nhóm (${result.totalMembers} thành viên)`,
        });
    }),

    // ══════════════════════════════════════
    // AUTO FRIEND REQUEST
    // ══════════════════════════════════════

    /**
     * Auto-friend all members in a Zalo group
     * POST /zalo/groups/:groupId/auto-friend
     * Body: { message?: string, delayMs?: number, selectedUserIds?: string[] }
     */
    autoFriendGroup: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const groupId = req.params.groupId as string;
        const { message, delayMs, selectedUserIds } = req.body;

        const result = await zaloService.autoFriendGroupMembers(
            workspaceId, groupId, message, { delayMs, selectedUserIds }
        );

        res.status(200).json({
            success: true,
            data: result,
            message: 'Đã bắt đầu gửi lời mời kết bạn. Dùng GET /auto-friend/status để theo dõi.',
        });
    }),

    /**
     * Get auto-friend job status
     * GET /zalo/auto-friend/status?groupId=...
     */
    getAutoFriendStatus: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const groupId = req.query.groupId as string;
        const status = zaloService.getAutoFriendStatus(workspaceId, groupId);

        if (!status) {
            res.status(200).json({
                success: true,
                data: { status: 'idle', message: 'Chưa có tiến trình kết bạn nào.' },
            });
            return;
        }

        res.status(200).json({ success: true, data: status });
    }),

    // ══════════════════════════════════════
    // BEHAVIOR ANALYSIS
    // ══════════════════════════════════════

    /**
     * Analyze behavior of a single member
     * GET /zalo/analyze/:userId
     */
    analyzeMember: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = req.params.userId as string;
        const analysis = await zaloService.analyzeMemberBehavior(workspaceId, userId);
        res.status(200).json({ success: true, data: analysis });
    }),

    /**
     * Batch analyze behavior of multiple members
     * POST /zalo/analyze/batch
     * Body: { userIds: string[] }
     */
    batchAnalyzeMembers: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { userIds } = req.body;

        if (!userIds?.length) {
            res.status(400).json({ success: false, error: { message: 'Cần danh sách userIds' } });
            return;
        }

        const results = await zaloService.batchAnalyzeMembers(workspaceId, userIds);
        res.status(200).json({ success: true, data: { items: results, total: results.length } });
    }),
};

