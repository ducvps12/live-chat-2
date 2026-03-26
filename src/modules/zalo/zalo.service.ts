import { zaloAccountRepo } from './repos/zalo-account.repo';
import { zaloMessageRepo, ZaloMessageQuery } from './repos/zalo-message.repo';
import { zaloContactRepo, ZaloContactQuery } from './repos/zalo-contact.repo';
import { AppError } from '../../middlewares/errorHandler';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { conversationService } from '../conversation/conversation.service';
import { leadService } from '../lead/lead.service';
import { 
    createZaloSession, 
    restoreZaloSession, 
    destroyZaloSession, 
    sendZaloMsg,
    sendZaloImage, 
    getZaloConversations,
    getZaloMessages,
    ZaloIncomingMessage,
    isZaloSessionConnected,
    migrateZaloSession,
    copyZaloCredentials,
    getZaloGroups,
    getZaloGroupMembers,
    removeZaloGroupMember,
    sendZaloFriendRequest,
    getZaloFriendIds,
    getZaloAliasList,
} from '../../infra/zaloService';

class ZaloService {
    // Map accountId → workspaceId for message routing
    private accountWorkspaceMap = new Map<string, string>();
    // Track msgIds sent from web UI to prevent duplicate inbox entries when Zalo listener catches self-messages
    private webSentMsgIds = new Set<string>();

    /**
     * Khởi động lại toàn bộ ZaloSession cho các workspace đã kết nối
     * Gọi hàm này lúc bootstrap server
     */
    async bootActiveAccounts() {
        console.log('[ZaloService] Booting up active Zalo accounts...');
        try {
            const activeAccounts = await zaloAccountRepo.findActive();
            for (const account of activeAccounts) {
                const workspaceId = account.workspaceId.toString();
                const accountId = account._id.toString();
                this.accountWorkspaceMap.set(accountId, workspaceId);
                try {
                    // Use accountId as sessionId to support multiple accounts per workspace
                    await restoreZaloSession(
                        accountId,
                        (msg) => this.handleMessage(workspaceId, msg, accountId),
                        (err) => console.error(`[ZaloService] Account ${accountId} listener error:`, err)
                    );
                    console.log(`[ZaloService] Successfully booted account ${accountId} for workspace ${workspaceId}`);
                    // Auto-trigger avatar backfill + history sync after session restore
                    setTimeout(() => this.backfillAvatars(workspaceId, accountId), 5000);
                    setTimeout(() => this.syncAllHistory(workspaceId), 15000);
                } catch (err) {
                    console.error(`[ZaloService] Failed to boot account ${accountId}:`, err);
                    // Update DB status to reflect failed restore
                    try { await zaloAccountRepo.updateStatus(accountId, 'disconnected'); } catch { /* silent */ }
                }
            }
        } catch (err) {
            console.error('[ZaloService] Error in bootActiveAccounts:', err);
        }
    }

    /**
     * Generate mã QR để user quét đăng nhập trên ứng dụng
     */
    async generateQRLogin(workspaceId: string): Promise<string> {
        // Generate a temporary session ID — will be replaced by accountId after DB insert
        const tempSessionId = `qr_${workspaceId}_${Date.now()}`;

        return new Promise((resolve, reject) => {
            let qrResolved = false;
            let resolvedAccountId: string | undefined; // closure for onMessage callback

            createZaloSession(
                tempSessionId,
                (qrDataUrl) => {
                    if (!qrResolved) {
                        qrResolved = true;
                        resolve(qrDataUrl);
                    }
                },
                async (session) => {
                    // Đăng nhập thành công
                    try {
                        let name = 'Unknown Zalo';
                        let avatar = '';
                        let zaloId = session.api?.getOwnId ? session.api.getOwnId() : 'unknown';

                        // Strategy 1: fetchAccountInfo
                        if (session.api?.fetchAccountInfo) {
                            try {
                                const profile = await session.api.fetchAccountInfo() as any;
                                if (profile) {
                                    name = profile.name || profile.displayName || profile.zaloName || name;
                                    avatar = profile.avatar || profile.thumbAvatar || avatar;
                                }
                            } catch (e) {
                                console.warn(`[ZaloService] fetchAccountInfo failed:`, e);
                            }
                        }

                        // Strategy 2: getContext()
                        if (name === 'Unknown Zalo' && session.api?.getContext) {
                            try {
                                const ctx = session.api.getContext();
                                if (ctx?.uid) zaloId = ctx.uid;
                            } catch { /* silent */ }
                        }

                        // Strategy 3: Friends list
                        if (name === 'Unknown Zalo' && session.api?.getAllFriends) {
                            try {
                                const friends = await session.api.getAllFriends();
                                const ownId = typeof zaloId === 'object' ? (zaloId as any).userId || (zaloId as any).uid : String(zaloId);
                                const self = Array.isArray(friends) ? friends.find((f: any) => 
                                    String(f.userId || f.uid || f.id) === String(ownId)
                                ) : null;
                                if (self) {
                                    name = self.displayName || self.zaloName || self.name || name;
                                    avatar = self.avatar || self.thumbAvatar || avatar;
                                }
                                if (name === 'Unknown Zalo' && Array.isArray(friends) && friends.length > 0) {
                                    name = `Zalo (${friends.length} bạn bè)`;
                                }
                            } catch (e) {
                                console.warn(`[ZaloService] getAllFriends fallback failed:`, e);
                            }
                        }

                        // Check if this zaloId is already connected to this workspace
                        const resolvedZaloId = typeof zaloId === 'object' ? (zaloId as any).userId || (zaloId as any).uid : String(zaloId);
                        const existing = await zaloAccountRepo.findByWorkspaceId(workspaceId);
                        const duplicate = existing.find(a => a.zaloId === resolvedZaloId);
                        let accountId: string;
                        if (duplicate) {
                            // Update existing account instead of creating duplicate
                            await zaloAccountRepo.update(duplicate._id as unknown as string, {
                                name, avatar, status: 'active'
                            });
                            accountId = (duplicate._id as unknown as string).toString();
                            this.accountWorkspaceMap.set(accountId, workspaceId);
                            console.log(`[ZaloService] Updated existing Zalo acc ${name} (${accountId})`);
                        } else {
                            // Create new account (multi-Zalo: no deletion of existing)
                            const newAccount = await zaloAccountRepo.create({
                                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                                zaloId: resolvedZaloId,
                                name,
                                avatar,
                                imei: crypto.randomUUID(),
                                cookie: [],
                                userAgent: 'Mozilla/5.0',
                                status: 'active'
                            });
                            accountId = (newAccount._id as unknown as string).toString();
                            this.accountWorkspaceMap.set(accountId, workspaceId);
                            console.log(`[ZaloService] Workspace ${workspaceId} linked NEW Zalo acc ${name} (${accountId})`);
                        }

                        // Share accountId with the onMessage callback via closure
                        resolvedAccountId = accountId;

                        // ── CRITICAL: Migrate session from tempSessionId → accountId ──
                        // Without this, isZaloSessionConnected(accountId) returns false
                        // because the session is stored under the temp QR session ID
                        migrateZaloSession(tempSessionId, accountId);
                        copyZaloCredentials(tempSessionId, accountId);

                        // Background: backfill avatars + sync history for existing conversations
                        setTimeout(() => this.backfillAvatars(workspaceId, accountId), 3000);
                        setTimeout(() => this.syncAllHistory(workspaceId), 10000);
                    } catch (err) {
                        console.error(`[ZaloService] Post QR-login setup failed for Workspace ${workspaceId}:`, err);
                    }
                },
                (msg) => this.handleMessage(workspaceId, msg, resolvedAccountId),
                (error) => {
                    console.error(`[ZaloService] QR Session error for ${workspaceId}:`, error);
                    if (!qrResolved) {
                        qrResolved = true;
                        reject(new Error(error));
                    }
                }
            ).catch(err => {
                if (!qrResolved) {
                    qrResolved = true;
                    reject(err);
                }
            });
        });
    }

