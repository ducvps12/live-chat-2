import { zaloAccountRepo } from './repos/zalo-account.repo';
import { zaloMessageRepo, ZaloMessageQuery } from './repos/zalo-message.repo';
import { zaloContactRepo, ZaloContactQuery } from './repos/zalo-contact.repo';
import { AppError } from '../../middlewares/errorHandler';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { conversationService } from '../conversation/conversation.service';
import { 
    createZaloSession, 
    restoreZaloSession, 
    destroyZaloSession, 
    sendZaloMsg,
    sendZaloImage, 
    getZaloConversations,
    getZaloMessages,
    ZaloIncomingMessage,
    isZaloSessionConnected
} from '../../infra/zaloService';

class ZaloService {
    // Map accountId → workspaceId for message routing
    private accountWorkspaceMap = new Map<string, string>();

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
                        (msg) => this.handleMessage(workspaceId, msg),
                        (err) => console.error(`[ZaloService] Account ${accountId} listener error:`, err)
                    );
                    console.log(`[ZaloService] Successfully booted account ${accountId} for workspace ${workspaceId}`);
                } catch (err) {
                    console.error(`[ZaloService] Failed to boot account ${accountId}:`, err);
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
                        if (duplicate) {
                            // Update existing account instead of creating duplicate
                            await zaloAccountRepo.update(duplicate._id as unknown as string, {
                                name, avatar, status: 'active'
                            });
                            // Migrate session from temp to accountId
                            const accountId = (duplicate._id as unknown as string).toString();
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
                            const accountId = (newAccount._id as unknown as string).toString();
                            this.accountWorkspaceMap.set(accountId, workspaceId);
                            console.log(`[ZaloService] Workspace ${workspaceId} linked NEW Zalo acc ${name} (${accountId})`);
                        }
                    } catch (err) {
                        console.error(`[ZaloService] Post QR-login setup failed for Workspace ${workspaceId}:`, err);
                    }
                },
                (msg) => this.handleMessage(workspaceId, msg),
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
     * Gắn Listener: Khi có tin nhắn Zalo tới -> Đẩy vào hệ thống NemarChat Socket/Conversation
     */
    private async handleMessage(workspaceId: string, message: ZaloIncomingMessage) {
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

        // ── Tin nhắn tự gửi: chỉ lưu DB, không route vào Inbox ──
        if (message.isSelf) {
            return;
        }

        console.log(`[ZaloService] Workspace ${workspaceId} received Zalo msg from ${message.senderId} (thread: ${message.threadId}, type: ${message.threadType})`);
        try {
            const senderId = message.senderId;
            const isGroupMsg = message.threadType === 'group';
            
            // For groups: use threadId as the conversation key (all members → 1 conversation)
            // For DMs: use senderId as the conversation key (1 person → 1 conversation)
            const conversationKey = isGroupMsg ? message.threadId : senderId;
            
            let conversationName = message.senderName || `Zalo User ${senderId}`;
            let avatar = '';
            let groupName = '';

            // Fetch conversation/group info from Zalo API for avatar & display name
            try {
                const convs = await getZaloConversations(workspaceId);
                const conv = convs.find(c => c.threadId === message.threadId);
                if (conv) {
                    if (conv.avatar) avatar = conv.avatar;
                    
                    if (isGroupMsg) {
                        // For groups: use group's displayName as conversation name
                        groupName = conv.displayName || `Nhóm ${message.threadId}`;
                        conversationName = groupName;
                    } else {
                        // For DMs: only use displayName as fallback when no sender name
                        if (!conversationName || conversationName === `Zalo User ${senderId}`) {
                            if (conv.displayName) conversationName = conv.displayName;
                        }
                    }
                    
                    // Update contact avatar
                    if (avatar && !isGroupMsg) {
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
                         name: 'Zalo Image',
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
                         name: 'Zalo Sticker',
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

            // Route to Inbox
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
        try {
            await zaloMessageRepo.saveMessage({
                workspaceId,
                threadId,
                threadType,
                msgId: result.msgId || `sent_${Date.now()}`,
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

        // 1. Get all conversations
        let conversations: Awaited<ReturnType<typeof getZaloConversations>>;
        try {
            conversations = await getZaloConversations(workspaceId);
            job.totalThreads = conversations.length;
            console.log(`[ZaloService] Found ${conversations.length} threads to sync`);
        } catch (err: any) {
            job.status = 'error';
            job.errors.push(`Failed to get conversations: ${err.message}`);
            return;
        }

        // Phone + Email regex for extraction
        const PHONE_RE = /(?:\+84|84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}/g;
        const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

        // 2. For each conversation, fetch history and save
        for (const conv of conversations) {
            job.currentThread = `${conv.displayName} (${conv.threadType})`;
            
            try {
                // Fetch messages from Zalo API
                const messages = await getZaloMessages(workspaceId, conv.threadId, conv.threadType, 100);
                
                if (messages.length === 0) {
                    job.processedThreads++;
                    continue;
                }

                // Prepare bulk upsert data
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

                // Bulk save messages
                const savedCount = await zaloMessageRepo.saveMany(msgDocs);
                job.totalMessages += messages.length;
                job.newMessages += savedCount;

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

export const zaloService = new ZaloService();

