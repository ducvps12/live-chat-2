import { useState, useEffect, useCallback } from 'react'; // force reload
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
    Button, Tooltip, Badge, Spin, Empty, Tag, Input, Modal, Select,
    message, Popover, Form,
} from 'antd';
import {
    PlusOutlined, QrcodeOutlined, WifiOutlined, DisconnectOutlined,
    ExclamationCircleOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
    ArrowLeft, MessageSquare, Send, Paperclip, User, UserCheck, UserX,
    Users, Search, Filter, Clock, Check, CheckCheck, RotateCw, Zap,
    Smartphone, X as XIcon,
} from 'lucide-react';
import { httpClient } from '../../../lib/http/client';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { useTotalUnreadCount } from '../../../domains/conversation/conversation.hooks';
import { useQueryClient } from '@tanstack/react-query';
import { playNotificationSound } from '../../../utils/audio';
import { uploadService } from '../../../services/upload.service';
import io, { Socket } from 'socket.io-client';
import { useRef } from 'react';

// ── Types ──
interface ZaloAccount {
    _id: string;
    label: string;
    status: 'pending_login' | 'connected' | 'disconnected' | 'expired' | 'revoked';
    createdBy: { _id: string; name: string; email: string };
    controlledBy: { _id: string; name: string } | null;
    browserAlive: boolean;
    connectedAt: string | null;
    lastActiveAt: string;
    createdAt: string;
}

interface ZaloConversation {
    _id: string;
    contactName: string;
    contactAvatar?: string;
    lastMessage?: string;
    lastMessageAt?: string;
    unreadCount?: number;
    status: 'open' | 'pending' | 'closed';
    tags?: string[];
    assignedTo?: { _id: string; name: string } | null;
    threadId?: string;      // zca-js thread ID (stable Zalo ID)
    threadType?: 'user' | 'group'; // zca-js thread type
}

interface ZaloMessage {
    _id: string;
    conversationId: string;
    sender: { type: 'agent' | 'customer' | 'system'; name?: string };
    content: string;
    type: 'text' | 'image' | 'file';
    attachments?: Array<{ data: string; url?: string; filename: string; mimeType: string; size: number }>;
    attachmentUrl?: string;
    thumbUrl?: string;
    status?: 'sent' | 'delivered' | 'read' | 'error';
    createdAt: string;
}

// ── Zalo image URL detection & rendering ──
function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /photo-stal[\w-]*\.zdn\.vn\//i.test(url);
}

function renderZaloContent(content: string, isAgent: boolean) {
    if (!content) return null;

    const IMAGE_URL_RE = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp)(\?[^\s]*)?/gi;
    const ZALO_CDN_RE = /https?:\/\/photo-stal[\w-]*\.zdn\.vn\/[^\s]+/gi;
    const combinedRegex = new RegExp(`(${IMAGE_URL_RE.source}|${ZALO_CDN_RE.source})`, 'gi');
    const parts: Array<{ type: 'text' | 'image'; value: string }> = [];
    let lastIndex = 0;
    let match;

    combinedRegex.lastIndex = 0;
    while ((match = combinedRegex.exec(content)) !== null) {
        const url = match[0];
        if (!isImageUrl(url)) continue;

        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();
            if (text) parts.push({ type: 'text', value: text });
        }
        parts.push({ type: 'image', value: url });
        lastIndex = match.index + url.length;
    }

    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();
        if (text) parts.push({ type: 'text', value: text });
    }

    // No images found → plain text
    if (parts.every(p => p.type === 'text')) {
        return <div>{content}</div>;
    }

    return (
        <div>
            {parts.map((part, i) =>
                part.type === 'image' ? (
                    <img
                        key={i}
                        src={part.value}
                        alt="Zalo Image"
                        style={{
                            maxWidth: '100%',
                            maxHeight: 280,
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'block',
                            marginTop: i > 0 ? 6 : 0,
                            marginBottom: 4,
                        }}
                        onClick={() => window.open(part.value, '_blank')}
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const link = document.createElement('a');
                            link.href = part.value;
                            link.target = '_blank';
                            link.textContent = '🔗 ' + part.value;
                            link.style.color = isAgent ? '#e0e7ff' : '#6366f1';
                            link.style.fontSize = '12px';
                            link.style.wordBreak = 'break-all';
                            target.parentElement?.insertBefore(link, target);
                        }}
                    />
                ) : (
                    <div key={i}>{part.value}</div>
                )
            )}
        </div>
    );
}

// ── Constants ──
const ACCOUNT_STATUS: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pending_login: { color: 'orange', label: 'Chờ quét QR', icon: <QrcodeOutlined /> },
    connected: { color: 'green', label: 'Đã kết nối', icon: <WifiOutlined /> },
    disconnected: { color: 'red', label: 'Mất kết nối', icon: <DisconnectOutlined /> },
    expired: { color: 'default', label: 'Hết hạn', icon: <ExclamationCircleOutlined /> },
    revoked: { color: 'default', label: 'Đã thu hồi', icon: <DisconnectOutlined /> },
};

function timeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'vừa xong';
    if (diffMin < 60) return `${diffMin} phút`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} ngày`;
}

// ── Demo data for conversations (will be replaced when backend supports Zalo conversations) ──
const DEMO_CONVERSATIONS: ZaloConversation[] = [
    {
        _id: 'zc1', contactName: 'Nguyễn Văn A', lastMessage: 'Cho mình hỏi giá sản phẩm...', lastMessageAt: new Date(Date.now() - 120000).toISOString(),
        unreadCount: 2, status: 'open', tags: ['Khách mới'], assignedTo: null,
    },
    {
        _id: 'zc2', contactName: 'Trần Thị B', lastMessage: 'Cảm ơn bạn, mình đã nhận hàng', lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
        unreadCount: 0, status: 'open', tags: [], assignedTo: null,
    },
    {
        _id: 'zc3', contactName: 'Lê Hoàng C', lastMessage: 'Bao giờ hàng về shop?', lastMessageAt: new Date(Date.now() - 7200000).toISOString(),
        unreadCount: 1, status: 'pending', tags: ['VIP'], assignedTo: null,
    },
];

const DEMO_MESSAGES: ZaloMessage[] = [
    { _id: 'zm1', conversationId: 'zc1', sender: { type: 'customer', name: 'Nguyễn Văn A' }, content: 'Xin chào shop', type: 'text', status: 'read', createdAt: new Date(Date.now() - 300000).toISOString() },
    { _id: 'zm2', conversationId: 'zc1', sender: { type: 'agent', name: 'Nhân viên' }, content: 'Chào bạn! Mình có thể giúp gì ạ?', type: 'text', status: 'read', createdAt: new Date(Date.now() - 240000).toISOString() },
    { _id: 'zm3', conversationId: 'zc1', sender: { type: 'customer', name: 'Nguyễn Văn A' }, content: 'Cho mình hỏi giá sản phẩm XYZ ạ', type: 'text', status: 'delivered', createdAt: new Date(Date.now() - 120000).toISOString() },
];

export default function ZaloPersonalPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const socketRef = useRef<Socket | null>(null);

    const { data: meData, isLoading: meLoading } = useGetMe();
    const me = meData?.data;
    const token = typeof window !== 'undefined' ? localStorage.getItem('nemark_token') : null;

    // ── Account state ──
    const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'connected' | 'pending_login' | 'disconnected'>('all');
    const [loading, setLoading] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('Zalo cá nhân');

    // ── Conversation state ──
    const [conversations, setConversations] = useState<ZaloConversation[]>([]);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [convSearch, setConvSearch] = useState('');
    const [convStatusFilter, setConvStatusFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');

    // ── Message state ──
    const [messages, setMessages] = useState<ZaloMessage[]>([]);
    const [sending, setSending] = useState(false);

    // ── Scanning state ──
    const [scanningConvs, setScanningConvs] = useState(false);
    const scanningConvsRef = useRef(false);

    // Helper to keep ref in sync with state
    const setScanning = (val: boolean) => {
        scanningConvsRef.current = val;
        setScanningConvs(val);
    };
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Message loading state ──
    const [loadingMessages, setLoadingMessages] = useState(false);

    // ── Highlight conversations with new messages (auto-clears after 3s) ──
    const [highlightedConvIds, setHighlightedConvIds] = useState<Set<string>>(new Set());

    // ── QR display state ──
    const [qrFrameUrl, setQrFrameUrl] = useState<string | null>(null);
    const [showQr, setShowQr] = useState(false);
    const [qrLoading, setQrLoading] = useState(false);
    const checkLoginRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const queryClient = useQueryClient();
    const { data: unreadCounts } = useTotalUnreadCount(workspaceId as string, !!workspaceId && !!meData);
    const inboxUnreadCount = unreadCounts?.inboxUnread || 0;

    const fetchAccounts = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const res = await httpClient.get(`/external-sessions/${workspaceId}/sessions`);
            setAccounts(res.data.data || []);
        } catch { /* silent */ }
    }, [workspaceId]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    // ── Socket for session status updates ──
    useEffect(() => {
        if (!token || !workspaceId) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';
        const baseUrl = apiUrl.replace(/\/api$/, '');
        const socket = io(`${baseUrl}/remote`, {
            auth: { token },
            query: { workspaceId: workspaceId as string },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000,
        });
        socketRef.current = socket;

        // ── Main namespace socket for general notification sounds ──
        const mainSocket = io(baseUrl, {
            auth: { token },
            transports: ['websocket'],
        });
        mainSocket.on('connect', () => {
            mainSocket.emit('agent:join', { workspaceId });
        });
        mainSocket.on('conversation:updated', (data: any) => {
            const isFromVisitor = data.lastMessage?.sender?.type === 'visitor';
            // Play sound if a message arrives in the generic Inbox from a visitor while we are in Zalo page
            if (isFromVisitor) {
                playNotificationSound();
                queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId as string, 'unread-count'] });
            }
        });

        socket.on('session:status', () => fetchAccounts());
        socket.on('session:loginDetected', () => {
            message.success('Đăng nhập Zalo thành công!');
            setShowQr(false);
            setQrFrameUrl(null);
            setQrLoading(false);
            if (checkLoginRef.current) clearInterval(checkLoginRef.current);
            fetchAccounts();
        });

        // Listen for scraped Zalo conversations
        socket.on('zalo:conversations', (data: { conversations: any[]; error?: string; debug?: string; screenshot?: string }) => {
            const wasManualScan = scanningConvsRef.current;
            setScanning(false);
            if (data.error) {
                console.warn('[Zalo] Conversation scrape error:', data.error);
                if (data.debug) {
                    console.log('[Zalo] Debug DOM info:\n', data.debug);
                }
                if (data.screenshot) {
                    console.log('[Zalo] Debug screenshot available — check modal or console');
                    // Show the screenshot in a modal so user can see what Puppeteer sees
                    Modal.info({
                        title: 'Debug: Trình duyệt Zalo đang hiển thị gì?',
                        width: 700,
                        content: (
                            <div>
                                <p style={{ color: '#666', marginBottom: 8 }}>
                                    Ảnh chụp màn hình từ trình duyệt Puppeteer (trình duyệt headless đang chạy phía server).
                                    Nếu trang chưa load xong hoặc đang ở trang login, hội thoại sẽ không quét được.
                                </p>
                                <img
                                    src={data.screenshot}
                                    alt="Puppeteer screenshot"
                                    style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8 }}
                                />
                                {data.debug && (
                                    <pre style={{ marginTop: 12, fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {data.debug}
                                    </pre>
                                )}
                            </div>
                        ),
                    });
                }
                if (wasManualScan) {
                    message.warning('Không quét được hội thoại: ' + data.error);
                }
                return;
            }
            const mapped: ZaloConversation[] = data.conversations.map((c: any) => ({
                _id: c._id || c.id || `zca_${c.threadId || Date.now()}`,
                contactName: c.contactName || c.displayName || 'Unknown',
                lastMessage: c.lastMessage || c.lastMsg || '',
                lastMessageAt: c.lastMessageAt || c.lastMsgTime || '',
                unreadCount: c.unreadCount || 0,
                status: 'open' as const,
                tags: [],
                assignedTo: null,
                contactAvatar: c.avatarUrl || c.avatar || '',
                threadId: c.threadId || '',
                threadType: c.threadType || 'user',
            }));
            setConversations(mapped);
            if (wasManualScan && mapped.length > 0) {
                message.success(`Đã tìm thấy ${mapped.length} hội thoại`);
            }
        });

        // Listen for scraped Zalo messages (live from zca-js)
        socket.on('zalo:messages', (data: { messages: any[]; error?: string }) => {
            setLoadingMessages(false);
            if (data.error) {
                console.warn('[Zalo] Message load error:', data.error);
                return;
            }
            if (!data.messages || data.messages.length === 0) return;

            const liveMessages: ZaloMessage[] = data.messages.map((m: any) => {
                const attachments: ZaloMessage['attachments'] = [];
                const imgUrl = m.attachmentUrl || m.thumbUrl;
                if (imgUrl) {
                    attachments.push({
                        data: imgUrl,
                        url: imgUrl,
                        filename: 'Zalo Image',
                        mimeType: 'image/jpeg',
                        size: 0,
                    });
                }
                return {
                    _id: m.id,
                    conversationId: 'active',
                    sender: { type: m.senderType === 'me' ? 'agent' as const : 'customer' as const, name: m.senderName },
                    content: m.content,
                    type: m.type || 'text',
                    attachments: attachments.length > 0 ? attachments : undefined,
                    attachmentUrl: m.attachmentUrl,
                    thumbUrl: m.thumbUrl,
                    status: 'read' as const,
                    createdAt: m.createdAt,
                };
            });

            // Merge live messages with existing DB-loaded messages (no duplicates)
            setMessages(prev => {
                const liveContentsForAgent = new Set(liveMessages.filter(m => m.sender.type === 'agent').map(m => m.content));
                
                // Clean prev from optimistic duplicates
                const cleanPrev = prev.filter(m => {
                    if ((m._id.startsWith('tmp_') || m._id.startsWith('real_') || m._id.startsWith('sent_')) && m.sender.type === 'agent') {
                        // If live messages already contain this content, drop the optimistic one
                        return !liveContentsForAgent.has(m.content);
                    }
                    return true;
                });

                const existingIds = new Set(cleanPrev.map(m => m._id));
                const newOnes = liveMessages.filter(m => !existingIds.has(m._id));
                if (newOnes.length === 0 && cleanPrev.length === prev.length) return prev; // nothing new
                
                // Merge + sort by createdAt
                const merged = [...cleanPrev, ...newOnes].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                return merged;
            });
        });

        // ── Realtime: listen for new Zalo messages pushed via WebSocket intercept ──
        socket.on('zalo:newMessage', (msg: any) => {
            console.log('[ZaloRT] New realtime message:', msg);
            const attachments: ZaloMessage['attachments'] = [];
            const imgUrl = msg.attachmentUrl || msg.thumbUrl;
            if (imgUrl) {
                attachments.push({
                    data: imgUrl,
                    url: imgUrl,
                    filename: 'Zalo Image',
                    mimeType: 'image/jpeg',
                    size: 0,
                });
            }

            const newMsg: ZaloMessage = {
                _id: msg.msgId || `rt_${Date.now()}`,
                conversationId: msg.conversationId || 'active',
                sender: {
                    type: msg.senderId ? 'customer' as const : 'agent' as const,
                    name: msg.senderName || 'Khách',
                },
                content: msg.content || '',
                type: msg.msgType || 'text',
                attachments: attachments.length > 0 ? attachments : undefined,
                attachmentUrl: msg.attachmentUrl,
                thumbUrl: msg.thumbUrl,
                status: 'delivered' as const,
                createdAt: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
            };
            // Append without duplicates
            setMessages(prev => {
                const exists = prev.some(m => m._id === newMsg._id);
                if (exists) return prev;
                
                // Deduplicate optimistic message
                let cleanPrev = prev;
                if (newMsg.sender.type === 'agent') {
                    const optIdx = prev.findIndex(m => 
                        (m._id.startsWith('tmp_') || m._id.startsWith('real_') || m._id.startsWith('sent_')) 
                        && m.content === newMsg.content
                    );
                    if (optIdx !== -1) {
                        cleanPrev = [...prev];
                        cleanPrev.splice(optIdx, 1);
                    }
                }
                
                return [...cleanPrev, newMsg];
            });

            // Move conversation to top + update lastMessage/lastMessageAt
            const threadId = msg.conversationId || msg.threadId || '';
            if (threadId) {
                setConversations(prev => {
                    const idx = prev.findIndex(c => c.threadId === threadId || c._id === `zca_${threadId}`);
                    if (idx < 0) return prev;
                    const updated = [...prev];
                    const [conv] = updated.splice(idx, 1);
                    conv.lastMessage = (msg.content || '').substring(0, 80);
                    conv.lastMessageAt = new Date().toISOString();
                    if (!msg.isSelf) {
                        conv.unreadCount = (conv.unreadCount || 0) + 1;
                    }
                    return [conv, ...updated];
                });

                // Highlight the conversation for 3 seconds
                if (!msg.isSelf) {
                    const convId = `zca_${threadId}`;
                    setHighlightedConvIds(prev => new Set(prev).add(convId));
                    setTimeout(() => {
                        setHighlightedConvIds(prev => {
                            const next = new Set(prev);
                            next.delete(convId);
                            return next;
                        });
                    }, 3000);
                }
            }

            // Show notification for incoming messages
            if (newMsg.sender.type === 'customer') {
                playNotificationSound();
                message.info(`Tin nhắn mới từ ${newMsg.sender.name}: ${newMsg.content.substring(0, 30)}...`);
            }
        });

        // ── zca-js events (native Zalo API) ──
        socket.on('zalo:zcaConnected', ({ sessionId: sid }: { sessionId: string }) => {
            console.log(`[ZaloZCA] Session ${sid} connected via thành công`);
            // message.success('Đã kết nối Zalo!'); // Removed to prevent spamming on page load
            // Don't call fetchAccounts() here — it triggers accounts state change
            // which re-runs the auto-restore effect and causes infinite loop.
            // Conversations are fetched below instead.
            setShowQr(false);
            setQrFrameUrl(null);
            setQrLoading(false);
            setScanning(true);
            socket.emit('zalo:join', { sessionId: sid });
            setTimeout(() => {
                socket.emit('zalo:getConversations', { sessionId: sid });
            }, 1000);
        });

        socket.on('zalo:zcaError', ({ sessionId: sid, error }: { sessionId: string; error: string }) => {
            console.error(`[ZaloZCA] Error for session ${sid}:`, error);
            // Don't show toast for expected restore failures (user will see QR instead)
            if (!error.includes('session đã lưu') && !error.includes('quét QR')) {
                message.error('Lỗi kết nối zca-js: ' + error);
            }
        });

        socket.on('zalo:qrCode', ({ qrDataUrl }: { sessionId: string; qrDataUrl: string }) => {
            console.log('[ZaloZCA] Received QR code for login');
            // Display QR code to user
            setQrFrameUrl(qrDataUrl);
            setQrLoading(false);
            setShowQr(true);
        });

        // Listen for QR code from zca-js (direct image, no browser screencast needed)
        // (already handled by zalo:qrCode listener above)

        return () => {
            mainSocket.disconnect();
            socket.disconnect();
            socketRef.current = null;
            if (checkLoginRef.current) clearInterval(checkLoginRef.current);
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        };
    }, [token, workspaceId, fetchAccounts]);

    // ── Scan conversations function ──
    const handleScanConversations = useCallback(() => {
        if (!selectedAccountId || !socketRef.current) return;
        const account = accounts.find(a => a._id === selectedAccountId);
        if (account?.status !== 'connected') return;
        setScanning(true);
        socketRef.current.emit('zalo:getConversations', { sessionId: selectedAccountId });
    }, [selectedAccountId, accounts]);

    // ── Load conversations when account changes ──
    const prevAccountIdRef = useRef<string | null>(null);
    useEffect(() => {
        // Only reset QR state when the selected account actually changes
        if (prevAccountIdRef.current !== selectedAccountId) {
            setShowQr(false);
            setQrFrameUrl(null);
            setQrLoading(false);
            if (checkLoginRef.current) { clearInterval(checkLoginRef.current); checkLoginRef.current = null; }
            prevAccountIdRef.current = selectedAccountId;
        }

        if (!selectedAccountId) {
            setConversations([]);
            setSelectedConvId(null);
            return;
        }
        const account = accounts.find(a => a._id === selectedAccountId);
        if (account?.status === 'connected' && socketRef.current) {
            // Join the remote session room to receive real-time push events (e.g. zalo:newMessage)
            socketRef.current.emit('zalo:join', { sessionId: selectedAccountId });
            
            // Auto-restore zca-js session (only once per account selection)
            socketRef.current.emit('zalo:restoreSession', { sessionId: selectedAccountId });
            setScanning(true);
            socketRef.current.emit('zalo:getConversations', { sessionId: selectedAccountId });
        } else {
            setConversations([]);
        }
        setSelectedConvId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAccountId]); // Only run when selectedAccountId changes, NOT on accounts change

    // ── Auto-poll conversations every 30s when account is connected ──
    useEffect(() => {
        // Clear any existing interval
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }

        const account = accounts.find(a => a._id === selectedAccountId);
        if (account?.status === 'connected' && selectedAccountId && socketRef.current) {
            scanIntervalRef.current = setInterval(() => {
                if (socketRef.current && selectedAccountId) {
                    socketRef.current.emit('zalo:getConversations', { sessionId: selectedAccountId });
                }
            }, 45000); // Re-scan every 45s
        }

        return () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
        };
    }, [selectedAccountId, accounts]);

    // ── Load messages when conversation changes ──
    useEffect(() => {
        if (!selectedConvId || !selectedAccountId) {
            setMessages([]);
            setLoadingMessages(false);
            return;
        }

        const conv = conversations.find(c => c._id === selectedConvId);
        if (!conv) return;

        const threadId = conv.threadId || '';
        const threadType = conv.threadType || 'user';

        setLoadingMessages(true);
        setMessages([]);

        // Step 1: Load from DB first (fast, reliable history)
        const loadFromDB = async () => {
            if (!threadId || !workspaceId) return;
            try {
                const res = await httpClient.get(
                    `/workspaces/${workspaceId}/zalo/history?threadId=${encodeURIComponent(threadId)}&limit=50`
                );
                const dbMessages: any[] = res.data?.data?.items || res.data?.items || [];
                if (dbMessages.length > 0) {
                    const mapped: ZaloMessage[] = dbMessages.map((m: any) => {
                        const imgUrl = m.attachmentUrl || m.thumbUrl;
                        const attachments: ZaloMessage['attachments'] = imgUrl ? [{
                            data: imgUrl, url: imgUrl, filename: 'Zalo Image', mimeType: 'image/jpeg', size: 0
                        }] : undefined;
                        return {
                            _id: m.msgId || m._id,
                            conversationId: 'active',
                            sender: {
                                type: m.isSelf ? 'agent' as const : 'customer' as const,
                                name: m.senderName || (m.isSelf ? 'Bạn' : 'Khách'),
                            },
                            content: m.content || '',
                            type: m.msgType || 'text',
                            attachments,
                            attachmentUrl: m.attachmentUrl,
                            thumbUrl: m.thumbUrl,
                            status: 'read' as const,
                            createdAt: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
                        };
                    });
                    // Sort oldest first
                    mapped.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    setMessages(mapped);
                    setLoadingMessages(false);
                }
            } catch (err) {
                console.warn('[ZaloHistory] DB load failed:', err);
            }
        };

        loadFromDB();

        // Step 2: Also fetch live from zca-js to get newest messages (will merge in listener)
        if (socketRef.current) {
            socketRef.current.emit('zalo:getMessages', {
                sessionId: selectedAccountId,
                contactName: conv.contactName,
                threadId,
                threadType,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedConvId, selectedAccountId]);

    // ── Auto-scroll only on new messages (not on initial load or poll) ──
    const prevMsgCountRef = useRef(0);
    useEffect(() => {
        // Only scroll if messages grew (new message arrived), not on full reload
        if (messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else if (prevMsgCountRef.current === 0 && messages.length > 0) {
            // First load: scroll to bottom immediately
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
        prevMsgCountRef.current = messages.length;
    }, [messages]);

    // ── Account CRUD ──
    const createAccount = async () => {
        try {
            setLoading(true);
            await httpClient.post(`/external-sessions/${workspaceId}/sessions`, { label: newLabel });
            message.success('Đã tạo tài khoản Zalo mới');
            setCreateModalOpen(false);
            setNewLabel('Zalo cá nhân');
            await fetchAccounts();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Không thể tạo tài khoản');
        } finally { setLoading(false); }
    };

    const reconnectAccount = async (accountId: string) => {
        try {
            await httpClient.post(`/external-sessions/${workspaceId}/sessions/${accountId}/reconnect`);
            message.success('Đang kết nối lại...');
            await fetchAccounts();
        } catch (err: any) { message.error(err.response?.data?.message || 'Kết nối lại thất bại'); }
    };

    // ── Show QR: start zca-js QR login (pure native, no Puppeteer) ──
    const handleShowQr = async (accountId: string) => {
        const socket = socketRef.current;
        if (!socket) return;

        setQrLoading(true);
        setShowQr(true);
        setQrFrameUrl(null);

        // Start zca-js QR login directly
        console.log('[QR] Starting zca-js QR login...');
        socket.emit('zalo:connectZCA', { sessionId: accountId });
    };

    const handleCloseQr = () => {
        // Stop retry loop
        if ((handleShowQr as any)._cleanup) {
            (handleShowQr as any)._cleanup();
            (handleShowQr as any)._cleanup = null;
        }
        setShowQr(false);
        setQrFrameUrl(null);
        setQrLoading(false);
        if (checkLoginRef.current) { clearInterval(checkLoginRef.current); checkLoginRef.current = null; }
    };

    const revokeAccount = async (accountId: string) => {
        Modal.confirm({
            title: 'Xóa tài khoản', content: 'Tài khoản Zalo sẽ bị ngắt kết nối vĩnh viễn. Tiếp tục?',
            okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await httpClient.delete(`/external-sessions/${workspaceId}/sessions/${accountId}`);
                    message.success('Đã xóa tài khoản');
                    if (selectedAccountId === accountId) setSelectedAccountId(null);
                    await fetchAccounts();
                } catch (err: any) { message.error(err.response?.data?.message || 'Thất bại'); }
            },
        });
    };

    // ── Send message ──
    const handleSend = async (text: string) => {
        if (!text.trim() || !selectedConvId || sending) return;
        setSending(true);

        // Optimistic: add temp message immediately for UX
        const tempMsg: ZaloMessage = {
            _id: 'tmp_' + Date.now(),
            conversationId: selectedConvId,
            sender: { type: 'agent', name: me?.user?.name || 'Agent' },
            content: text,
            type: 'text',
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);

        // Send via Zalo Web (Puppeteer)
        if (socketRef.current && selectedAccountId) {
            const activeConv = conversations.find(c => c._id === selectedConvId);
            socketRef.current.emit('zalo:sendMessage', {
                sessionId: selectedAccountId,
                text,
                contactName: activeConv?.contactName || '',
                threadId: activeConv?.threadId || '',
                threadType: activeConv?.threadType || 'user',
            });

            // Listen for send result
            const onSent = (data: { success: boolean; error?: string }) => {
                setSending(false);
                if (!data.success) {
                    message.error('Gửi tin nhắn thất bại: ' + (data.error || 'Lỗi không xác định'));
                    // Remove temp message on failure
                    setMessages(prev => prev.filter(m => m._id !== tempMsg._id));
                } else {
                    // Update temp message status
                    setMessages(prev => prev.map(m => m._id === tempMsg._id ? { ...m, _id: 'real_' + Date.now(), status: 'sent' as const } : m));
                }
                socketRef.current?.off('zalo:messageSent', onSent);
            };
            socketRef.current.on('zalo:messageSent', onSent);

            // Timeout fallback
            setTimeout(() => {
                socketRef.current?.off('zalo:messageSent', onSent);
                setSending(false);
            }, 10000);
        } else {
            message.error('Socket chưa kết nối');
            setSending(false);
        }
    };

    // ── Image upload and sending ──
    const handleImageSend = async (file: File) => {
        if (!selectedConvId || !socketRef.current || !selectedAccountId) return;
        const selectedConv = conversations.find(c => c._id === selectedConvId);

        try {
            setSending(true);
            const { url } = await uploadService.uploadImage(file);
            
            // Convert relative /uploads/... to absolute URL for Zalo backend to download
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
            const baseUrl = apiUrl.replace(/\/api$/, '');
            const absoluteImageUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
            
            socketRef.current.emit('zalo:sendMessage', {
                sessionId: selectedAccountId,
                threadId: selectedConvId,
                threadType: selectedConv?.threadType || 'user',
                text: '',
                imageUrl: absoluteImageUrl,
            });
            
            // Re-fetch messages after sending
            setTimeout(() => {
                socketRef.current?.emit('zalo:getMessages', {
                    sessionId: selectedAccountId,
                    threadId: selectedConvId,
                    threadType: selectedConv?.threadType || 'user',
                });
            }, 500);
            
            setSending(false);
        } catch (error) {
            message.error('Gửi ảnh thất bại');
            setSending(false);
        }
    };

    // (File upload and input change handlers moved to MessageComposer)

    // ── Derived state ──
    const selectedAccount = accounts.find(a => a._id === selectedAccountId);
    const selectedConv = conversations.find(c => c._id === selectedConvId);

    const filteredAccounts = accounts.filter(a => {
        if (a.status === 'revoked') return false;
        if (accountStatusFilter !== 'all' && a.status !== accountStatusFilter) return false;
        if (accountSearch) {
            const q = accountSearch.toLowerCase();
            return a.label.toLowerCase().includes(q) || (a.createdBy?.name || '').toLowerCase().includes(q);
        }
        return true;
    });

    const filteredConvs = conversations.filter(c => {       
        if (convStatusFilter !== 'all' && c.status !== convStatusFilter) return false;
        if (convSearch) {
            return c.contactName.toLowerCase().includes(convSearch.toLowerCase());
        }
        return true;
    });

    if (meLoading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
    }

    return (
        <>
            <Head>
                <title>Zalo Cá nhân | NemarChat</title>
            </Head>
            <style>{`
                @keyframes highlightPulse {
                    0% { background-color: rgba(99,102,241,0.15); }
                    50% { background-color: rgba(99,102,241,0.06); }
                    100% { background-color: rgba(99,102,241,0.15); }
                }
            `}</style>

            <div style={styles.container}>
                {/* ═══ COLUMN 1: Zalo Account Sidebar ═══ */}
                <div style={styles.accountSidebar} className="zalo-account-sidebar">
                    {/* Header */}
                    <div style={styles.sidebarHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button
                                type="text"
                                icon={<ArrowLeft size={18} />}
                                onClick={() => router.push(`/workspace/${workspaceId}`)}
                                style={{ padding: '4px 8px' }}
                            />
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#222' }}>
                                <Smartphone size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: '#0068ff' }} />
                                Zalo cá nhân
                            </h2>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tooltip title="Inbox">
                                <Button
                                    size="small"
                                    onClick={() => router.push(`/workspace/${workspaceId}/inbox`)}
                                    style={{
                                        background: '#6366f1', borderColor: '#6366f1', color: '#fff',
                                        fontWeight: 600, fontSize: 11, borderRadius: 6,
                                        padding: '2px 8px', height: 24,
                                    }}
                                >
                                    <MessageSquare size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    Inbox
                                </Button>
                            </Tooltip>
                            <Badge count={inboxUnreadCount} overflowCount={99} />
                            <Tooltip title="Thêm tài khoản">
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    size="small"
                                    onClick={() => setCreateModalOpen(true)}
                                    style={{ background: '#0068ff', borderColor: '#0068ff', borderRadius: 6 }}
                                />
                            </Tooltip>
                        </div>
                    </div>

                    {/* Search + Filter */}
                    <div style={styles.searchArea}>
                        <Input
                            prefix={<SearchOutlined style={{ color: '#999' }} />}
                            placeholder="Tìm tài khoản..."
                            value={accountSearch}
                            onChange={e => setAccountSearch(e.target.value)}
                            style={{ borderRadius: 8 }}
                            allowClear
                            size="small"
                        />
                        <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
                            {([
                                ['all', 'Tất cả'],
                                ['connected', 'Đã kết nối'],
                                ['pending_login', 'Chờ QR'],
                                ['disconnected', 'Mất kết nối'],
                            ] as const).map(([val, label]) => (
                                <Tag
                                    key={val}
                                    color={accountStatusFilter === val ? '#0068ff' : undefined}
                                    onClick={() => setAccountStatusFilter(val as any)}
                                    style={{ cursor: 'pointer', borderRadius: 10, padding: '1px 8px', margin: 0, fontSize: 11 }}
                                >
                                    {label}
                                </Tag>
                            ))}
                        </div>
                    </div>

                    {/* Account List */}
                    <div style={styles.accountList}>
                        {filteredAccounts.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={<span style={{ color: '#999', fontSize: 12 }}>Chưa có tài khoản Zalo</span>}
                                style={{ marginTop: 40 }}
                            />
                        ) : (
                            filteredAccounts.map(account => {
                                const cfg = ACCOUNT_STATUS[account.status] || { color: 'default', label: account.status, icon: null };
                                const isSelected = selectedAccountId === account._id;
                                return (
                                    <div
                                        key={account._id}
                                        onClick={() => setSelectedAccountId(account._id)}
                                        style={{
                                            ...styles.accountItem,
                                            ...(isSelected ? styles.accountItemActive : {}),
                                        }}
                                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fafbff'; }}
                                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            ...styles.accountAvatar,
                                            background: account.status === 'connected' ? '#e8f5e9' : '#f0f0ff',
                                        }}>
                                            <Smartphone size={16} color={account.status === 'connected' ? '#4caf50' : '#0068ff'} />
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={styles.accountName}>{account.label}</span>
                                                <span style={styles.accountTime}>{timeAgo(account.lastActiveAt)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                                                <span style={styles.accountOwner}>
                                                    <User size={10} style={{ marginRight: 3 }} />
                                                    {account.createdBy?.name || 'Chưa rõ'}
                                                </span>
                                                <Tag color={cfg.color} style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 6px', borderRadius: 8 }}>
                                                    {cfg.label}
                                                </Tag>
                                            </div>
                                        </div>

                                        {/* Quick actions on hover / selected */}
                                        {isSelected && (
                                            <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 4 }}>
                                                {['disconnected', 'expired'].includes(account.status) && (
                                                    <Tooltip title="Kết nối lại">
                                                        <Button size="small" type="text" icon={<ReloadOutlined style={{ fontSize: 12 }} />}
                                                            onClick={e => { e.stopPropagation(); reconnectAccount(account._id); }}
                                                        />
                                                    </Tooltip>
                                                )}
                                                <Tooltip title="Xóa">
                                                    <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                                                        onClick={e => { e.stopPropagation(); revokeAccount(account._id); }}
                                                    />
                                                </Tooltip>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ═══ COLUMN 2: Conversation List ═══ */}
                <div style={styles.convSidebar} className="zalo-conv-sidebar">
                    {selectedAccount ? (
                        selectedAccount.status === 'connected' ? (
                            <>
                                {/* Conv sidebar header */}
                                <div style={styles.convSidebarHeader}>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#222', flex: 1 }}>
                                        Hội thoại
                                        <span style={{ fontSize: 11, color: '#999', fontWeight: 400, marginLeft: 6 }}>
                                            {selectedAccount.label}
                                        </span>
                                    </div>
                                    <Tooltip title="Quét hội thoại từ Zalo">
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<ReloadOutlined spin={scanningConvs} />}
                                            loading={scanningConvs}
                                            onClick={handleScanConversations}
                                            style={{
                                                background: '#0068ff',
                                                borderColor: '#0068ff',
                                                borderRadius: 6,
                                                fontWeight: 600,
                                                fontSize: 11,
                                            }}
                                        >
                                            {scanningConvs ? 'Đang quét...' : 'Quét'}
                                        </Button>
                                    </Tooltip>
                                </div>

                                {/* Search + Filter */}
                                <div style={styles.searchArea}>
                                    <Input
                                        prefix={<Search size={13} color="#999" />}
                                        placeholder="Tìm theo tên khách..."
                                        value={convSearch}
                                        onChange={e => setConvSearch(e.target.value)}
                                        style={{ borderRadius: 8 }}
                                        allowClear
                                        size="small"
                                    />
                                    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                                        {([
                                            ['all', 'Tất cả'],
                                            ['open', 'Đang mở'],
                                            ['pending', 'Chờ xử lý'],
                                            ['closed', 'Đã đóng'],
                                        ] as const).map(([val, label]) => (
                                            <Tag
                                                key={val}
                                                color={convStatusFilter === val ? '#6366f1' : undefined}
                                                onClick={() => setConvStatusFilter(val as any)}
                                                style={{ cursor: 'pointer', borderRadius: 10, padding: '1px 10px', margin: 0, fontSize: 11 }}
                                            >
                                                {label}
                                            </Tag>
                                        ))}
                                    </div>
                                </div>

                                {/* Conversation list */}
                                <div style={styles.convList}>
                                    {scanningConvs && filteredConvs.length === 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 }}>
                                            <div className="zalo-scanner-pulse">
                                                <div className="zalo-dot"></div>
                                                <div className="zalo-dot"></div>
                                                <div className="zalo-dot"></div>
                                            </div>
                                            <span style={{ color: '#666', fontSize: 13 }}>Đang tải hội thoại từ Zalo...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {scanningConvs && (
                                                <div style={{ padding: '8px 12px', fontSize: 12, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6, background: '#eef2ff', borderBottom: '1px solid #e0e7ff' }}>
                                                    <Spin size="small" /> Đang đồng bộ...
                                                </div>
                                            )}
                                            {filteredConvs.length === 0 ? (
                                                <div style={{ textAlign: 'center', marginTop: 60 }}>
                                                    <Empty
                                                        description={
                                                            <div>
                                                                <p style={{ color: '#999', fontSize: 13, margin: '0 0 12px' }}>Không có hội thoại</p>
                                                                <Button
                                                                    type="primary"
                                                                    icon={<ReloadOutlined />}
                                                                    onClick={handleScanConversations}
                                                                    loading={scanningConvs}
                                                                    style={{ background: '#0068ff', borderColor: '#0068ff', borderRadius: 8 }}
                                                                >
                                                                    Quét hội thoại
                                                                </Button>
                                                            </div>
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                        filteredConvs.map(conv => {
                                            const isSelected = selectedConvId === conv._id;
                                            const isHighlighted = highlightedConvIds.has(conv._id);
                                            return (
                                                <div
                                                    key={conv._id}
                                                    onClick={() => {
                                                        setSelectedConvId(conv._id);
                                                        // Clear unread count when selected
                                                        setConversations(prev => prev.map(c =>
                                                            c._id === conv._id ? { ...c, unreadCount: 0 } : c
                                                        ));
                                                        // Remove highlight
                                                        setHighlightedConvIds(prev => {
                                                            const next = new Set(prev);
                                                            next.delete(conv._id);
                                                            return next;
                                                        });
                                                    }}
                                                    style={{
                                                        ...styles.convItem,
                                                        ...(isSelected ? styles.convItemActive : {}),
                                                        ...(isHighlighted && !isSelected ? {
                                                            background: 'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 100%)',
                                                            borderLeft: '3px solid #6366f1',
                                                            animation: 'highlightPulse 1.5s ease-in-out 2',
                                                        } : {}),
                                                    }}
                                                >
                                                    <div style={styles.convAvatar}>
                                                        <User size={18} color="#6366f1" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={styles.convName}>{conv.contactName}</span>
                                                            <span style={styles.convTime}>
                                                                {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                                            <span style={{
                                                                ...styles.convPreview,
                                                                fontWeight: conv.unreadCount ? 600 : 400,
                                                                color: conv.unreadCount ? '#111' : '#666',
                                                            }}>
                                                                {conv.lastMessage || 'Hội thoại mới'}
                                                            </span>
                                                            {conv.unreadCount ? (
                                                                <Badge count={conv.unreadCount} style={{ backgroundColor: '#ef4444' }} />
                                                            ) : (
                                                                <Tag
                                                                    color={conv.status === 'open' ? 'green' : conv.status === 'pending' ? 'orange' : 'default'}
                                                                    style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 8, margin: 0 }}
                                                                >
                                                                    {conv.status === 'open' ? 'Mở' : conv.status === 'pending' ? 'Chờ' : 'Đóng'}
                                                                </Tag>
                                                            )}
                                                        </div>
                                                        {conv.tags && conv.tags.length > 0 && (
                                                            <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                                                                {conv.tags.slice(0, 3).map(t => (
                                                                    <Tag key={t} style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', borderRadius: 6, margin: 0 }}>{t}</Tag>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {conv.assignedTo && (
                                                            <div style={{ fontSize: 10, color: '#10b981', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                <UserCheck size={10} />
                                                                {conv.assignedTo.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* ── Onboarding / Not Connected State ── */
                            <div style={styles.onboardingState}>
                                <div style={styles.onboardingCard}>
                                    <div style={{
                                        width: 64, height: 64, borderRadius: 32,
                                        background: selectedAccount.status === 'pending_login' ? '#fff7ed' : '#fef2f2',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginBottom: 16,
                                    }}>
                                        {selectedAccount.status === 'pending_login'
                                            ? <QrcodeOutlined style={{ fontSize: 28, color: '#f97316' }} />
                                            : <DisconnectOutlined style={{ fontSize: 28, color: '#ef4444' }} />
                                        }
                                    </div>

                                    <div style={{ fontWeight: 700, fontSize: 16, color: '#222', marginBottom: 4 }}>
                                        {selectedAccount.label}
                                    </div>

                                    <Tag
                                        color={ACCOUNT_STATUS[selectedAccount.status]?.color}
                                        style={{ fontSize: 12, padding: '2px 12px', borderRadius: 12, marginBottom: 16 }}
                                    >
                                        {ACCOUNT_STATUS[selectedAccount.status]?.label}
                                    </Tag>

                                    {selectedAccount.status === 'pending_login' && (
                                        <>
                                            {showQr ? (
                                                /* QR button in loading/active state */
                                                <Button
                                                    type="default"
                                                    onClick={handleCloseQr}
                                                    style={{ borderRadius: 8, marginBottom: 16 }}
                                                    block
                                                >
                                                    Đóng mã QR
                                                </Button>
                                            ) : (
                                                /* Show QR button */
                                                <Button
                                                    type="primary"
                                                    icon={<QrcodeOutlined />}
                                                    onClick={() => selectedAccountId && handleShowQr(selectedAccountId)}
                                                    size="large"
                                                    style={{ borderRadius: 8, fontWeight: 600, height: 48, fontSize: 15, marginBottom: 16 }}
                                                    block
                                                >
                                                    Hiển thị mã QR
                                                </Button>
                                            )}

                                            <div style={styles.onboardingSteps}>
                                                <div style={styles.onboardingStep}>
                                                    <span style={styles.stepNumber}>1</span>
                                                    Mở ứng dụng Zalo trên điện thoại
                                                </div>
                                                <div style={styles.onboardingStep}>
                                                    <span style={styles.stepNumber}>2</span>
                                                    Vào mục <b>Thêm</b> &gt; <b>Quét mã QR</b>
                                                </div>
                                                <div style={styles.onboardingStep}>
                                                    <span style={styles.stepNumber}>3</span>
                                                    Quét mã QR hiện trên màn hình
                                                </div>
                                                <div style={styles.onboardingStep}>
                                                    <span style={styles.stepNumber}>4</span>
                                                    Xác nhận đăng nhập trên điện thoại
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {['disconnected', 'expired'].includes(selectedAccount.status) && (
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={() => reconnectAccount(selectedAccount._id)}
                                            style={{ background: '#0068ff', borderColor: '#0068ff', borderRadius: 8 }}
                                        >
                                            Kết nối lại
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    ) : (
                        <div style={styles.emptyColumn}>
                            <Smartphone size={40} color="#ccc" strokeWidth={1.5} />
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginTop: 12 }}>
                                Chọn tài khoản Zalo
                            </div>
                            <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
                                từ danh sách bên trái
                            </div>
                        </div>
                    )}
                </div>

                {/* ═══ COLUMN 3: Chat Panel ═══ */}
                <div style={styles.chatPanel} className="zalo-chat-panel">
                    {selectedConvId && selectedConv ? (
                        <>
                            {/* Chat header */}
                            <div style={styles.chatHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Button
                                        type="text"
                                        icon={<ArrowLeft size={18} />}
                                        onClick={() => setSelectedConvId(null)}
                                        className="zalo-mobile-back"
                                        style={{ display: 'none' }}
                                    />
                                    <div style={styles.chatAvatar}>
                                        <User size={18} color="#fff" />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#222' }}>{selectedConv.contactName}</div>
                                        <div style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Tag color="blue" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 6px', borderRadius: 6 }}>
                                                Zalo
                                            </Tag>
                                            <span>qua {selectedAccount?.label}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {selectedConv.status === 'open' && (
                                        <>
                                            <Tooltip title="Chờ xử lý">
                                                <Button size="small" style={{ color: '#f59e0b', borderColor: '#f59e0b' }} icon={<Clock size={14} />}>
                                                    Chờ
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Đóng hội thoại">
                                                <Button size="small" danger icon={<XIcon size={14} />}>
                                                    Đóng
                                                </Button>
                                            </Tooltip>
                                        </>
                                    )}
                                    {selectedConv.status === 'closed' && (
                                        <Button size="small" type="primary" style={{ background: '#10b981', border: 'none' }}>
                                            Mở lại
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={styles.messagesArea}>
                                {loadingMessages && messages.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 }}>
                                        <Spin size="default" />
                                        <span style={{ color: '#666', fontSize: 13 }}>Đang tải tin nhắn từ Zalo...</span>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <Empty description="Chưa có tin nhắn" style={{ marginTop: 80 }} />
                                ) : (
                                    <>
                                        {messages.map(msg => {
                                            const isAgent = msg.sender.type === 'agent';
                                            const isSystem = msg.sender.type === 'system';

                                            if (isSystem) {
                                                return (
                                                    <div key={msg._id} style={styles.systemMsg}>
                                                        {msg.content}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={msg._id}
                                                    id={`msg-${msg._id}`}
                                                    style={{
                                                        ...styles.msgRow,
                                                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            ...styles.msgBubble,
                                                            ...(isAgent ? styles.msgAgent : styles.msgCustomer),
                                                            ...(msg._id.startsWith('tmp_') ? { opacity: 0.6 } : {}),
                                                        }}
                                                    >
                                                        {/* Attachments */}
                                                        {msg.attachments?.map((att, i) => {
                                                            const src = att.url || att.data;
                                                            return (
                                                                <div key={i} style={{ marginBottom: msg.content ? 6 : 0 }}>
                                                                    {att.mimeType?.startsWith('image/') || isImageUrl(src || '') ? (
                                                                        <img src={src} alt={att.filename || 'Image'} style={styles.msgImage}
                                                                            onClick={() => window.open(src, '_blank')} />
                                                                    ) : (
                                                                        <a href={src} download={att.filename} style={styles.fileLink}>
                                                                            📎 {att.filename}
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Text — auto-detect and render image URLs inline */}
                                                        {msg.content && renderZaloContent(msg.content, isAgent)}
                                                        {/* Time + Status */}
                                                        <div style={styles.msgTime}>
                                                            {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                            {isAgent && msg.sender.name && <span> · {msg.sender.name}</span>}
                                                            {isAgent && (
                                                                <span style={{ marginLeft: 4 }}>
                                                                    {msg.status === 'error' ? (
                                                                        <RotateCw size={12} color="#ff4d4f" style={{ cursor: 'pointer' }} />
                                                                    ) : msg._id.startsWith('tmp_') ? (
                                                                        <Clock size={12} color="#9ca3af" />
                                                                    ) : msg.status === 'read' ? (
                                                                        <CheckCheck size={14} color="#3b82f6" />
                                                                    ) : msg.status === 'delivered' ? (
                                                                        <CheckCheck size={14} color="#9ca3af" />
                                                                    ) : (
                                                                        <Check size={14} color="#9ca3af" />
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Composer */}
                            <MessageComposer sending={sending} onSend={handleSend} onImageSend={handleImageSend} />
                        </>
                    ) : (
                        <div style={styles.emptyColumn}>
                            <MessageSquare size={48} color="#ddd" strokeWidth={1.5} />
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#888', marginTop: 12 }}>
                                Chọn một hội thoại
                            </div>
                            <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
                                để bắt đầu trò chuyện
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Create Account Modal ═══ */}
            <Modal
                title="Thêm tài khoản Zalo cá nhân"
                open={createModalOpen}
                onOk={createAccount}
                onCancel={() => setCreateModalOpen(false)}
                confirmLoading={loading}
                okText="Thêm tài khoản"
                cancelText="Hủy"
            >
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.6 }}>
                        Sau khi tạo tài khoản, bạn sẽ cần quét mã QR trên điện thoại để kết nối Zalo.
                        Tất cả tin nhắn Zalo sẽ được đồng bộ vào hệ thống inbox.
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Tên tài khoản</div>
                    <Input
                        placeholder="VD: Zalo Anh Minh, Zalo Shop ABC..."
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        style={{ borderRadius: 8 }}
                    />
                </div>
            </Modal>

            {/* ═══ QR Code Popup Modal ═══ */}
            <Modal
                title={null}
                open={showQr}
                footer={null}
                onCancel={handleCloseQr}
                centered
                width={680}
                styles={{
                    body: { padding: '32px 24px', textAlign: 'center' as const },
                }}
                destroyOnClose
            >
                <div style={{ marginBottom: 16 }}>
                    <QrcodeOutlined style={{ fontSize: 36, color: '#f97316' }} />
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#222', marginTop: 8 }}>
                        Quét mã QR để đăng nhập Zalo
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                        Mở ứng dụng Zalo trên điện thoại → Thêm → Quét mã QR
                    </div>
                </div>

                {qrLoading && !qrFrameUrl ? (
                    <div style={{ padding: '60px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: '#888', fontSize: 14 }}>
                            Đang khởi động trình duyệt và tải mã QR...
                        </div>
                    </div>
                ) : qrFrameUrl ? (
                    <div style={{
                        border: '3px solid #e5e7eb',
                        borderRadius: 16,
                        overflow: 'hidden',
                        display: 'inline-block',
                        maxWidth: 640,
                        width: '100%',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                    }}>
                        <img
                            src={qrFrameUrl}
                            alt="Zalo QR Code"
                            style={{ width: '100%', display: 'block' }}
                        />
                    </div>
                ) : (
                    <div style={{ padding: '60px 0', color: '#999', fontSize: 14 }}>
                        Không nhận được hình ảnh QR. Bấm "Hiển thị mã QR" để thử lại.
                    </div>
                )}
            </Modal>

            {/* Responsive CSS */}
            <style jsx global>{`
                .zalo-account-sidebar { display: flex !important; }
                .zalo-conv-sidebar { display: flex !important; }
                .zalo-chat-panel { display: flex !important; }
                .zalo-mobile-back { display: none !important; }

                @media (max-width: 1024px) {
                    .zalo-account-sidebar {
                        width: 220px !important;
                        min-width: 220px !important;
                    }
                    .zalo-conv-sidebar {
                        width: 280px !important;
                        min-width: 280px !important;
                    }
                }

                @media (max-width: 768px) {
                    .zalo-account-sidebar {
                        width: 100% !important;
                        min-width: 100% !important;
                        border-right: none !important;
                    }
                    .zalo-conv-sidebar {
                        display: none !important;
                    }
                    .zalo-chat-panel {
                        display: none !important;
                    }
                    .zalo-mobile-back {
                        display: inline-flex !important;
                    }
                }
            `}</style>
        </>
    );
}

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        height: '100vh',
        background: '#f5f5f5',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },

    // ── Column 1: Account Sidebar ──
    accountSidebar: {
        width: 260,
        minWidth: 260,
        background: '#fff',
        borderRight: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    },
    sidebarHeader: {
        padding: '12px 12px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    searchArea: {
        padding: '8px 12px',
        borderBottom: '1px solid #f0f0f0',
    },
    accountList: {
        flex: 1,
        overflowY: 'auto',
    },
    accountItem: {
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid #fafafa',
        transition: 'background .15s',
        background: '#fff',
        alignItems: 'center',
    },
    accountItemActive: {
        background: '#f0f5ff',
        borderLeft: '3px solid #0068ff',
    },
    accountAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    accountName: {
        fontWeight: 600,
        fontSize: 13,
        color: '#222',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    accountTime: {
        fontSize: 10,
        color: '#bbb',
        flexShrink: 0,
    },
    accountOwner: {
        fontSize: 11,
        color: '#999',
        display: 'flex',
        alignItems: 'center',
    },

    // ── Column 2: Conversation Sidebar ──
    convSidebar: {
        width: 320,
        minWidth: 320,
        background: '#fff',
        borderRight: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    },
    convSidebarHeader: {
        padding: '14px 14px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    convList: {
        flex: 1,
        overflowY: 'auto' as const,
    },
    convItem: {
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid #fafafa',
        transition: 'background .15s',
    },
    convItemActive: {
        background: '#eef2ff',
        borderLeft: '3px solid #6366f1',
    },
    convAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        background: '#f0f0ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    convName: {
        fontWeight: 600,
        fontSize: 13,
        color: '#222',
    },
    convTime: {
        fontSize: 11,
        color: '#999',
    },
    convPreview: {
        fontSize: 12,
        color: '#888',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        maxWidth: 160,
    },

    // ── Column 3: Chat Panel ──
    chatPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fafafa',
    },
    chatHeader: {
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chatAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        background: '#6366f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    messagesArea: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '16px 20px',
    },
    msgRow: {
        display: 'flex',
        marginBottom: 8,
    },
    msgBubble: {
        maxWidth: '70%',
        padding: '10px 14px',
        borderRadius: 14,
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word' as const,
    },
    msgAgent: {
        background: '#6366f1',
        color: '#fff',
        borderBottomRightRadius: 4,
    },
    msgCustomer: {
        background: '#fff',
        border: '1px solid #e5e5e5',
        color: '#333',
        borderBottomLeftRadius: 4,
    },
    systemMsg: {
        textAlign: 'center' as const,
        color: '#999',
        fontSize: 12,
        padding: '6px 0',
    },
    msgTime: {
        fontSize: 10,
        opacity: 0.7,
        marginTop: 4,
        textAlign: 'right' as const,
    },
    msgImage: {
        maxWidth: 220,
        borderRadius: 8,
        cursor: 'pointer',
    },
    fileLink: {
        color: '#6366f1',
        textDecoration: 'underline',
    },
    inputArea: {
        padding: '10px 16px',
        background: '#fff',
        borderTop: '1px solid #e8e8e8',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
    },
    textInput: {
        flex: 1,
        padding: '10px 16px',
        border: '1.5px solid #e0e0e0',
        borderRadius: 22,
        fontSize: 13,
        outline: 'none',
        transition: 'border-color .2s',
    },

    // ── Shared states ──
    emptyColumn: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
    },
    onboardingState: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    onboardingCard: {
        textAlign: 'center' as const,
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
    },
    onboardingSteps: {
        textAlign: 'left' as const,
        width: '100%',
        background: '#f9fafb',
        borderRadius: 12,
        padding: '16px 20px',
    },
    onboardingStep: {
        fontSize: 13,
        color: '#555',
        padding: '6px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        background: '#0068ff',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
    },
};

// ── Subcomponents ──

const MessageComposer = ({ sending, onSend, onImageSend }: { sending: boolean, onSend: (text: string) => void, onImageSend: (file: File) => void }) => {
    const [inputText, setInputText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSendClick = () => {
        if (!inputText.trim() || sending) return;
        onSend(inputText.trim());
        setInputText(''); // optimistic clear
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (file.type.startsWith('image/')) {
            onImageSend(file);
        } else {
            message.info(`Gửi file khác ảnh: ${file.name} (chức năng đang phát triển)`);
        }
        e.target.value = '';
    };

    return (
        <div style={styles.inputArea}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <Button
                type="text"
                icon={<Paperclip size={18} color="#666" />}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '4px 8px' }}
            />
            <input
                style={styles.textInput}
                placeholder="Nhập tin nhắn..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendClick(); } }}
                onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                            const file = items[i].getAsFile();
                            if (file) onImageSend(file);
                            e.preventDefault();
                            break;
                        }
                    }
                }}
            />
            <Button
                type="primary"
                icon={<Send size={16} />}
                onClick={handleSendClick}
                loading={sending}
                style={{ borderRadius: 20, background: '#6366f1', border: 'none' }}
            />
        </div>
    );
};
