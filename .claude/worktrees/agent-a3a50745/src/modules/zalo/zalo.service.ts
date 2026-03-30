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
    ZaloIncomingMessage,
    isZaloSessionConnected
} from '../../infra/zaloService';

class ZaloService {
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
                try {
                    await restoreZaloSession(
                        accountId,
                        (msg) => this.handleMessage(workspaceId, msg),
                        (err) => console.error(`[ZaloService] Account ${accountId} listener error:`, err)
                    );
                    console.log(`[ZaloService] Successfully booted background listener for account ${accountId}`);
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
        return new Promise((resolve, reject) => {
            let qrResolved = false;

            createZaloSession(
                workspaceId,
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

                        if (session.api?.fetchAccountInfo) {
                            const profile = await session.api.fetchAccountInfo() as any;
                            if (profile) {
                                name = profile.name || name;
                                avatar = profile.avatar || avatar;
                            }
                        }

                        // Xoá account cũ nếu có
                        const existing = await zaloAccountRepo.findByWorkspaceId(workspaceId);
                        for (const ex of existing) {
                            await zaloAccountRepo.delete(ex._id as unknown as string);
                        }

                        // Lưu vào database
                        await zaloAccountRepo.create({
                            workspaceId: new mongoose.Types.ObjectId(workspaceId),
                            zaloId: typeof zaloId === 'object' ? (zaloId as any).userId || (zaloId as any).uid : (zaloId as any),
                            name,
                            avatar,
                            imei: crypto.randomUUID(),
                            cookie: [],
                            userAgent: 'Mozilla/5.0',
                            status: 'active'
                        });

                        console.log(`[ZaloService] Workspace ${workspaceId} linked Zalo acc ${name}`);
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
     * Lấy trạng thái hiện tại
     */
    async getStatus(workspaceId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        const account = accounts[0];
        
        if (!account) {
            return { connected: false };
        }

        const isConnected = isZaloSessionConnected(workspaceId);
        return {
            connected: true,
            status: isConnected ? 'active' : 'disconnected',
            name: account.name,
            avatar: account.avatar,
            zaloId: account.zaloId,
            isOnline: isConnected
        };
    }

    /**
     * Ngắt kết nối Zalo khỏi Workspace
     */
    async disconnect(workspaceId: string) {
        const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
        if (accounts.length > 0) {
            await zaloAccountRepo.delete(accounts[0]._id as unknown as string);
        }

        await destroyZaloSession(workspaceId);
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

        console.log(`[ZaloService] Workspace ${workspaceId} received Zalo msg from ${message.senderId}`);
        try {
            const senderId = message.senderId;
            let name = message.senderName || `Zalo User ${senderId}`;
            let avatar = '';

            // Tối ưu: Lấy thật đầy đủ Avatar và Tên tuổi từ conversations
            try {
                const convs = await getZaloConversations(workspaceId);
                const conv = convs.find(c => c.threadId === message.threadId);
                if (conv) {
                    if (conv.avatar) avatar = conv.avatar;
                    if (conv.displayName && conv.displayName !== name) {
                        name = conv.displayName;
                    }
                    // Cập nhật avatar cho contact nếu có
                    if (avatar) {
                        try {
                            await zaloContactRepo.updateInfo(workspaceId, senderId, {
                                displayName: name,
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
            }

            // Route to Inbox
            await conversationService.handleIncomingZaloMessage(
                workspaceId,
                senderId,
                name,
                avatar,
                message.content || (attachments.length ? '[Đính kèm]' : ''),
                msgType,
                attachments,
                message.msgId
            );
        } catch (err) {
            console.error(`[ZaloService] Error handling incoming Zalo message for Workspace ${workspaceId}:`, err);
        }
    }

    /**
     * Core API để Frontend gửi tin nhắn qua Zalo (Reply lại khách)
     */
    async sendMessage(workspaceId: string, threadId: string, text: string, type: 'text' | 'image' | 'sticker' = 'text', attachmentUrl?: string) {
        if (!isZaloSessionConnected(workspaceId)) {
            throw new AppError('Tài khoản Zalo chưa kết nối hoặc đang offline', 400, 'ZALO_NOT_CONNECTED');
        }

        // Determine thread type
        let threadType: 'user' | 'group' = 'user';
        try {
            const convs = await getZaloConversations(workspaceId);
            const conv = convs.find(c => c.threadId === threadId);
            if (conv) threadType = conv.threadType;
        } catch {}

        let result;

        // Send image via zca-js if type is image and has attachment URL
        if (type === 'image' && attachmentUrl) {
            result = await sendZaloImage(workspaceId, threadId, threadType, attachmentUrl, text);
            if (!result.success) {
                throw new AppError(result.error || 'Lỗi gửi ảnh Zalo', 500, 'ZALO_SEND_FAILED');
            }
        } else {
            // Send text through robust infra
            result = await sendZaloMsg(workspaceId, threadId, threadType, text);
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
}

export const zaloService = new ZaloService();