    /**
     * Lấy trạng thái tất cả Zalo accounts trong workspace
     */
    async getStatus(workspaceId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        
        if (accounts.length === 0) {
            return { connected: false, accounts: [] };
        }

        const accountList = accounts.map(account => {
            const accountId = (account._id as unknown as string).toString();
            const isConnected = isZaloSessionConnected(accountId);
            return {
                accountId,
                connected: true,
                status: isConnected ? 'active' as const : 'disconnected' as const,
                name: account.name,
                avatar: account.avatar,
                zaloId: account.zaloId,
                isOnline: isConnected,
            };
        });

        // Backward compat: top-level fields from first active account
        const firstActive = accountList.find(a => a.isOnline) || accountList[0];
        return {
            connected: accountList.some(a => a.isOnline),
            status: firstActive.status,
            name: firstActive.name,
            avatar: firstActive.avatar,
            zaloId: firstActive.zaloId,
            isOnline: firstActive.isOnline,
            accounts: accountList,
        };
    }

    /**
     * Ngắt kết nối 1 Zalo account cụ thể
     */
    async disconnect(workspaceId: string, accountId?: string) {
        if (accountId) {
            // Disconnect specific account
            const account = await zaloAccountRepo.findById(accountId);
            if (account && account.workspaceId.toString() === workspaceId) {
                await zaloAccountRepo.delete(accountId);
                await destroyZaloSession(accountId);
                this.accountWorkspaceMap.delete(accountId);
            }
        } else {
            // Legacy: disconnect all accounts in workspace
            const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
            for (const acc of accounts) {
                const id = (acc._id as unknown as string).toString();
                await zaloAccountRepo.delete(id);
                await destroyZaloSession(id);
                this.accountWorkspaceMap.delete(id);
            }
        }
        return { success: true };
    }

