import { conversationRepo } from './repos/conversation.repo';
import { messageRepo } from './repos/message.repo';
import { visitorRepo } from './repos/visitor.repo';
import { widgetRepo } from '../workspace/repos/widget.repo';
import { AppError } from '../../middlewares/errorHandler';
import { security } from '../../infra/security';
import { sanitizeMessage, sanitizeFilename } from '../../infra/sanitize';
import { emitToConversation, emitToWorkspace, emitToUser } from '../../infra/socket';

export const conversationService = {
    /**
     * Find existing open conversation for visitor, or create a new one.
     * Also upserts visitor profile.
     */
    async findOrCreate(widgetId: string, visitorId: string, visitorInfo: Record<string, any> = {}, metadata: Record<string, any> = {}, forceNew: boolean = false) {
        const widget = await widgetRepo.findById(widgetId);
        if (!widget || !widget.isActive) throw new AppError('Widget không tồn tại', 404, 'NOT_FOUND');

        // Upsert visitor profile
        const { visitor } = await visitorRepo.findOrCreate(
            visitorId,
            widgetId,
            (widget.workspaceId as any).toString(),
            visitorInfo
        );

        // Try to find existing conversation (any status) unless forceNew is true
        // This prevents creating duplicate conversations when a closed conversation gets a new session
        let conversation = forceNew ? null : await conversationRepo.findLatestByVisitor(visitorId, widgetId);
        let isNew = false;

        if (!conversation) {
            conversation = await conversationRepo.create({
                workspaceId: widget.workspaceId,
                widgetId: widget._id as any,
                visitorId,
                visitorInfo,
                status: 'open',
                lastMessageAt: new Date(),
                metadata,
            });
            isNew = true;
            await visitorRepo.incrementConversations(visitorId, widgetId);
        } else if (conversation.status === 'closed' || conversation.status === 'resolved') {
            // Reopen existing closed conversation instead of creating a duplicate
            await conversationRepo.updateStatus((conversation._id as any).toString(), 'open');
            conversation.status = 'open';
        }

        const msgResult = await messageRepo.findByConversation(conversation._id.toString(), { limit: 30, excludeInternal: true });
        const messages = msgResult.items;

        // Generate visitor token for socket auth
        const visitorToken = security.generateVisitorToken(visitorId, widgetId);

        // Emit workspace event for new conversations
        if (isNew) {
            try {
                emitToWorkspace((widget.workspaceId as any).toString(), 'conversation:new', {
                    conversation, visitor, visitorInfo,
                });
            } catch { /* socket may not be initialized yet */ }
        }

        return { conversation, messages, totalMessages: msgResult.total, visitor, visitorToken, isNew };
    },

    /**
     * Handle incoming messages from Zalo. 
     * Creates a visitor and conversation if they don't exist.
     */
    async handleIncomingZaloMessage(
        workspaceId: string, 
        zaloUserId: string, 
        zaloUserName: string, 
        zaloAvatar: string, 
        content: string, 
        msgType: 'text' | 'image' | 'video' | 'file' = 'text',
        attachments: any[] = [],
        clientMessageId?: string,
        groupSenderName?: string, // For group messages: the individual sender's name
    ) {
        // Find a widget to associate the visitor with (we use the first active widget, or auto-create one for Zalo)
        let widgetList = await widgetRepo.findByWorkspace(workspaceId);
        let targetWidget;
        if (!widgetList || widgetList.length === 0) {
            // Auto-create a Zalo widget for this workspace
            console.log(`[ConvService] Auto-creating Zalo widget for workspace ${workspaceId}`);
            targetWidget = await widgetRepo.create({
                workspaceId: workspaceId as any,
                name: 'Zalo',
                isActive: true,
                config: {
                    primaryColor: '#0068ff',
                    greeting: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
                    placeholder: 'Nhập tin nhắn...',
                    position: 'bottom-right',
                    language: 'vi',
                    showBranding: false,
                    offlineMessage: 'Hiện tại không có agent trực tuyến.',
                    preChatForm: {
                        enabled: false,
                        title: '',
                        fields: [],
                    },
                },
                domainRules: { mode: 'allowlist', domains: [] },
            } as any);
        } else {
            targetWidget = widgetList[0];
        }
        const widgetId = (targetWidget._id as any).toString();
        const visitorId = `zalo_${zaloUserId}`;

        // Upsert visitor profile
        const { visitor } = await visitorRepo.findOrCreate(
            visitorId,
            widgetId,
            workspaceId,
            { name: zaloUserName, avatar: zaloAvatar, attributes: { channel: 'zalo', zaloUserId } }
        );

        // Find the LATEST conversation for this Zalo visitor (regardless of status)
        // This prevents creating duplicate conversations when a closed conversation gets a new message
        let conversation = await conversationRepo.findLatestByVisitor(visitorId, widgetId);
        let isNew = false;

        if (!conversation) {
            // No conversation exists at all — create new
            conversation = await conversationRepo.create({
                workspaceId: workspaceId as any,
                widgetId: targetWidget._id as any,
                visitorId,
                visitorInfo: { name: zaloUserName, avatar: zaloAvatar },
                channel: 'zalo',
                status: 'open',
                lastMessageAt: new Date(),
                metadata: { zaloUserId, ...(groupSenderName ? { threadType: 'group' } : {}) },
            });
            isNew = true;
            await visitorRepo.incrementConversations(visitorId, widgetId);

            try {
                emitToWorkspace(workspaceId, 'conversation:new', {
                    conversation, visitor, visitorInfo: { name: zaloUserName, avatar: zaloAvatar },
                });
            } catch { /* socket may not be initialized yet */ }
        } else if (conversation.status === 'closed' || conversation.status === 'resolved') {
            // Reopen the existing conversation instead of creating a duplicate
            await conversationRepo.updateStatus((conversation._id as any).toString(), 'open');
            conversation.status = 'open';
            
            try {
                emitToWorkspace(workspaceId, 'conversation:reopened', {
                    conversationId: (conversation._id as any).toString(),
                });
            } catch { /* socket may not be initialized */ }
        }

        // Update visitorInfo avatar/name if we have them now (always overwrite to keep fresh)
        if (conversation && !isNew && zaloAvatar) {
            const currentAvatar = conversation.visitorInfo?.avatar || '';
            const currentName = conversation.visitorInfo?.name || '';
            const needsUpdate = (zaloAvatar && zaloAvatar !== currentAvatar)
                || (zaloUserName && zaloUserName !== currentName);
            if (needsUpdate) {
                const updateFields: Record<string, any> = {};
                if (zaloAvatar) {
                    updateFields['visitorInfo.avatar'] = zaloAvatar;
                }
                if (zaloUserName && zaloUserName !== currentName) {
                    updateFields['visitorInfo.name'] = zaloUserName;
                }
                try {
                    const ConvModel = (await import('./repos/conversation.model')).ConversationModel;
                    await ConvModel.updateOne({ _id: conversation._id }, { $set: updateFields });
                    // Also update in-memory object
                    if (!conversation.visitorInfo) (conversation as any).visitorInfo = {};
                    if (zaloAvatar) (conversation.visitorInfo as any).avatar = zaloAvatar;
                    if (zaloUserName) conversation.visitorInfo.name = zaloUserName;
                } catch { /* silent */ }
            }
        }

        // Add message to conversation
        // For group messages: use individual sender name instead of group name
        const messageSenderName = groupSenderName || zaloUserName;
        return this.addMessage(
            (conversation._id as any).toString(),
            { type: 'visitor', id: visitorId, name: messageSenderName },
            content,
            msgType as any,
            attachments,
            clientMessageId
        );
    },

    /**
     * Handle self-sent Zalo messages (sent from Zalo app) — route as agent message for 2-way sync
     */
    async handleSelfZaloMessage(
        workspaceId: string,
        zaloThreadId: string,
        conversationName: string,
        zaloAvatar: string,
        content: string,
        msgType: 'text' | 'image' | 'video' | 'file' = 'text',
        attachments: any[] = [],
        clientMessageId?: string,
    ) {
        // Find the existing conversation for this thread — don't create new one for self-messages
        const visitorId = `zalo_${zaloThreadId}`;
        const widgetList = await widgetRepo.findByWorkspace(workspaceId);
        if (!widgetList || widgetList.length === 0) return; // no widget = no conversation possible

        const widgetId = (widgetList[0]._id as any).toString();
        const conversation = await conversationRepo.findLatestByVisitor(visitorId, widgetId);
        if (!conversation) {
            console.log(`[ConvService] No existing conversation for self-msg thread ${zaloThreadId}, skipping`);
            return;
        }

        // Reopen if closed so the message can be added
        if (conversation.status === 'closed') {
            await conversationRepo.updateStatus((conversation._id as any).toString(), 'open');
            conversation.status = 'open';
        }

        // Add message as 'agent' type (it was sent by us from the Zalo app)
        return this.addMessage(
            (conversation._id as any).toString(),
            { type: 'agent', id: 'zalo_self', name: '📱 Zalo App' },
            content,
            msgType as any,
            attachments,
            clientMessageId
        );
    },

    /**
     * Handle incoming Facebook Messenger message → Route vào Inbox
     */
    async handleIncomingFacebookMessage(
        workspaceId: string,
        fbUserId: string,
        fbUserName: string,
        fbAvatar: string,
        content: string,
        msgType: 'text' | 'image' | 'video' | 'file' = 'text',
        attachments: any[] = [],
        clientMessageId?: string,
        pageId?: string,
        pageName?: string,
    ) {
        // Find/create widget for Facebook
        let widgetList = await widgetRepo.findByWorkspace(workspaceId);
        let targetWidget = widgetList?.find(w => (w as any).name === 'Facebook') || widgetList?.[0];

        if (!targetWidget) {
            console.log(`[ConvService] Auto-creating Facebook widget for workspace ${workspaceId}`);
            targetWidget = await widgetRepo.create({
                workspaceId: workspaceId as any,
                name: 'Facebook',
                isActive: true,
                config: {
                    primaryColor: '#1877F2',
                    greeting: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
                    placeholder: 'Nhập tin nhắn...',
                    position: 'bottom-right',
                    language: 'vi',
                    showBranding: false,
                    offlineMessage: 'Hiện tại không có agent trực tuyến.',
                    preChatForm: { enabled: false, title: '', fields: [] },
                },
                domainRules: { mode: 'allowlist', domains: [] },
            } as any);
        }

        const widgetId = (targetWidget._id as any).toString();
        const visitorId = `fb_${fbUserId}`;

        // Upsert visitor
        const { visitor } = await visitorRepo.findOrCreate(
            visitorId,
            widgetId,
            workspaceId,
            { name: fbUserName, avatar: fbAvatar, attributes: { channel: 'facebook', fbUserId, pageId, pageName } }
        );

        // Update visitor profile if we now have better data (e.g. avatar fetched later)
        if (fbAvatar) {
            await visitorRepo.enrichProfile(visitorId, widgetId, {
                name: fbUserName,
                attributes: { avatar: fbAvatar, channel: 'facebook', fbUserId, pageId, pageName },
            });
        }

        // Find/create conversation
        let conversation = await conversationRepo.findLatestByVisitor(visitorId, widgetId);
        let isNew = false;

        if (!conversation) {
            conversation = await conversationRepo.create({
                workspaceId: workspaceId as any,
                widgetId: targetWidget._id as any,
                visitorId,
                visitorInfo: { name: fbUserName, avatar: fbAvatar },
                channel: 'facebook',
                status: 'open',
                lastMessageAt: new Date(),
                metadata: { fbUserId, pageId, pageName },
            });
            isNew = true;
            await visitorRepo.incrementConversations(visitorId, widgetId);

            try {
                emitToWorkspace(workspaceId, 'conversation:new', {
                    conversation, visitor, visitorInfo: { name: fbUserName, avatar: fbAvatar },
                });
            } catch { /* socket may not be initialized yet */ }
        } else if (conversation.status === 'closed' || conversation.status === 'resolved') {
            await conversationRepo.updateStatus((conversation._id as any).toString(), 'open');
            conversation.status = 'open';

            try {
                emitToWorkspace(workspaceId, 'conversation:reopened', {
                    conversationId: (conversation._id as any).toString(),
                });
            } catch { /* socket may not be initialized */ }
        }

        // Update visitorInfo on existing conversation if we now have avatar/name
        if (conversation && !isNew) {
            const hasNewAvatar = fbAvatar && (!conversation.visitorInfo?.avatar || conversation.visitorInfo.avatar === '');
            const hasNewName = fbUserName && conversation.visitorInfo?.name !== fbUserName && fbUserName !== `FB User ${fbUserId.slice(-4)}`;
            if (hasNewAvatar || hasNewName) {
                try {
                    await conversationRepo.updateVisitorInfo((conversation._id as any).toString(), {
                        ...(hasNewAvatar ? { avatar: fbAvatar } : {}),
                        ...(hasNewName ? { name: fbUserName } : {}),
                    });
                } catch { /* silent */ }
            }
        }

        return this.addMessage(
            (conversation._id as any).toString(),
            { type: 'visitor', id: visitorId, name: fbUserName },
            content,
            msgType as any,
            attachments,
            clientMessageId
        );
    },

    /**
     * Handle self-sent Facebook messages (sent from the page) — route as agent message for 2-way sync
     */
    async handleSelfFacebookMessage(
        workspaceId: string,
        fbUserId: string,
        fbUserName: string,
        fbAvatar: string,
        content: string,
        msgType: 'text' | 'image' | 'video' | 'file' = 'text',
        attachments: any[] = [],
        clientMessageId?: string,
        pageId?: string,
        pageName?: string,
    ) {
        // Skip empty self-messages
        if (!content && (!attachments || attachments.length === 0)) return;

        const visitorId = `fb_${fbUserId}`;
        const widgetList = await widgetRepo.findByWorkspace(workspaceId);
        if (!widgetList || widgetList.length === 0) return;

        const targetWidget = widgetList.find(w => (w as any).name === 'Facebook') || widgetList[0];
        const widgetId = (targetWidget._id as any).toString();

        // Upsert visitor (without creating a message)
        await visitorRepo.findOrCreate(
            visitorId, widgetId, workspaceId,
            { name: fbUserName, avatar: fbAvatar, attributes: { channel: 'facebook', fbUserId, pageId, pageName } }
        );

        // Find or create conversation without sending an empty message
        let conversation = await conversationRepo.findLatestByVisitor(visitorId, widgetId);
        if (!conversation) {
            conversation = await conversationRepo.create({
                workspaceId: workspaceId as any,
                widgetId: targetWidget._id as any,
                visitorId,
                visitorInfo: { name: fbUserName, avatar: fbAvatar },
                channel: 'facebook',
                status: 'open',
                lastMessageAt: new Date(),
                metadata: { fbUserId, pageId, pageName },
            });
            await visitorRepo.incrementConversations(visitorId, widgetId);
        }

        if (conversation.status === 'closed') {
            await conversationRepo.updateStatus((conversation._id as any).toString(), 'open');
            conversation.status = 'open';
        }

        return this.addMessage(
            (conversation._id as any).toString(),
            { type: 'agent', id: 'fb_page', name: pageName || 'Facebook Page' },
            content,
            msgType as any,
            attachments,
            clientMessageId
        );
    },

    /**
     * Resume conversation — get conversation + messages
     */
    async resume(conversationId: string, visitorId: string) {
        const conversation = await conversationRepo.findById(conversationId);
        if (!conversation) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');
        if (conversation.visitorId !== visitorId) throw new AppError('Không có quyền', 403, 'FORBIDDEN');

        const msgResult = await messageRepo.findByConversation(conversation._id.toString(), { limit: 30, excludeInternal: true });
        return { conversation, messages: msgResult.items, totalMessages: msgResult.total };
    },

    /**
     * Get all conversations for a specific visitor
     */
    async getByVisitor(visitorId: string, widgetId: string) {
        return conversationRepo.findByVisitor(visitorId, widgetId);
    },

    /**
     * Add a message to a conversation.
     */
    async addMessage(
        conversationId: string,
        sender: { type: 'visitor' | 'agent' | 'system'; id: string; name?: string },
        content: string,
        msgType: 'text' | 'image' | 'file' | 'system' = 'text',
        attachments?: Array<{ data: string; url?: string; filename: string; mimeType: string; size: number }>,
        clientMessageId?: string,
        replyTo?: { messageId: string; content: string; senderName: string }
    ) {
        const conversation = await conversationRepo.findById(conversationId);
        if (!conversation) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        // ── Idempotency check ──
        if (clientMessageId) {
            const existing = await messageRepo.findByClientMessageId(conversationId, clientMessageId);
            if (existing) return existing; // already processed — return same message
        }

        // ── Visitor checks ──
        if (sender.type === 'visitor') {
            if (conversation.visitorId !== sender.id) {
                throw new AppError('Không có quyền gửi tin nhắn', 403, 'FORBIDDEN');
            }
            if (conversation.status !== 'open') {
                await conversationRepo.updateStatus(conversationId, 'open');
            }
        }

        // ── Agent checks ──
        if (sender.type === 'agent') {
            if (conversation.status === 'closed') {
                throw new AppError('Cuộc hội thoại đã đóng. Vui lòng mở lại trước khi gửi tin nhắn.', 400, 'CONVERSATION_CLOSED');
            }
        }

        // ── Sanitize content ──
        let sanitizedContent = content;
        let sanitizeFlags: string[] = [];
        if (content && sender.type !== 'system') {
            const result = sanitizeMessage(content);
            if (result.blocked) {
                throw new AppError('Nội dung tin nhắn chứa mã độc hoặc spam', 400, 'CONTENT_BLOCKED');
            }
            sanitizedContent = result.sanitized;
            sanitizeFlags = result.flags;
        }

        // ── Sanitize attachment filenames ──
        const safeAttachments = (attachments || []).map((att) => ({
            ...att,
            filename: sanitizeFilename(att.filename || (att as any).name || 'attachment'),
            url: att.url || undefined,
        }));

        const message = await messageRepo.create({
            conversationId: conversation._id as any,
            clientMessageId: clientMessageId || undefined,
            sender,
            content: sanitizedContent,
            type: msgType,
            attachments: safeAttachments,
            sanitizeFlags: sanitizeFlags.length > 0 ? sanitizeFlags : undefined,
            replyTo,
        });

        // ── Build conversation summary snippet ──
        const snippet = msgType === 'image' ? '📷 Hình ảnh'
            : msgType === 'file' ? '📎 Tệp đính kèm'
            : sanitizedContent.length > 80 ? sanitizedContent.slice(0, 80) + '…'
            : sanitizedContent;

        await conversationRepo.updateLastMessage(conversationId, {
            snippet,
            sender: { type: sender.type, name: sender.name },
            incrementUnread: sender.type !== 'agent', // visitor/system msgs count as unread for agents
        });

        // Emit to conversation room (both visitor + agents watching this conv)
        try {
            console.log(`[MessageService] Emitting message:new to room: ${conversationId}`, message);
            emitToConversation(conversationId, 'message:new', message);
            emitToWorkspace((conversation.workspaceId as any).toString(), 'conversation:updated', {
                conversationId, lastMessage: { content: sanitizedContent, sender, type: msgType, createdAt: message.createdAt },
            });
        } catch (e) { console.error('Socket emit error:', e); }

        // ── Chatbot Auto-Reply Hook ──
        // Only trigger for visitor messages (not agent/system/bot)
        if (sender.type === 'visitor' && content && content.length > 1) {
            try {
                const { chatbotService: botService } = await import('../chatbot/chatbot.service');
                const wsId = (conversation.workspaceId as any).toString();
                const channel = (conversation as any).channel || 'website';

                // Build conversation history for AI context
                let conversationHistory: Array<{ role: string; content: string }> = [];
                try {
                    const recentMsgs = await messageRepo.getLatest(conversationId, 10);
                    conversationHistory = recentMsgs
                        .filter(m => !m.isDeleted && m.content && m.type === 'text')
                        .reverse() // chronological order
                        .map(m => ({
                            role: m.sender.type === 'visitor' ? 'user' : 'assistant',
                            content: m.content,
                        }));
                    // Remove the last one (current message) since we pass it separately
                    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].content === content) {
                        conversationHistory.pop();
                    }
                } catch { /* skip history if not available */ }

                const botResult = await botService.processIncomingMessage(wsId, content, channel, conversationHistory);

                if (botResult) {
                    // Send bot reply as a new message (async, non-blocking)
                    setTimeout(async () => {
                        try {
                            await this.addMessage(
                                conversationId,
                                { type: 'agent', id: `bot_${botResult.botId}`, name: `🤖 ${botResult.botName}` },
                                botResult.response,
                                'text'
                            );
                            console.log(`[Chatbot] Auto-replied in conv ${conversationId} by bot ${botResult.botName}`);

                            // Route bot reply to external platform
                            if (channel === 'facebook') {
                                try {
                                    const { facebookService } = await import('../facebook/facebook.service');
                                    const fbUserId = (conversation as any).metadata?.fbUserId;
                                    const pageId = (conversation as any).metadata?.pageId;
                                    if (fbUserId && pageId) {
                                        await facebookService.sendMessage(wsId, fbUserId, botResult.response, pageId);
                                        console.log(`[Chatbot] ✅ Bot reply sent to Facebook user ${fbUserId}`);
                                    }
                                } catch (fbErr) {
                                    console.error('[Chatbot] Failed to send bot reply to Facebook:', fbErr);
                                }
                            } else if (channel === 'zalo') {
                                try {
                                    const { zaloService } = await import('../zalo/zalo.service');
                                    const zaloUserId = (conversation as any).visitorId;
                                    if (zaloUserId) {
                                        await zaloService.sendMessage(wsId, zaloUserId, botResult.response);
                                        console.log(`[Chatbot] ✅ Bot reply sent to Zalo user ${zaloUserId}`);
                                    }
                                } catch (zaloErr) {
                                    console.error('[Chatbot] Failed to send bot reply to Zalo:', zaloErr);
                                }
                            }
                        } catch (err) {
                            console.error('[Chatbot] Auto-reply failed:', err);
                        }
                    }, 1200); // Slightly longer delay for AI response natural feel
                }
            } catch (err) {
                console.error('[Chatbot] Hook error:', err);
            }
        }

        return message;
    },

    async getMessages(conversationId: string, options?: { page?: number; limit?: number }) {
        return messageRepo.findByConversation(conversationId, options);
    },

    async editMessage(conversationId: string, messageId: string, newContent: string, agentId: string) {
        const msg = await messageRepo.findById(messageId);
        if (!msg || (msg.conversationId as any).toString() !== conversationId) {
            throw new AppError('Không tìm thấy tin nhắn', 404, 'NOT_FOUND');
        }
        if (msg.sender.id !== agentId || msg.sender.type !== 'agent') {
            throw new AppError('Bạn chỉ có thể sửa tin nhắn của chính mình', 403, 'FORBIDDEN');
        }
        if (msg.isDeleted) {
            throw new AppError('Không thể sửa tin nhắn đã thu hồi', 400, 'BAD_REQUEST');
        }

        const original = msg.originalContent || msg.content;
        msg.content = newContent;
        msg.originalContent = original;
        msg.editedAt = new Date();
        await msg.save();
        
        try {
            emitToConversation(conversationId, 'message:edited', msg);
        } catch { /* socket offline */ }

        return msg;
    },

    async recallMessage(conversationId: string, messageId: string, agentId: string) {
        const msg = await messageRepo.findById(messageId);
        if (!msg || (msg.conversationId as any).toString() !== conversationId) {
            throw new AppError('Không tìm thấy tin nhắn', 404, 'NOT_FOUND');
        }
        if (msg.sender.id !== agentId || msg.sender.type !== 'agent') {
            throw new AppError('Bạn chỉ có thể thu hồi tin nhắn của chính mình', 403, 'FORBIDDEN');
        }
        if (msg.isDeleted) {
            throw new AppError('Tin nhắn này đã bị thu hồi bới bạn', 400, 'BAD_REQUEST');
        }

        msg.isDeleted = true;
        await msg.save();

        try {
            emitToConversation(conversationId, 'message:recalled', { messageId, conversationId });
        } catch { /* socket offline */ }

        return msg;
    },

    async getMessageContextPage(conversationId: string, messageId: string, limit: number = 30) {
        const page = await messageRepo.getMessagePage(conversationId, messageId, limit);
        if (!page) throw new AppError('Message not found', 404, 'NOT_FOUND');
        return { page };
    },

    async markRead(conversationId: string, requester?: { userId: string; type: 'visitor' | 'agent' }) {
        if (!requester?.userId) {
            await conversationRepo.markRead(conversationId);
            return;
        }

        const latestMsg = await messageRepo.findLatest(conversationId);
        if (!latestMsg) {
            await conversationRepo.markRead(conversationId);
            return;
        }

        const latestMsgId = (latestMsg._id as any).toString();

        await conversationRepo.updateReadCursor(
            conversationId,
            requester.userId,
            requester.type,
            latestMsgId
        );

        if (requester.type === 'agent') {
            await messageRepo.markAsReadUpTo(conversationId, latestMsgId, 'visitor');
            await conversationRepo.markRead(conversationId);
        } else {
            await messageRepo.markAsReadUpTo(conversationId, latestMsgId, 'agent');
        }

        try {
            emitToConversation(conversationId, 'messages:read', {
                conversationId,
                lastReadMessageId: latestMsgId,
                participantId: requester.userId,
                participantType: requester.type
            });

            if (requester.type === 'agent') {
                const conv = await conversationRepo.findById(conversationId);
                if (conv) {
                    emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:updated', {
                        conversationId,
                        unreadCount: 0
                    });
                }
            }
        } catch { /* socket might be missing during testing */ }
    },

    async getMessagesSince(conversationId: string, since: string) {
        return messageRepo.findSince(conversationId, new Date(since));
    },

    /**
     * Return up-to-date receipts for a conversation so a reconnecting client can backfill.
     * Returns:
     * - readCursors: per-participant read positions
     * - statuses: map of messageId -> current status for recent messages
     */
    async getReceipts(conversationId: string, limit: number = 100) {
        const conv = await conversationRepo.findById(conversationId);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const recentMessages = await messageRepo.getLatest(conversationId, limit);
        const statuses: Record<string, string> = {};
        for (const msg of recentMessages) {
            statuses[(msg._id as any).toString()] = msg.status || 'sent';
        }

        return {
            readCursors: conv.readContext || [],
            statuses,
        };
    },

    async assignConversation(conversationId: string, agentId: string, agentName: string, expectUnassigned = false) {
        const conv = await conversationRepo.assignTo(conversationId, agentId, expectUnassigned);
        if (!conv && expectUnassigned) {
            // Collision: someone else already grabbed it
            throw new AppError(
                'Cuộc hội thoại đã được agent khác nhận trước. Vui lòng chọn cuộc hội thoại khác.',
                409,
                'ASSIGN_COLLISION'
            );
        }
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        // Add system message
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${agentName} đã nhận cuộc hội thoại này`,
            'text'
        );

        // Notify workspace
        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:assigned', {
                conversationId,
                assignedTo: { id: agentId, name: agentName },
            });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    async unassignConversation(conversationId: string, agentName: string) {
        const conv = await conversationRepo.unassign(conversationId);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${agentName} đã bỏ nhận cuộc hội thoại này`,
            'text'
        );

        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:assigned', {
                conversationId,
                assignedTo: null,
            });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    async transferConversation(
        conversationId: string,
        fromAgentName: string,
        toAgentId: string,
        toAgentName: string
    ) {
        const conv = await conversationRepo.assignTo(conversationId, toAgentId);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        // System message: "A đã chuyển cuộc hội thoại cho B"
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${fromAgentName} đã chuyển cuộc hội thoại cho ${toAgentName}`,
            'text'
        );

        // Notify workspace
        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:assigned', {
                conversationId,
                assignedTo: { id: toAgentId, name: toAgentName },
            });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    async closeConversation(conversationId: string, agentName?: string) {
        const conv = await conversationRepo.updateStatus(conversationId, 'closed');
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        // System message
        const who = agentName || 'Hệ thống';
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${who} đã đóng cuộc hội thoại`,
            'text'
        );

        // Notify workspace + conversation room
        try {
            emitToConversation(conversationId, 'conversation:closed', { conversationId });
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:closed', { conversationId });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    async reopenConversation(conversationId: string, agentName?: string) {
        const conv = await conversationRepo.updateStatus(conversationId, 'open');
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const who = agentName || 'Hệ thống';
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${who} đã mở lại cuộc hội thoại`,
            'text'
        );

        // Notify workspace + conversation room
        try {
            emitToConversation(conversationId, 'conversation:reopened', { conversationId });
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:reopened', { conversationId });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    async setPendingConversation(conversationId: string, agentName?: string) {
        const conv = await conversationRepo.updateStatus(conversationId, 'pending');
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const who = agentName || 'Hệ thống';
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${who} đã chuyển cuộc hội thoại sang chờ xử lý`,
            'text'
        );

        try {
            emitToConversation(conversationId, 'conversation:statusChanged', { conversationId, status: 'pending' });
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:statusChanged', { conversationId, status: 'pending' });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    // ── Priority / SLA ──

    async setPriority(conversationId: string, priority: string, slaDeadline?: Date, agentName?: string) {
        const conv = await conversationRepo.setPriority(conversationId, priority, slaDeadline);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const priorityLabels: Record<string, string> = {
            urgent: '🔴 Khẩn cấp', high: '🟠 Cao', normal: '🟢 Bình thường', low: '⚪ Thấp'
        };
        const label = priorityLabels[priority] || priority;
        const who = agentName || 'Hệ thống';
        let msg = `${who} đã đặt mức ưu tiên: ${label}`;
        if (slaDeadline) {
            msg += ` — SLA: ${new Date(slaDeadline).toLocaleString('vi-VN')}`;
        }

        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            msg,
            'text'
        );

        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:priorityChanged', {
                conversationId,
                priority,
                slaDeadline: slaDeadline || null,
            });
        } catch { /* socket may not be initialized */ }

        return conv;
    },

    /**
     * Check for conversations approaching SLA breach (within next 15 minutes).
     * Returns list of breaching conversations for notification.
     */
    async checkSLABreaching(withinMs = 15 * 60 * 1000) {
        const approaching = await conversationRepo.findBreachingSLA(withinMs);
        const breached = await conversationRepo.findBreachedSLA();

        // Emit warnings to respective workspaces
        for (const conv of approaching) {
            try {
                emitToWorkspace((conv.workspaceId as any).toString(), 'sla:warning', {
                    conversationId: conv._id,
                    slaDeadline: conv.slaDeadline,
                    priority: conv.priority,
                    type: 'approaching',
                });
            } catch { /* ignore */ }
        }
        for (const conv of breached) {
            try {
                emitToWorkspace((conv.workspaceId as any).toString(), 'sla:warning', {
                    conversationId: conv._id,
                    slaDeadline: conv.slaDeadline,
                    priority: conv.priority,
                    type: 'breached',
                });
            } catch { /* ignore */ }
        }

        return { approaching, breached };
    },

    /**
     * Requeue all conversations from a disconnected agent back to the queue.
     */
    async requeueByAgent(agentId: string, workspaceId?: string) {
        const count = await conversationRepo.requeueByAgent(agentId);
        if (count > 0 && workspaceId) {
            try {
                emitToWorkspace(workspaceId, 'conversation:requeued', {
                    agentId,
                    count,
                });
            } catch { /* ignore */ }
        }
        return count;
    },

    async updateTracking(conversationId: string, visitorId: string, tracking: Record<string, any>) {
        const conv = await conversationRepo.findById(conversationId);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');
        if (conv.visitorId !== visitorId) throw new AppError('Không có quyền', 403, 'FORBIDDEN');

        const merged = { ...(conv.metadata || {}), ...tracking };
        return conversationRepo.updateMetadata(conversationId, merged);
    },

    async getDomainsByWorkspace(workspaceId: string) {
        return conversationRepo.getDistinctDomains(workspaceId);
    },

    async getByWorkspace(
        workspaceId: string, 
        options?: { 
            status?: string; 
            assignee?: string;
            tags?: string | string[];
            channel?: string;
            pageId?: string;
            dateFrom?: string;
            dateTo?: string;
            sortBy?: string;
            page?: number; 
            limit?: number;
            domain?: string | string[];
        },
        requester?: { userId: string; type: 'visitor' | 'agent' }
    ) {
        const result = await conversationRepo.findByWorkspace(workspaceId, options);

        if (requester && result.items.length > 0) {
            const items = await Promise.all(
                result.items.map(async (conv) => {
                    const convObj = conv.toObject ? conv.toObject() : { ...conv };
                    const readCtx = conv.readContext?.find(
                        (ctx: any) => ctx.participantId === requester.userId && ctx.participantType === requester.type
                    );
                    const unreadCount = await messageRepo.countUnreadSince(
                        (conv._id as any).toString(),
                        requester.type,
                        readCtx ? readCtx.lastReadMessageId : null
                    );
                    return { ...convObj, unreadCount };
                })
            );

            // If we are sorting by unread, we should at least sort the current page by the dynamic count
            if (options?.sortBy === 'unread') {
                items.sort((a: any, b: any) => {
                    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
                    return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
                });
            }

            return { items, total: result.total };
        }

        return result;
    },

    async getOne(conversationId: string, requester?: { userId: string; type: 'visitor' | 'agent' }) {
        const conv = await conversationRepo.findById(conversationId);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');
        
        let convObj = conv.toObject ? conv.toObject() : { ...conv };
        
        if (requester) {
            const readCtx = conv.readContext?.find(
                (ctx: any) => ctx.participantId === requester.userId && ctx.participantType === requester.type
            );
            const unreadCount = await messageRepo.countUnreadSince(
                (conv._id as any).toString(),
                requester.type,
                readCtx ? readCtx.lastReadMessageId : null
            );
            convObj = { ...convObj, unreadCount };
        }
        
        return convObj;
    },

    async getTotalUnreadCount(workspaceId: string, requester: { userId: string; type: 'visitor' | 'agent' }) {
        const convs = await conversationRepo.findOpenByWorkspace(workspaceId);
        
        let totalUnread = 0;
        let zaloUnread = 0;
        
        await Promise.all(
            convs.map(async (conv: any) => {
                const readCtx = conv.readContext?.find(
                    (ctx: any) => ctx.participantId === requester.userId && ctx.participantType === requester.type
                );
                const count = await messageRepo.countUnreadSince(
                    conv._id.toString(),
                    requester.type,
                    readCtx ? readCtx.lastReadMessageId : null
                );
                
                totalUnread += count;
                // Determine if this is a Zalo conversation
                const isZalo = conv.channel === 'zalo' || conv.metadata?.channel === 'zalo';
                if (isZalo) {
                    zaloUnread += count;
                }
            })
        );
        
        return { 
            totalUnread, 
            zaloUnread, 
            inboxUnread: Math.max(0, totalUnread - zaloUnread) 
        };
    },

    // ── Visitor profile methods ──

    async getVisitors(workspaceId: string, options?: { page?: number; limit?: number; search?: string }) {
        return visitorRepo.findByWorkspace(workspaceId, options);
    },

    async getVisitor(visitorId: string, widgetId: string) {
        const visitor = await visitorRepo.findOne(visitorId, widgetId);
        if (!visitor) throw new AppError('Visitor không tồn tại', 404, 'NOT_FOUND');
        return visitor;
    },

    async enrichVisitor(
        visitorId: string,
        widgetId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ) {
        const visitor = await visitorRepo.enrichProfile(visitorId, widgetId, data);
        if (!visitor) throw new AppError('Visitor không tồn tại', 404, 'NOT_FOUND');
        return visitor;
    },

    async getVisitorByWorkspace(workspaceId: string, visitorId: string) {
        const visitor = await visitorRepo.findOneByWorkspaceAndVisitorId(workspaceId, visitorId);
        if (!visitor) throw new AppError('Visitor không tồn tại', 404, 'NOT_FOUND');
        return visitor;
    },

    async updateVisitorByWorkspace(
        workspaceId: string,
        visitorId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ) {
        const visitor = await visitorRepo.updateByWorkspaceAndVisitorId(workspaceId, visitorId, data);
        if (!visitor) throw new AppError('Visitor không tồn tại', 404, 'NOT_FOUND');
        return visitor;
    },

    // ── Tags on conversation ──

    async addTagToConversation(conversationId: string, tag: string, agentName?: string) {
        const conv = await conversationRepo.addTag(conversationId, tag);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const who = agentName || 'Hệ thống';
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${who} đã gắn tag: ${tag}`,
            'text'
        );

        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:tagsChanged', {
                conversationId,
                tags: conv.tags,
            });
        } catch { /* ignore */ }

        return conv;
    },

    async removeTagFromConversation(conversationId: string, tag: string, agentName?: string) {
        const conv = await conversationRepo.removeTag(conversationId, tag);
        if (!conv) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const who = agentName || 'Hệ thống';
        await this.addMessage(
            conversationId,
            { type: 'system', id: 'system', name: 'System' },
            `${who} đã gỡ tag: ${tag}`,
            'text'
        );

        try {
            emitToWorkspace((conv.workspaceId as any).toString(), 'conversation:tagsChanged', {
                conversationId,
                tags: conv.tags,
            });
        } catch { /* ignore */ }

        return conv;
    },

    // ── Internal notes ──

    async addInternalNote(
        conversationId: string,
        sender: { id: string; name?: string },
        content: string,
        mentionedUserIds?: string[]
    ) {
        const conversation = await conversationRepo.findById(conversationId);
        if (!conversation) throw new AppError('Cuộc hội thoại không tồn tại', 404, 'NOT_FOUND');

        const note = await messageRepo.create({
            conversationId: conversation._id as any,
            sender: { type: 'agent', id: sender.id, name: sender.name },
            content,
            type: 'text',
            isInternal: true,
        });

        // Only emit to agent namespace (not visitor)
        try {
            emitToWorkspace((conversation.workspaceId as any).toString(), 'note:new', {
                conversationId,
                note,
            });

            if (mentionedUserIds && mentionedUserIds.length > 0) {
                const ids = mentionedUserIds.map(id => id.toString());
                ids.forEach(userId => {
                    if (userId !== sender.id) { // don't notify self
                        emitToUser(userId, 'notification:mention', {
                            conversationId,
                            message: `${sender.name || 'Một đồng nghiệp'} đã nhắc đến bạn trong một ghi chú.`,
                            noteId: note._id,
                            createdAt: new Date().toISOString()
                        });
                    }
                });
            }
        } catch { /* ignore */ }

        return note;
    },

    /**
     * Reset toàn bộ tin nhắn của workspace.
     * - Xóa hết Message docs thuộc các conversations của workspace này.
     * - Xóa hết ZaloMessage docs của workspace.
     * - Reset lastMessage, unreadCount trên Conversation docs.
     * - GIỮ NGUYÊN: Visitor profiles, Conversation metadata (visitorId, assignedTo, tags...).
     */
    async resetWorkspaceMessages(workspaceId: string): Promise<{ deletedMessages: number; deletedZaloMessages: number; resetConversations: number }> {
        const mongoose = require('mongoose');
        const { MessageModel } = require('./repos/message.model');
        const { ConversationModel } = require('./repos/conversation.model');
        const { ZaloMessageModel } = require('../zalo/repos/zalo-message.model');

        const wsObjectId = new mongoose.Types.ObjectId(workspaceId);

        // 1. Lấy tất cả conversationIds của workspace
        const convIds = await ConversationModel.distinct('_id', { workspaceId: wsObjectId });

        // 2. Xóa toàn bộ Messages thuộc các conversations này
        const msgResult = await MessageModel.deleteMany({ conversationId: { $in: convIds } });

        // 3. Xóa toàn bộ ZaloMessages của workspace
        const zaloResult = await ZaloMessageModel.deleteMany({ workspaceId: wsObjectId });

        // 4. Reset conversations: xóa lastMessage, unreadCount = 0 (giữ metadata khác)
        const convResult = await ConversationModel.updateMany(
            { workspaceId: wsObjectId },
            {
                $unset: { lastMessage: '' },
                $set: { unreadCount: 0 },
            }
        );

        return {
            deletedMessages: msgResult.deletedCount || 0,
            deletedZaloMessages: zaloResult.deletedCount || 0,
            resetConversations: convResult.modifiedCount || 0,
        };
    },

    /**
     * Search conversations by message content.
     */
    async searchByMessageContent(
        workspaceId: string,
        query: string,
        options?: { status?: string; limit?: number }
    ) {
        return conversationRepo.searchByMessageContent(workspaceId, query, options);
    },
};
