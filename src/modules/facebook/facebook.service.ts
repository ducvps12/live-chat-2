import { fbPageRepo } from './repos/fb-page.repo';
import { conversationService } from '../conversation/conversation.service';
import mongoose from 'mongoose';

const FB_GRAPH_URL = 'https://graph.facebook.com/v19.0';
const FB_APP_ID = process.env.FB_APP_ID || '';
const FB_APP_SECRET = process.env.FB_APP_SECRET || '';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'nemark_fb_verify_2024';
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI || '';

class FacebookService {
    /**
     * Step 1: Generate OAuth URL for user to login with Facebook
     */
    getOAuthUrl(workspaceId: string): string {
        const redirectUri = FB_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3010'}/api/v1/facebook/callback`;
        const scopes = [
            'pages_messaging',
            'pages_manage_metadata',
            'pages_read_engagement',
            'pages_show_list',
        ].join(',');

        return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${workspaceId}&response_type=code`;
    }

    /**
     * Step 2: Exchange auth code for user access token
     */
    async exchangeCodeForToken(code: string): Promise<string> {
        const redirectUri = FB_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3010'}/api/v1/facebook/callback`;
        const url = `${FB_GRAPH_URL}/oauth/access_token?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FB_APP_SECRET}&code=${code}`;

        const res = await fetch(url);
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.message || 'Failed to exchange code');
        }
        return data.access_token;
    }

    /**
     * Step 2b: Exchange short-lived token for long-lived token
     */
    async getLongLivedToken(shortToken: string): Promise<string> {
        const url = `${FB_GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${shortToken}`;

        const res = await fetch(url);
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.message || 'Failed to get long-lived token');
        }
        return data.access_token;
    }

    /**
     * Step 3: Get list of pages the user manages
     */
    async getUserPages(userAccessToken: string): Promise<Array<{
        id: string;
        name: string;
        access_token: string;
        picture?: string;
    }>> {
        const url = `${FB_GRAPH_URL}/me/accounts?fields=id,name,access_token,picture&access_token=${userAccessToken}`;

        const res = await fetch(url);
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.message || 'Failed to fetch pages');
        }
        return (data.data || []).map((page: any) => ({
            id: page.id,
            name: page.name,
            access_token: page.access_token,
            picture: page.picture?.data?.url || '',
        }));
    }

    /**
     * Step 4: Connect a page to workspace
     */
    async connectPage(workspaceId: string, pageId: string, pageName: string, pageAvatar: string, pageAccessToken: string, userAccessToken?: string) {
        // Save to DB
        const page = await fbPageRepo.upsertPage(workspaceId, pageId, {
            pageName,
            pageAvatar,
            accessToken: pageAccessToken,
            userAccessToken,
            status: 'active',
        });

        // Subscribe to webhook
        try {
            await this.subscribeWebhook(pageId, pageAccessToken);
        } catch (err) {
            console.warn(`[FacebookService] Failed to subscribe webhook for page ${pageId}:`, err);
        }

        return page;
    }

    /**
     * Subscribe a page to receive webhook events
     */
    private async subscribeWebhook(pageId: string, pageAccessToken: string) {
        const url = `${FB_GRAPH_URL}/${pageId}/subscribed_apps`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscribed_fields: ['messages', 'messaging_postbacks'],
                access_token: pageAccessToken,
            }),
        });
        const data = await res.json() as any;
        if (data.error) {
            console.error(`[FacebookService] Webhook subscribe error:`, data.error);
        } else {
            console.log(`[FacebookService] ✅ Page ${pageId} subscribed to webhook`);
        }
    }

    /**
     * Get all pages connected to a workspace
     */
    async getPages(workspaceId: string) {
        const pages = await fbPageRepo.findByWorkspaceId(workspaceId);
        return pages.map(p => ({
            id: (p._id as unknown as string).toString(),
            pageId: p.pageId,
            pageName: p.pageName,
            pageAvatar: p.pageAvatar,
            status: p.status,
            createdAt: p.createdAt,
        }));
    }

    /**
     * Disconnect a page
     */
    async disconnectPage(workspaceId: string, pageDbId: string) {
        const page = await fbPageRepo.findById(pageDbId);
        if (page && page.workspaceId.toString() === workspaceId) {
            // Unsubscribe webhook
            try {
                const url = `${FB_GRAPH_URL}/${page.pageId}/subscribed_apps?access_token=${page.accessToken}`;
                await fetch(url, { method: 'DELETE' });
            } catch { /* silent */ }
            await fbPageRepo.delete(pageDbId);
        }
        return { success: true };
    }

    /**
     * Handle incoming webhook from Facebook
     * This is called when a message is sent to one of our connected pages
     */
    async handleWebhook(body: any) {
        if (body.object !== 'page') return;

        for (const entry of body.entry || []) {
            const pageId = entry.id;

            // Find which workspace owns this page
            const page = await fbPageRepo.findByPageId(pageId);
            if (!page || page.status !== 'active') {
                console.warn(`[FacebookService] Received webhook for unknown/inactive page ${pageId}`);
                continue;
            }

            const workspaceId = page.workspaceId.toString();

            for (const event of entry.messaging || []) {
                const senderId = event.sender?.id;
                const recipientId = event.recipient?.id;

                // Ignore messages sent by the page itself
                if (senderId === pageId) continue;

                if (event.message) {
                    await this.handleIncomingMessage(workspaceId, page, senderId, event.message, event.timestamp);
                }
            }
        }
    }

    /**
     * Process an incoming Facebook message
     */
    private async handleIncomingMessage(
        workspaceId: string,
        page: any,
        senderId: string,
        fbMessage: any,
        timestamp: number,
    ) {
        try {
            // Get sender profile
            let senderName = `FB User ${senderId.slice(-4)}`;
            let senderAvatar = '';
            try {
                const profileUrl = `${FB_GRAPH_URL}/${senderId}?fields=first_name,last_name,profile_pic&access_token=${page.accessToken}`;
                const profileRes = await fetch(profileUrl);
                const profile = await profileRes.json() as any;
                if (profile.first_name) {
                    senderName = `${profile.first_name} ${profile.last_name || ''}`.trim();
                }
                if (profile.profile_pic) {
                    senderAvatar = profile.profile_pic;
                }
            } catch { /* silent — profile may not be accessible */ }

            const content = fbMessage.text || '';
            let msgType: 'text' | 'image' | 'video' | 'file' = 'text';
            let attachments: any[] = [];

            // Process attachments
            if (fbMessage.attachments?.data?.length > 0 || fbMessage.attachments?.length > 0) {
                const fbAttachments = fbMessage.attachments.data || fbMessage.attachments || [];
                for (const att of fbAttachments) {
                    if (att.type === 'image') {
                        msgType = 'image';
                        attachments.push({
                            url: att.payload?.url || att.image_data?.url || '',
                            name: 'Facebook Image',
                            size: 0,
                            mimeType: 'image/jpeg',
                        });
                    } else if (att.type === 'video') {
                        msgType = 'video';
                        attachments.push({
                            url: att.payload?.url || '',
                            name: 'Facebook Video',
                            size: 0,
                            mimeType: 'video/mp4',
                        });
                    } else if (att.type === 'file') {
                        msgType = 'file';
                        attachments.push({
                            url: att.payload?.url || '',
                            name: att.payload?.name || 'File',
                            size: att.payload?.size || 0,
                            mimeType: att.payload?.mime_type || 'application/octet-stream',
                        });
                    } else if (att.type === 'sticker') {
                        msgType = 'image';
                        attachments.push({
                            url: att.payload?.url || '',
                            name: 'Facebook Sticker',
                            size: 0,
                            mimeType: 'image/png',
                        });
                    }
                }
            }

            console.log(`[FacebookService] Msg from ${senderName} via page ${page.pageName}: "${content?.substring(0, 50)}"`);

            // Route to conversation system
            await conversationService.handleIncomingFacebookMessage(
                workspaceId,
                senderId,
                senderName,
                senderAvatar,
                content || (attachments.length > 0 ? '[Đính kèm]' : ''),
                msgType,
                attachments,
                fbMessage.mid || `fb_${Date.now()}`,
                page.pageId,
                page.pageName,
            );
        } catch (err) {
            console.error(`[FacebookService] Error handling incoming message:`, err);
        }
    }

    /**
     * Send a message reply through a Facebook page
     */
    async sendMessage(workspaceId: string, recipientId: string, text: string, pageId?: string) {
        // Find a connected page
        let page;
        if (pageId) {
            page = await fbPageRepo.findByPageId(pageId);
        }
        if (!page) {
            const pages = await fbPageRepo.findByWorkspaceId(workspaceId);
            page = pages.find(p => p.status === 'active');
        }
        if (!page) {
            throw new Error('Không có Facebook Page nào đang kết nối');
        }

        const url = `${FB_GRAPH_URL}/${page.pageId}/messages`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text },
                access_token: page.accessToken,
            }),
        });

        const data = await res.json() as any;
        if (data.error) {
            console.error(`[FacebookService] Send error:`, data.error);
            throw new Error(data.error.message || 'Lỗi gửi tin nhắn Facebook');
        }

        return { success: true, messageId: data.message_id };
    }

    /**
     * Verify webhook (called by Facebook during setup)
     */
    verifyWebhook(mode: string, token: string, challenge: string): string | null {
        if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
            console.log('[FacebookService] ✅ Webhook verified');
            return challenge;
        }
        return null;
    }
}

export const facebookService = new FacebookService();