    /**
     * Gắn Listener: Khi có tin nhắn Zalo tới -> Đẩy vào hệ thống NemarkChat Socket/Conversation
     */
    private async handleMessage(workspaceId: string, message: ZaloIncomingMessage, accountId?: string) {
        // ── Luôn lưu vào DB (kể cả tin nhắn tự gửi) ──
        try {
            await zaloMessageRepo.saveMessage({
                workspaceId,
                threadId: message.threadId,
                threadType: message.threadType,
                msgId: message.msgId,
                senderId: message.senderId,
                senderName: message.senderName,
                content: message.content,
                msgType: message.msgType,
                attachmentUrl: message.attachmentUrl,
                thumbUrl: message.thumbUrl,
                isSelf: message.isSelf,
                timestamp: new Date(message.timestamp),
            });
        } catch (err) {
            console.error(`[ZaloService] Failed to save message to DB:`, err);
        }

        // ── Upsert contact info ──
        if (!message.isSelf && message.senderId) {
            try {
                await zaloContactRepo.upsert({
                    workspaceId,
                    zaloUserId: message.senderId,
                    displayName: message.senderName,
                    source: message.threadType === 'group' ? 'group' : 'stranger',
                    lastMessagePreview: message.content?.substring(0, 100) || '[Đính kèm]',
                });
            } catch (err) {
                console.error(`[ZaloService] Failed to upsert contact:`, err);
            }
        }

        console.log(`[ZaloService] Workspace ${workspaceId} received Zalo msg from ${message.senderId} (thread: ${message.threadId}, type: ${message.threadType}, self: ${message.isSelf})`);
        try {
            const senderId = message.senderId;
            const isGroupMsg = message.threadType === 'group';
            
            // For groups: use threadId as the conversation key (all members → 1 conversation)
            // For DMs: use senderId as the conversation key (1 person → 1 conversation)
            // For self-messages in DMs: use threadId as conversation key (same person they're chatting with)
            const conversationKey = isGroupMsg ? message.threadId 
                : (message.isSelf ? message.threadId : senderId);
            
            let conversationName = message.senderName || `Zalo User ${senderId}`;
            let avatar = '';
            let groupName = '';

            // Fetch conversation/group info from Zalo API for avatar & display name
            try {
                // accountId is the Zalo session ID — getZaloConversations needs this, NOT workspaceId
                let sessionForConvs = accountId;
                if (!sessionForConvs) {
                    // Fallback: find any connected account for this workspace
                    const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
                    const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
                    if (connected) sessionForConvs = (connected._id as unknown as string).toString();
                }
                const convs = sessionForConvs ? await getZaloConversations(sessionForConvs) : [];
                const conv = convs.find(c => c.threadId === message.threadId);
                if (conv) {
                    if (conv.avatar) avatar = conv.avatar;
                    
                    if (isGroupMsg) {
                        // For groups: use group's displayName as conversation name
                        groupName = conv.displayName || `Nhóm ${message.threadId}`;
                        conversationName = groupName;
                    } else {
                        // For DMs: use the other person's name (the conv displayName)
                        if (conv.displayName) {
                            conversationName = conv.displayName;
                        }
                    }
                    
                    // Update contact avatar (for DMs, not self)
                    if (avatar && !isGroupMsg && !message.isSelf) {
                        try {
                            await zaloContactRepo.updateInfo(workspaceId, senderId, {
                                displayName: conversationName,
                                avatar,
                            });
                        } catch { /* silent */ }
                    }
                }
            } catch (err) {
                console.warn(`[ZaloService] Failed to fetch conversations for avatar info:`, err);
            }

            let msgType: 'text' | 'image' | 'video' | 'file' = 'text';
            let attachments: any[] = [];
            
            // Xử lý media: trích xuất URL ảnh từ infra layer
            if (message.msgType === 'image' || message.msgType === 'media') {
                 msgType = 'image';
                 const imageUrl = message.attachmentUrl || message.thumbUrl || '';
                 if (imageUrl) {
                     attachments.push({
                         url: imageUrl,
                         data: '',
                         filename: 'Zalo Image',
                         size: 0,
                         mimeType: 'image/jpeg'
                     });
                 }
            } else if (message.msgType === 'sticker') {
                 // Sticker: use stickerUrl as image attachment for rendering in Inbox
                 msgType = 'image';
                 const stickerImageUrl = message.stickerUrl || message.attachmentUrl || message.thumbUrl || '';
                 console.log(`[ZaloService] Sticker detected: stickerUrl=${message.stickerUrl}, attachmentUrl=${message.attachmentUrl}, thumbUrl=${message.thumbUrl}, resolved=${stickerImageUrl}`);
                 if (stickerImageUrl) {
                     attachments.push({
                         url: stickerImageUrl,
                         data: '',
                         filename: 'Zalo Sticker',
                         size: 0,
                         mimeType: 'image/webp'
                     });
                 } else {
                     console.warn(`[ZaloService] Sticker has no URL! Full message:`, JSON.stringify({ msgType: message.msgType, stickerUrl: message.stickerUrl, content: message.content?.substring(0, 100) }));
                 }
            }

            // Clean content text for different message types
            let contentText = (message.msgType === 'sticker')
                ? '🎭 Sticker'
                : (message.content && !message.content.includes('[Media/Sticker]') && !message.content.includes('[Sticker:'))
                    ? message.content
                    : (attachments.length ? '[Đính kèm]' : message.content || '');

            // For group messages: prefix the individual sender name so we know who said what
            const senderDisplayName = isGroupMsg
                ? (message.senderName || `Thành viên ${senderId.slice(-6)}`)
                : conversationName;

            if (message.isSelf) {
                // Skip if this was sent from web UI (already added to inbox)
                if (this.webSentMsgIds.has(message.msgId)) {
                    console.log(`[ZaloService] Skipping self-msg ${message.msgId} (already sent from web UI)`);
                    return;
                }
                // ── Self-sent messages (from Zalo app): route as agent message ──
                await conversationService.handleSelfZaloMessage(
                    workspaceId,
                    conversationKey,
                    conversationName,
                    avatar,
                    contentText,
                    msgType,
                    attachments,
                    message.msgId,
                );
            } else {
                // ── Incoming from others: route as visitor message ──
                await conversationService.handleIncomingZaloMessage(
                    workspaceId,
                    conversationKey,  // threadId for groups, senderId for DMs
                    conversationName, // group name for groups, person name for DMs
                    avatar,
                    contentText,
                    msgType,
                    attachments,
                    message.msgId,
                    isGroupMsg ? senderDisplayName : undefined, // pass sender name for group messages
                );
            }
        } catch (err) {
            console.error(`[ZaloService] Error handling incoming Zalo message for Workspace ${workspaceId}:`, err);
        }
    }

    /**
     * Core API để Frontend gửi tin nhắn qua Zalo (Reply lại khách)
     */
    async sendMessage(workspaceId: string, threadId: string, text: string, type: 'text' | 'image' | 'sticker' = 'text', attachmentUrl?: string, accountId?: string) {
        // Find a connected session: prefer specified accountId, then any connected account in workspace
        let sessionId = accountId;
        if (!sessionId || !isZaloSessionConnected(sessionId)) {
            const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
            const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
            if (connected) {
                sessionId = (connected._id as unknown as string).toString();
            }
        }

        if (!sessionId || !isZaloSessionConnected(sessionId)) {
            throw new AppError('Tài khoản Zalo chưa kết nối hoặc đang offline', 400, 'ZALO_NOT_CONNECTED');
        }

        // Determine thread type
        let threadType: 'user' | 'group' = 'user';
        try {
            const convs = await getZaloConversations(sessionId);
            const conv = convs.find(c => c.threadId === threadId);
            if (conv) threadType = conv.threadType;
        } catch {}

        let result;

        if (type === 'image' && attachmentUrl) {
            result = await sendZaloImage(sessionId, threadId, threadType, attachmentUrl, text);
            if (!result.success) {
                throw new AppError(result.error || 'Lỗi gửi ảnh Zalo', 500, 'ZALO_SEND_FAILED');
            }
        } else {
            result = await sendZaloMsg(sessionId, threadId, threadType, text);
            if (!result.success) {
                throw new AppError(result.error || 'Lỗi gửi tin nhắn Zalo', 500, 'ZALO_SEND_FAILED');
            }
        }

        // ── Lưu tin nhắn đã gửi vào DB ──
        const sentMsgId = result.msgId || `sent_${Date.now()}`;
        // Track this msgId so Zalo listener won't route it to inbox again
        this.webSentMsgIds.add(sentMsgId);
        setTimeout(() => this.webSentMsgIds.delete(sentMsgId), 30_000); // cleanup after 30s
        try {
            await zaloMessageRepo.saveMessage({
                workspaceId,
                threadId,
                threadType,
                msgId: sentMsgId,
                senderId: 'self',
                senderName: 'Bạn',
                content: text || (type === 'image' ? '[Hình ảnh]' : ''),
                msgType: type,
                attachmentUrl: type === 'image' ? attachmentUrl : undefined,
                isSelf: true,
                timestamp: new Date(),
            });
        } catch (err) {
            console.error(`[ZaloService] Failed to save sent message to DB:`, err);
        }

        return { success: true };
    }

