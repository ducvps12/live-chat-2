import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { facebookService } from './facebook.service';

export const facebookController = {
    /**
     * Generate Facebook OAuth URL for the user to authorize
     */
    getOAuthUrl: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const url = facebookService.getOAuthUrl(workspaceId);
        res.status(200).json({ success: true, data: { url } });
    }),

    /**
     * OAuth callback — exchange code, get pages, save
     */
    handleCallback: asyncHandler(async (req: Request, res: Response) => {
        const code = req.query.code as string;
        const workspaceId = req.query.state as string;

        if (!code || !workspaceId) {
            res.status(400).json({ success: false, error: 'Missing code or state' });
            return;
        }

        try {
            // Exchange code for token
            const shortToken = await facebookService.exchangeCodeForToken(code);
            const longToken = await facebookService.getLongLivedToken(shortToken);

            // Get user's pages
            const pages = await facebookService.getUserPages(longToken);

            // Auto-connect all pages
            const connectedPages: any[] = [];
            for (const page of pages) {
                const saved = await facebookService.connectPage(
                    workspaceId,
                    page.id,
                    page.name,
                    page.picture || '',
                    page.access_token,
                    longToken,
                );
                connectedPages.push(saved);
            }

            // Auto-sync conversations in background (fire-and-forget)
            for (const saved of connectedPages) {
                const pageDbId = (saved._id as any).toString();
                facebookService.syncPageConversations(workspaceId, pageDbId).catch(err => {
                    console.warn(`[FacebookController] Background sync error for page ${pageDbId}:`, err);
                });
            }

            // Redirect back to settings page
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${baseUrl}/workspace/${workspaceId}/settings?fb_connected=${pages.length}`);
        } catch (err: any) {
            console.error('[FacebookController] OAuth callback error:', err);
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${baseUrl}/workspace/${workspaceId}/settings?fb_error=${encodeURIComponent(err.message)}`);
        }
    }),

    /**
     * Webhook verification (GET) — called by Facebook during setup
     */
    verifyWebhook: (req: Request, res: Response) => {
        const mode = req.query['hub.mode'] as string;
        const token = req.query['hub.verify_token'] as string;
        const challenge = req.query['hub.challenge'] as string;

        const result = facebookService.verifyWebhook(mode, token, challenge);
        if (result) {
            res.status(200).send(result);
        } else {
            res.sendStatus(403);
        }
    },

    /**
     * Webhook handler (POST) — receives incoming messages
     */
    handleWebhook: asyncHandler(async (req: Request, res: Response) => {
        // Facebook expects 200 OK immediately
        res.sendStatus(200);

        // Process async
        try {
            await facebookService.handleWebhook(req.body);
        } catch (err) {
            console.error('[FacebookController] Webhook processing error:', err);
        }
    }),

    /**
     * Get connected pages for a workspace
     */
    getPages: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const pages = await facebookService.getPages(workspaceId);

        res.status(200).json({
            success: true,
            data: { pages, total: pages.length },
        });
    }),

    /**
     * Connect a specific page manually  
     */
    connectPage: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { pageId, pageName, pageAvatar, accessToken } = req.body;

        const page = await facebookService.connectPage(workspaceId, pageId, pageName, pageAvatar || '', accessToken);

        res.status(201).json({
            success: true,
            data: page,
        });
    }),

    /**
     * Disconnect a page
     */
    disconnectPage: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const pageDbId = req.params.pageDbId as string;

        await facebookService.disconnectPage(workspaceId, pageDbId);

        res.status(200).json({
            success: true,
            message: 'Đã ngắt kết nối Facebook Page',
        });
    }),

    /**
     * Send message via Facebook Page
     */
    sendMessage: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { recipientId, text, pageId } = req.body;

        const result = await facebookService.sendMessage(workspaceId, recipientId, text, pageId);

        res.status(200).json({
            success: true,
            data: result,
        });
    }),

    /**
     * Sync historical messages from a connected Facebook Page
     */
    syncPageMessages: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const pageDbId = req.params.pageDbId as string;

        const result = await facebookService.syncPageConversations(workspaceId, pageDbId);
        res.status(200).json({
            success: true,
            data: result,
            message: `Đồng bộ hoàn tất: ${result.synced} tin nhắn, ${result.skipped} bỏ qua`,
        });
    }),
};