    /**
     * Broadcast/forward messages to multiple Zalo friends with anti-spam delay
     * @param delayMs - delay between each recipient (default 3000ms to avoid Zalo ban)
     */
    async broadcastMessages(
        workspaceId: string,
        messages: string[],  // Array of message content strings
        recipientIds: string[],  // Array of Zalo threadIds (friend IDs)
        options?: { delayMs?: number; accountId?: string }
    ) {
        const delayMs = options?.delayMs || 3000; // 3s between each recipient

        // Find connected session
        let sessionId = options?.accountId;
        if (!sessionId || !isZaloSessionConnected(sessionId)) {
            const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
            const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
            if (connected) {
                sessionId = (connected._id as unknown as string).toString();
            }
        }
        if (!sessionId || !isZaloSessionConnected(sessionId)) {
            throw new AppError('Tài khoản Zalo chưa kết nối', 400, 'ZALO_NOT_CONNECTED');
        }

        const results: Array<{ threadId: string; success: boolean; error?: string }> = [];

        for (let i = 0; i < recipientIds.length; i++) {
            const threadId = recipientIds[i];

            // Anti-spam delay between recipients (skip delay for first one)
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            try {
                // Send each message to this recipient with small delay between messages
                for (let j = 0; j < messages.length; j++) {
                    if (j > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between messages
                    }
                    const result = await sendZaloMsg(sessionId, threadId, 'user', messages[j]);
                    if (!result.success) {
                        results.push({ threadId, success: false, error: result.error || 'Gửi thất bại' });
                        break; // Stop sending remaining messages to this recipient
                    }
                    
                    // Track for dedup
                    const msgId = result.msgId || `bc_${Date.now()}_${j}`;
                    this.webSentMsgIds.add(msgId);
                    setTimeout(() => this.webSentMsgIds.delete(msgId), 30_000);
                }

                results.push({ threadId, success: true });
                console.log(`[ZaloService] Broadcast: sent ${messages.length} msg(s) to ${threadId} (${i + 1}/${recipientIds.length})`);
            } catch (err: any) {
                console.error(`[ZaloService] Broadcast failed for ${threadId}:`, err.message);
                results.push({ threadId, success: false, error: err.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        console.log(`[ZaloService] Broadcast complete: ${successCount} success, ${failedCount} failed`);

        return { results, successCount, failedCount, total: recipientIds.length };
    }

    // ═══════════════════════════════════
    // QUERY APIs: Lịch sử & Contacts
    // ═══════════════════════════════════

    /**
     * Lấy lịch sử tin nhắn Zalo theo thread (cursor-based pagination)
     */
    async getHistory(query: ZaloMessageQuery) {
        return zaloMessageRepo.findByThread(query);
    }

    /**
     * Tìm kiếm tin nhắn (full-text search)
     */
    async searchMessages(workspaceId: string, keyword: string, threadId?: string) {
        return zaloMessageRepo.searchMessages(workspaceId, keyword, { threadId });
    }

    /**
     * Danh sách khách hàng Zalo (contacts)
     */
    async getContacts(query: ZaloContactQuery) {
        return zaloContactRepo.findByWorkspace(query);
    }

    /**
     * Get Zalo friends list (from connected session) with search & pagination
     */
    async getFriends(workspaceId: string, options?: { search?: string; page?: number; limit?: number }) {
        // Find active Zalo account for this workspace
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            return { items: [], total: 0, connected: false };
        }

        const sessionId = (connected._id as unknown as string).toString();
        const convs = await getZaloConversations(sessionId);
        
        // Filter to friends only (user type, not groups)
        let friends = convs.filter(c => c.threadType === 'user');

        // Search filter
        if (options?.search) {
            const q = options.search.toLowerCase();
            friends = friends.filter(f => 
                f.displayName.toLowerCase().includes(q) || 
                f.threadId.includes(q)
            );
        }

        // Sort alphabetically
        friends.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

        const total = friends.length;
        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const start = (page - 1) * limit;
        const items = friends.slice(start, start + limit);

        return { items, total, connected: true };
    }

    /**
     * Backfill avatars for all existing Zalo conversations in workspace
     * Runs after Zalo session connects to fix conversations that were created before avatar fix
     */
    async backfillAvatars(workspaceId: string, accountId: string) {
        try {
            console.log(`[ZaloService] Starting avatar + alias backfill for workspace ${workspaceId}...`);
            const convs = await getZaloConversations(accountId);
            if (!convs || convs.length === 0) {
                console.log(`[ZaloService] No Zalo conversations found for backfill`);
                return;
            }

            // Fetch aliases (biệt danh / tên gọi nhớ) to merge with display names
            let aliasMap = new Map<string, string>();
            try {
                const aliases = await getZaloAliasList(accountId);
                aliasMap = new Map(aliases.map(a => [a.userId, a.alias]));
                if (aliasMap.size > 0) {
                    console.log(`[ZaloService] Loaded ${aliasMap.size} Zalo aliases for backfill`);
                }
            } catch { /* alias fetch is optional */ }

            const ConvModel = (await import('../conversation/repos/conversation.model')).ConversationModel;
            let updatedCount = 0;

            for (const conv of convs) {
                if (!conv.avatar && !conv.displayName && !aliasMap.has(conv.threadId)) continue;
                
                const visitorId = `zalo_${conv.threadId}`;
                
                // Prefer alias (biệt danh) > displayName from Zalo
                const alias = aliasMap.get(conv.threadId);
                const bestName = alias || conv.displayName;
                
                // Force-update ALL conversations for this visitor (refresh avatar + name)
                const updateFields: Record<string, any> = {};
                if (conv.avatar) {
                    updateFields['visitorInfo.avatar'] = conv.avatar;
                }
                if (bestName) {
                    updateFields['visitorInfo.name'] = bestName;
                }
                // Store alias separately in metadata for reference
                if (alias) {
                    updateFields['metadata.zaloAlias'] = alias;
                    updateFields['metadata.zaloOriginalName'] = conv.displayName || '';
                }
                
                if (Object.keys(updateFields).length === 0) continue;
                
                const result = await ConvModel.updateMany(
                    { visitorId },
                    { $set: updateFields }
                );
                if (result.modifiedCount > 0) updatedCount += result.modifiedCount;

                // Also update the Visitor model so avatar + name persists across new conversations
                try {
                    const VisitorModel = (await import('../conversation/repos/visitor.model')).VisitorModel;
                    const visitorUpdate: Record<string, any> = {};
                    if (conv.avatar) visitorUpdate['attributes.avatar'] = conv.avatar;
                    if (bestName) visitorUpdate.name = bestName;
                    if (alias) visitorUpdate['attributes.zaloAlias'] = alias;
                    if (Object.keys(visitorUpdate).length > 0) {
                        await VisitorModel.updateMany(
                            { visitorId },
                            { $set: visitorUpdate }
                        );
                    }
                } catch { /* silent — visitor model may not exist for all contacts */ }
            }

            console.log(`[ZaloService] Avatar + alias backfill complete: ${updatedCount} conversations updated (${aliasMap.size} aliases, ${convs.length} contacts)`);
        } catch (err) {
            console.error(`[ZaloService] Avatar backfill failed:`, err);
        }
    }

    /**
     * Xem chi tiết 1 contact
     */
    async getContact(workspaceId: string, zaloUserId: string) {
        return zaloContactRepo.findByZaloUserId(workspaceId, zaloUserId);
    }

    /**
     * Cập nhật thông tin contact (VD: thêm SĐT thủ công)
     */
    async updateContact(workspaceId: string, zaloUserId: string, data: { displayName?: string; phoneNumber?: string; metadata?: Record<string, any> }) {
        return zaloContactRepo.updateInfo(workspaceId, zaloUserId, data);
    }

    /**
     * Lấy tin nhắn mới nhất mỗi thread (cho danh sách hội thoại)
     */
    async getConversationSummaries(workspaceId: string) {
        return zaloMessageRepo.getLatestPerThread(workspaceId);
    }

    // ═══════════════════════════════════
    // HISTORICAL SYNC
    // ═══════════════════════════════════

    /**
     * In-memory sync job tracking
     */
    private syncJobs = new Map<string, SyncJobStatus>();

    /**
     * Đồng bộ toàn bộ lịch sử tin nhắn Zalo vào hệ thống
     * - Lấy danh sách conversations (friends + groups) 
     * - Fetch lịch sử tin nhắn cho mỗi thread
     * - Bulk upsert messages vào ZaloMessage collection
     * - Upsert contacts vào ZaloContact collection
     * - Route messages vào Inbox (conversationService)
     * - Trích xuất SĐT, email, link từ nội dung tin nhắn
     */
    async syncAllHistory(workspaceId: string): Promise<{ jobId: string }> {
        // Prevent duplicate syncs
        const existingJob = this.syncJobs.get(workspaceId);
        if (existingJob && existingJob.status === 'running') {
            return { jobId: workspaceId };
        }

        const job: SyncJobStatus = {
            status: 'running',
            startedAt: new Date().toISOString(),
            totalThreads: 0,
            processedThreads: 0,
            totalMessages: 0,
            newMessages: 0,
            totalContacts: 0,
            newContacts: 0,
            errors: [],
            currentThread: '',
        };
        this.syncJobs.set(workspaceId, job);

        // Run async in background
        this.runSync(workspaceId, job).catch(err => {
            job.status = 'error';
            job.errors.push(`Fatal: ${err.message}`);
            console.error(`[ZaloService] Sync fatal error:`, err);
        });

        return { jobId: workspaceId };
    }

    private async runSync(workspaceId: string, job: SyncJobStatus) {
        console.log(`[ZaloService] ⚡ Starting full history sync for workspace ${workspaceId}...`);

        // ── Find ALL connected accounts for this workspace ──
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connectedAccounts = accounts.filter(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (connectedAccounts.length === 0) {
            job.status = 'error';
            job.errors.push('No connected Zalo account found for this workspace');
            return;
        }
        console.log(`[ZaloService] Found ${connectedAccounts.length} connected account(s) to sync`);

        // Phone + Email regex for extraction
        const PHONE_RE = /(?:\+84|84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}/g;
        const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

        // Iterate over ALL connected accounts
        for (const connectedAccount of connectedAccounts) {
            const accountId = (connectedAccount._id as unknown as string).toString();
            console.log(`[ZaloService] Syncing account ${accountId} (${(connectedAccount as any).zaloName || 'unknown'})...`);

            // 1. Get all conversations using accountId
            let conversations: Awaited<ReturnType<typeof getZaloConversations>>;
            try {
                conversations = await getZaloConversations(accountId);
                job.totalThreads += conversations.length;
                console.log(`[ZaloService] Account ${accountId}: Found ${conversations.length} threads to sync`);
            } catch (err: any) {
                job.errors.push(`Account ${accountId}: Failed to get conversations: ${err.message}`);
                continue; // Skip this account, try next one
            }

        // 2. For each conversation, fetch history and save
        for (const conv of conversations) {
            job.currentThread = `${conv.displayName} (${conv.threadType})`;
            
            try {
                // Fetch messages from Zalo API — use accountId as sessionId
                const messages = await getZaloMessages(accountId, conv.threadId, conv.threadType, 200);
                
                if (messages.length === 0) {
                    job.processedThreads++;
                    continue;
                }

                // Prepare bulk upsert data for ZaloMessage collection
                const msgDocs = messages.map((m: any) => ({
                    workspaceId,
                    threadId: conv.threadId,
                    threadType: conv.threadType,
                    msgId: m.id || `sync_${conv.threadId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    senderId: m.senderId || (m.senderType === 'me' ? 'self' : 'unknown'),
                    senderName: m.senderName || conv.displayName,
                    content: m.content || '',
                    msgType: m.type || 'text',
                    attachmentUrl: m.attachmentUrl,
                    thumbUrl: m.thumbUrl,
                    isSelf: m.senderType === 'me',
                    timestamp: new Date(m.createdAt || Date.now()),
                }));

                // Bulk save messages to ZaloMessage collection
                const savedCount = await zaloMessageRepo.saveMany(msgDocs);
                job.totalMessages += messages.length;
                job.newMessages += savedCount;

                // ── Route to Inbox: create/update conversations for each historical message ──
                // Sort messages chronologically (oldest first) so conversation timeline is correct
                const sortedMessages = [...messages]
                    .sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

                for (const m of sortedMessages) {
                    try {
                        const senderId = m.senderId || '';
                        const isSelf = m.senderType === 'me';
                        const isGroupMsg = conv.threadType === 'group';

                        // Re-use same key logic as real-time handleMessage
                        const conversationKey = isGroupMsg ? conv.threadId
                            : (isSelf ? conv.threadId : senderId);
                        const conversationName = isGroupMsg
                            ? (conv.displayName || `Nhóm ${conv.threadId}`)
                            : (conv.displayName || m.senderName || `Zalo User ${senderId}`);

                        const msgType: 'text' | 'image' | 'video' | 'file' = 
                            (m.type === 'image' || m.type === 'media') ? 'image'
                            : m.type === 'video' ? 'video'
                            : m.type === 'file' ? 'file'
                            : 'text';

                        let attachments: any[] = [];
                        if (m.attachmentUrl) {
                            attachments.push({
                                url: m.attachmentUrl,
                                name: `Zalo ${msgType}`,
                                size: 0,
                                mimeType: msgType === 'image' ? 'image/jpeg' : 'application/octet-stream',
                            });
                        }

                        const contentText = m.content || (attachments.length ? '[Đính kèm]' : '');
                        const clientMsgId = m.id || `sync_${conv.threadId}_${Date.now()}`;

                        if (isSelf) {
                            await conversationService.handleSelfZaloMessage(
                                workspaceId, conversationKey, conversationName,
                                conv.avatar || '', contentText, msgType, attachments, clientMsgId,
                            );
                        } else {
                            await conversationService.handleIncomingZaloMessage(
                                workspaceId, conversationKey, conversationName,
                                conv.avatar || '', contentText, msgType, attachments, clientMsgId,
                                isGroupMsg ? (m.senderName || `Thành viên ${senderId.slice(-6)}`) : undefined,
                            );
                        }
                    } catch (err: any) {
                        // Don't let individual message errors stop the sync
                        // Duplicate msgId errors are expected and fine
                    }
                }

                // Extract contact data from non-self messages
                const contactsMap = new Map<string, {
                    name: string;
                    phones: Set<string>;
                    emails: Set<string>;
                    lastMsg: string;
                    msgCount: number;
                }>();

                for (const m of messages) {
                    if (m.senderType === 'me') continue;
                    const senderId = m.senderId || '';
                    if (!senderId || senderId === 'unknown') continue;

                    let contact = contactsMap.get(senderId);
                    if (!contact) {
                        contact = { name: m.senderName || '', phones: new Set(), emails: new Set(), lastMsg: '', msgCount: 0 };
                        contactsMap.set(senderId, contact);
                    }
                    contact.msgCount++;
                    if (m.senderName) contact.name = m.senderName;
                    if (m.content) {
                        contact.lastMsg = m.content.substring(0, 100);
                        // Extract phones and emails
                        const phoneMatches = m.content.match(PHONE_RE);
                        if (phoneMatches) phoneMatches.forEach((p: string) => contact!.phones.add(p));
                        const emailMatches = m.content.match(EMAIL_RE);
                        if (emailMatches) emailMatches.forEach((e: string) => contact!.emails.add(e.toLowerCase()));
                    }
                }

                // Upsert contacts
                for (const [senderId, data] of contactsMap) {
                    try {
                        const metadata: Record<string, any> = {};
                        if (data.emails.size > 0) metadata.emails = [...data.emails];
                        if (data.phones.size > 0) metadata.extractedPhones = [...data.phones];

                        await zaloContactRepo.upsert({
                            workspaceId,
                            zaloUserId: senderId,
                            displayName: data.name,
                            avatar: conv.avatar,
                            phoneNumber: data.phones.size > 0 ? [...data.phones][0] : undefined,
                            source: conv.threadType === 'group' ? 'group' : 'stranger',
                            lastMessagePreview: data.lastMsg,
                            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                        });
                        job.totalContacts++;
                        job.newContacts++;
                    } catch (err: any) {
                        job.errors.push(`Contact ${senderId}: ${err.message}`);
                    }
                }

                // Also upsert the thread owner as a contact (for DMs)
                if (conv.threadType === 'user') {
                    try {
                        await zaloContactRepo.upsert({
                            workspaceId,
                            zaloUserId: conv.threadId,
                            displayName: conv.displayName,
                            avatar: conv.avatar,
                            source: 'friend',
                            lastMessagePreview: messages[0]?.content?.substring(0, 100) || '',
                        });
                    } catch { /* silent */ }
                }

            } catch (err: any) {
                job.errors.push(`Thread ${conv.threadId} (${conv.displayName}): ${err.message}`);
                console.warn(`[ZaloService] Sync error for thread ${conv.threadId}:`, err.message);
            }

            job.processedThreads++;

            // Rate limit: small delay between threads to avoid 429
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        } // end for each connected account

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.currentThread = '';
        console.log(`[ZaloService] ✅ Sync completed: ${job.totalMessages} messages, ${job.totalContacts} contacts, ${job.errors.length} errors`);
    }

    /**
     * Lấy trạng thái sync hiện tại
     */
    getSyncStatus(workspaceId: string): SyncJobStatus | null {
        return this.syncJobs.get(workspaceId) || null;
    }

    // ═══════════════════════════════════
    // GROUP MEMBERS
    // ═══════════════════════════════════

    /**
     * Lấy danh sách nhóm Zalo (live từ session)
     */
    async getGroups(workspaceId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            return { items: [], total: 0, connected: false };
        }
        const sessionId = (connected._id as unknown as string).toString();
        const groups = await getZaloGroups(sessionId);
        return { items: groups, total: groups.length, connected: true };
    }

    /**
     * Lấy danh sách thành viên 1 nhóm Zalo cụ thể
     */
    async getGroupMembers(workspaceId: string, groupId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            throw new AppError('Tài khoản Zalo chưa kết nối', 400, 'ZALO_NOT_CONNECTED');
        }
        const sessionId = (connected._id as unknown as string).toString();
        const members = await getZaloGroupMembers(sessionId, groupId);
        return { items: members, total: members.length, groupId };
    }

    /**
     * Xóa một thành viên khỏi nhóm Zalo (kick)
     */
    async kickGroupMember(workspaceId: string, groupId: string, userId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            throw new AppError('Tài khoản Zalo chưa kết nối', 400, 'ZALO_NOT_CONNECTED');
        }
        const sessionId = (connected._id as unknown as string).toString();
        const result = await removeZaloGroupMember(sessionId, groupId, userId);
        if (!result.success) {
            throw new AppError(result.error || 'Không thể xóa thành viên', 400, 'KICK_FAILED');
        }
        return { success: true, groupId, userId };
    }

    /**
     * Bulk sync ALL groups → extract members → import to Leads
     * Enriches with phone/email from chat history + contact data
     */
    async bulkSyncAllGroupsToLeads(workspaceId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            throw new AppError('Tài khoản Zalo chưa kết nối', 400, 'ZALO_NOT_CONNECTED');
        }
        const sessionId = (connected._id as unknown as string).toString();

        // 1. Get all groups
        const groups = await getZaloGroups(sessionId);
        console.log(`[ZaloService] BulkSync: found ${groups.length} groups for workspace ${workspaceId}`);

        let totalCreated = 0;
        let totalSkipped = 0;
        let totalMembers = 0;
        const groupResults: Array<{ groupId: string; groupName: string; members: number; created: number; skipped: number }> = [];

        // 2. Build phone/email lookup from contact data + zaloContactRepo
        const contactInfoMap = new Map<string, { phone: string; email: string }>();
        try {
            // From contactDataStore (realtime extracted data)
            const { getAllContactData } = await import('../../infra/zaloService');
            const allContactData = getAllContactData(sessionId);
            for (const cd of allContactData) {
                if (cd.phones.length > 0 || cd.emails.length > 0) {
                    contactInfoMap.set(cd.threadId, {
                        phone: cd.phones[0] || '',
                        email: cd.emails[0] || '',
                    });
                }
            }
        } catch { /* silent */ }

        // From ZaloContact repo (persisted contact data)
        try {
            const dbContacts = await zaloContactRepo.findByWorkspace({ workspaceId, limit: 10000 });
            const contactItems = (dbContacts as any).items || dbContacts;
            if (Array.isArray(contactItems)) {
                for (const c of contactItems) {
                    if (c.phoneNumber && !contactInfoMap.has(c.zaloUserId)) {
                        contactInfoMap.set(c.zaloUserId, {
                            phone: c.phoneNumber || '',
                            email: '',
                        });
                    }
                }
            }
        } catch { /* silent */ }

        // 3. For each group: fetch members and bulk convert to leads
        for (const group of groups) {
            try {
                const members = await getZaloGroupMembers(sessionId, group.groupId);
                totalMembers += members.length;

                // Enrich members with phone data
                const enrichedMembers = members.map(m => {
                    const contactInfo = contactInfoMap.get(m.userId);
                    return {
                        userId: m.userId,
                        displayName: m.displayName || `Thành viên ${m.userId.slice(-6)}`,
                        avatar: m.avatar,
                        phone: contactInfo?.phone || '',
                        email: contactInfo?.email || '',
                    };
                });

                const result = await leadService.bulkConvertFromGroupEnriched(workspaceId, {
                    groupId: group.groupId,
                    groupName: group.name || `Nhóm ${group.groupId}`,
                    members: enrichedMembers,
                });

                totalCreated += result.created;
                totalSkipped += result.skipped;
                groupResults.push({
                    groupId: group.groupId,
                    groupName: group.name || group.groupId,
                    members: members.length,
                    created: result.created,
                    skipped: result.skipped,
                });

                console.log(`[ZaloService] BulkSync group "${group.name}": ${result.created} new, ${result.skipped} existing`);

                // Small delay between groups to avoid overloading
                await new Promise(r => setTimeout(r, 500));
            } catch (err: any) {
                console.error(`[ZaloService] BulkSync error for group ${group.groupId}:`, err.message);
                groupResults.push({
                    groupId: group.groupId,
                    groupName: group.name || group.groupId,
                    members: 0,
                    created: 0,
                    skipped: 0,
                });
            }
        }

        console.log(`[ZaloService] BulkSync complete: ${totalCreated} leads created, ${totalSkipped} skipped from ${groups.length} groups (${totalMembers} total members)`);

        return {
            totalGroups: groups.length,
            totalMembers,
            totalCreated,
            totalSkipped,
            groups: groupResults,
        };
    }

    // ═══════════════════════════════════
    // AUTO FRIEND REQUEST
    // ═══════════════════════════════════

    private autoFriendJobs = new Map<string, AutoFriendJobStatus>();

    /**
     * Auto kết bạn tất cả thành viên trong nhóm (anti-spam delay)
     */
    async autoFriendGroupMembers(
        workspaceId: string,
        groupId: string,
        message: string = 'Xin chào, mình muốn kết bạn!',
        options?: { delayMs?: number; selectedUserIds?: string[] }
    ): Promise<{ jobId: string }> {
        const jobId = `${workspaceId}_${groupId}`;
        const existing = this.autoFriendJobs.get(jobId);
        if (existing && existing.status === 'running') {
            return { jobId };
        }

        const job: AutoFriendJobStatus = {
            status: 'running',
            startedAt: new Date().toISOString(),
            groupId,
            totalMembers: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            alreadyFriends: 0,
            currentMember: '',
            errors: [],
        };
        this.autoFriendJobs.set(jobId, job);

        // Run async in background
        this.runAutoFriend(workspaceId, groupId, message, options || {}, job).catch(err => {
            job.status = 'error';
            job.errors.push(`Fatal: ${err.message}`);
        });

        return { jobId };
    }

    private async runAutoFriend(
        workspaceId: string,
        groupId: string,
        message: string,
        options: { delayMs?: number; selectedUserIds?: string[] },
        job: AutoFriendJobStatus
    ) {
        const delayMs = options.delayMs || 8000; // 8s between each to avoid spam
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
        if (!connected) {
            job.status = 'error';
            job.errors.push('No connected Zalo account');
            return;
        }
        const sessionId = (connected._id as unknown as string).toString();

        // Get group members
        const members = await getZaloGroupMembers(sessionId, groupId);
        // Get current friends to skip
        const friendIds = await getZaloFriendIds(sessionId);
        // Get own ID
        const ownId = connected.zaloId;

        let targetMembers = members;
        if (options.selectedUserIds?.length) {
            const selected = new Set(options.selectedUserIds);
            targetMembers = members.filter(m => selected.has(m.userId));
        }

        job.totalMembers = targetMembers.length;
        console.log(`[ZaloService] Auto-friend: ${targetMembers.length} members in group ${groupId}, ${friendIds.size} existing friends`);

        for (let i = 0; i < targetMembers.length; i++) {
            const member = targetMembers[i];
            job.currentMember = member.displayName || member.userId;

            // Skip self
            if (member.userId === ownId) {
                job.skipped++;
                continue;
            }

            // Skip already friended
            if (friendIds.has(member.userId)) {
                job.alreadyFriends++;
                job.skipped++;
                continue;
            }

            // Anti-spam delay
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            const result = await sendZaloFriendRequest(sessionId, member.userId, message);
            if (result.success) {
                job.sent++;
            } else {
                job.failed++;
                job.errors.push(`${member.displayName}: ${result.error}`);
            }
        }

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.currentMember = '';
        console.log(`[ZaloService] Auto-friend completed: sent=${job.sent}, skipped=${job.skipped}, failed=${job.failed}`);
    }

    getAutoFriendStatus(workspaceId: string, groupId?: string): AutoFriendJobStatus | null {
        if (groupId) {
            return this.autoFriendJobs.get(`${workspaceId}_${groupId}`) || null;
        }
        // Return latest job for workspace
        for (const [key, val] of this.autoFriendJobs) {
            if (key.startsWith(workspaceId)) return val;
        }
        return null;
    }

    // ═══════════════════════════════════
    // BEHAVIOR ANALYSIS
    // ═══════════════════════════════════

    /**
     * Phân tích hành vi thành viên nhóm dựa trên lịch sử tin nhắn
     * Trả về điểm tiềm năng: hot / warm / cold
     */
    async analyzeMemberBehavior(workspaceId: string, userId: string): Promise<MemberBehaviorAnalysis> {
        // Pull message history for this user
        const messages = await zaloMessageRepo.findByThread({
            workspaceId,
            threadId: userId,
            limit: 200,
        });

        const now = Date.now();
        const items = messages.items || [];
        const totalMessages = items.length;
        const incomingMsgs = items.filter((m: any) => !m.isSelf);
        const outgoingMsgs = items.filter((m: any) => m.isSelf);

        // Last active time
        const lastMsg = items[0];
        const lastActiveAt = lastMsg ? new Date(lastMsg.timestamp) : null;
        const daysSinceActive = lastActiveAt ? (now - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24) : 999;

        // Response rate: % of outgoing messages that got a reply within 24h
        let responseCount = 0;
        for (const out of outgoingMsgs) {
            const outTime = new Date(out.timestamp).getTime();
            const hasReply = incomingMsgs.some((inc: any) => {
                const incTime = new Date(inc.timestamp).getTime();
                return incTime > outTime && incTime - outTime < 24 * 60 * 60 * 1000;
            });
            if (hasReply) responseCount++;
        }
        const responseRate = outgoingMsgs.length > 0 ? Math.round((responseCount / outgoingMsgs.length) * 100) : 0;

        // Check for shared contact info (phone, email in messages)
        const PHONE_RE = /(?:\+84|84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}/g;
        const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
        let sharedPhone = false;
        let sharedEmail = false;
        const extractedPhones: string[] = [];
        const extractedEmails: string[] = [];
        for (const msg of incomingMsgs) {
            const content = (msg as any).content || '';
            const phones = content.match(PHONE_RE);
            const emails = content.match(EMAIL_RE);
            if (phones) { sharedPhone = true; extractedPhones.push(...phones); }
            if (emails) { sharedEmail = true; extractedEmails.push(...emails); }
        }

        // Is conversation starter: did the customer initiate the first message?
        const sortedByTime = [...items].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const isConversationStarter = sortedByTime.length > 0 && !sortedByTime[0].isSelf;

        // Engagement score (0-100)
        let engagementScore = 0;
        engagementScore += Math.min(totalMessages * 2, 30);  // message volume (max 30)
        engagementScore += Math.min(responseRate * 0.3, 25); // response rate (max 25)
        engagementScore += daysSinceActive < 3 ? 20 : daysSinceActive < 7 ? 10 : daysSinceActive < 30 ? 5 : 0; // recency (max 20)
        engagementScore += sharedPhone ? 10 : 0; // shared phone
        engagementScore += sharedEmail ? 5 : 0;  // shared email
        engagementScore += isConversationStarter ? 10 : 0; // initiated conversation
        engagementScore = Math.min(engagementScore, 100);

        // Potential level
        const potentialLevel: 'hot' | 'warm' | 'cold' = 
            engagementScore >= 60 ? 'hot' : engagementScore >= 30 ? 'warm' : 'cold';

        return {
            userId,
            totalMessages,
            incomingMessages: incomingMsgs.length,
            outgoingMessages: outgoingMsgs.length,
            lastActiveAt: lastActiveAt?.toISOString() || null,
            daysSinceActive: Math.round(daysSinceActive),
            responseRate,
            engagementScore,
            sharedContactInfo: sharedPhone || sharedEmail,
            sharedPhone,
            sharedEmail,
            extractedPhones: [...new Set(extractedPhones)],
            extractedEmails: [...new Set(extractedEmails)],
            isConversationStarter,
            potentialLevel,
            recommendation: potentialLevel === 'hot' 
                ? 'Lead nóng — Nên tư vấn ngay, khả năng chốt đơn cao'
                : potentialLevel === 'warm'
                ? 'Lead ấm — Cần nurture thêm, gửi thông tin sản phẩm'
                : 'Lead lạnh — Theo dõi, chưa có tín hiệu quan tâm rõ ràng',
        };
    }

    /**
     * Batch phân tích hành vi cho nhiều members
     */
    async batchAnalyzeMembers(workspaceId: string, userIds: string[]): Promise<MemberBehaviorAnalysis[]> {
        const results: MemberBehaviorAnalysis[] = [];
        for (const userId of userIds) {
            try {
                const analysis = await this.analyzeMemberBehavior(workspaceId, userId);
                results.push(analysis);
            } catch {
                results.push({
                    userId,
                    totalMessages: 0,
                    incomingMessages: 0,
                    outgoingMessages: 0,
                    lastActiveAt: null,
                    daysSinceActive: 999,
                    responseRate: 0,
                    engagementScore: 0,
                    sharedContactInfo: false,
                    sharedPhone: false,
                    sharedEmail: false,
                    extractedPhones: [],
                    extractedEmails: [],
                    isConversationStarter: false,
                    potentialLevel: 'cold',
                    recommendation: 'Chưa có dữ liệu',
                });
            }
        }
        return results;
    }
}

// ── Sync Job type ──
export interface SyncJobStatus {
    status: 'running' | 'completed' | 'error';
    startedAt: string;
    completedAt?: string;
    totalThreads: number;
    processedThreads: number;
    totalMessages: number;
    newMessages: number;
    totalContacts: number;
    newContacts: number;
    errors: string[];
    currentThread: string;
}

// ── Auto Friend Job type ──
export interface AutoFriendJobStatus {
    status: 'running' | 'completed' | 'error';
    startedAt: string;
    completedAt?: string;
    groupId: string;
    totalMembers: number;
    sent: number;
    skipped: number;
    failed: number;
    alreadyFriends: number;
    currentMember: string;
    errors: string[];
}

// ── Behavior Analysis type ──
export interface MemberBehaviorAnalysis {
    userId: string;
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    lastActiveAt: string | null;
    daysSinceActive: number;
    responseRate: number;
    engagementScore: number;
    sharedContactInfo: boolean;
    sharedPhone: boolean;
    sharedEmail: boolean;
    extractedPhones: string[];
    extractedEmails: string[];
    isConversationStarter: boolean;
    potentialLevel: 'hot' | 'warm' | 'cold';
    recommendation: string;
}

export const zaloService = new ZaloService();


