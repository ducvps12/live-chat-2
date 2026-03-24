import { useState, useEffect, useCallback, useMemo } from 'react'; // force reload
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
    Smartphone, X as XIcon, Smile, Mic, Reply, Undo2, Database, Mail, Phone, Link, FileText,
    Video, Pin, BellOff, Bookmark, Image, Share2, ChevronDown, ChevronRight,
    Shield, Eye, EyeOff, Trash2, AlertTriangle, Copy,
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
    senderId?: string;
    cliMsgId?: string;
    content: string;
    type: 'text' | 'image' | 'file' | 'sticker' | 'recalled';
    attachments?: Array<{ data: string; url?: string; filename: string; mimeType: string; size: number }>;
    attachmentUrl?: string;
    thumbUrl?: string;
    stickerUrl?: string;
    quote?: { ownerId: string; msg: string; msgId: string; cliMsgId: string; ts: number };
    status?: 'sent' | 'delivered' | 'read' | 'error';
    createdAt: string;
}

// ── Zalo image URL detection & rendering ──
function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /photo-stal[\w-]*\.zdn\.vn\//i.test(url);
}

function renderZaloContent(content: string, isAgent: boolean, stickerUrl?: string) {
    if (!content) return null;

    // Sticker rendering
    if (stickerUrl) {
        return (
            <img
                src={stickerUrl}
                alt="Sticker"
                style={{ maxWidth: 120, maxHeight: 120, display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
        );
    }

    // Detect sticker pattern from normalizeMessageContent: [Sticker:id:cateId:type]
    const stickerMatch = content.match(/^\[Sticker:(\d+):(\d+):(\d+)\]$/);
    if (stickerMatch) {
        const stickerId = stickerMatch[1];
        // Try common Zalo sticker CDN patterns
        const urls = [
            `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${stickerId}&size=120`,
            `https://zalo-api.zadn.vn/api/emoticon/sprite?eid=${stickerId}&size=120`,
        ];
        return (
            <img
                src={urls[0]}
                alt="Sticker"
                style={{ maxWidth: 120, maxHeight: 120, display: 'block' }}
                onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src === urls[0]) { target.src = urls[1]; }
                    else { target.style.display = 'none'; }
                }}
            />
        );
    }

    // [Media/Sticker] fallback — show emoji placeholder
    if (content === '[Media/Sticker]') {
        return <div style={{ fontSize: 40, lineHeight: 1 }}>🎭</div>;
    }

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
    const [convTypeFilter, setConvTypeFilter] = useState<'all' | 'user' | 'group'>('all');

    // ── Refs to track current values inside socket closures ──
    const selectedConvIdRef = useRef<string | null>(null);
    const conversationsRef = useRef<ZaloConversation[]>([]);
    useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);
    useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

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

    // ── Reply & Context menu state ──
    const [replyingTo, setReplyingTo] = useState<ZaloMessage | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: ZaloMessage } | null>(null);

    // ── Contact Data Panel state ──
    const [showDataPanel, setShowDataPanel] = useState(false);
    const [contactData, setContactData] = useState<{
        emails: string[]; phones: string[]; links: string[]; files: string[];
        messageCount: number; firstSeen: number; lastSeen: number; contactName: string;
    } | null>(null);

    // ── Sidebar section states ──
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        reminders: false, commonGroups: false, media: true, files: true, links: true, security: false, contactData: true,
    });
    const [sidebarViewAll, setSidebarViewAll] = useState<string | null>(null); // 'media' | 'links' | 'files' | null

    const toggleSection = (key: string) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // ── Search messages state ──
    const [showSearchBar, setShowSearchBar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // ── Mobile responsive state ──
    const [isMobile, setIsMobile] = useState(false);
    const [mobileView, setMobileView] = useState<'accounts' | 'conversations' | 'chat'>('accounts');

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Sync mobileView with selection state
    useEffect(() => {
        if (!isMobile) return;
        if (selectedConvId) {
            setMobileView('chat');
        } else if (selectedAccountId) {
            setMobileView('conversations');
        } else {
            setMobileView('accounts');
        }
    }, [isMobile, selectedAccountId, selectedConvId]);

    // Auto-select first connected account on mobile
    useEffect(() => {
        if (!isMobile || selectedAccountId || accounts.length === 0) return;
        const connected = accounts.find(a => a.status === 'connected');
        if (connected) {
            setSelectedAccountId(connected._id);
        }
    }, [isMobile, accounts, selectedAccountId]);

    const queryClient = useQueryClient();
    const { data: unreadCounts } = useTotalUnreadCount(workspaceId as string, !!workspaceId && !!meData);
    const inboxUnreadCount = unreadCounts?.inboxUnread || 0;

    const fetchAccounts = useCallback(async () => {
        if (!workspaceId) return;
        try {
            // Fetch from external-sessions API (legacy Puppeteer-based accounts)
            let externalAccounts: ZaloAccount[] = [];
            try {
                const res = await httpClient.get(`/external-sessions/${workspaceId}/sessions`);
                externalAccounts = res.data.data || [];
            } catch { /* silent */ }

            // Also check Zalo integration from settings page (zca-js based)
            try {
                const zaloRes = await httpClient.get(`/workspaces/${workspaceId}/zalo/status`);
                const zaloStatus = zaloRes.data?.data;
                if (zaloStatus?.connected) {
                    // Create a virtual account entry using workspaceId as _id
                    // (matches zca-js sessionId used by generateQRLogin and bootActiveAccounts)
                    const wsId = workspaceId as string;
                    const alreadyExists = externalAccounts.some(a => a._id === wsId);
                    if (!alreadyExists) {
                        externalAccounts.unshift({
                            _id: wsId,
                            label: zaloStatus.name || 'Zalo cá nhân',
                            status: zaloStatus.isOnline ? 'connected' : 'disconnected',
                            createdBy: { _id: '', name: '', email: '' },
                            controlledBy: null,
                            browserAlive: false,
                            connectedAt: new Date().toISOString(),
                            lastActiveAt: new Date().toISOString(),
                            createdAt: new Date().toISOString(),
                        });
                    }
                }
            } catch { /* Zalo not configured — silent */ }

            setAccounts(externalAccounts);
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
                    senderId: m.senderId || '',
                    cliMsgId: m.cliMsgId || undefined,
                    content: m.content,
                    type: m.type || 'text',
                    attachments: attachments.length > 0 ? attachments : undefined,
                    attachmentUrl: m.attachmentUrl,
                    thumbUrl: m.thumbUrl,
                    stickerUrl: m.stickerUrl || undefined,
                    quote: m.quote || undefined,
                    status: 'read' as const,
                    createdAt: m.createdAt,
                };
            });

            // Merge live messages with existing DB-loaded messages (no duplicates)
            setMessages(prev => {
                const liveContentsForAgent = new Set(liveMessages.filter(m => m.sender.type === 'agent').map(m => m.content));
                
                // Clean prev from optimistic duplicates
                const cleanPrev = prev.filter(m => {
                    // Always remove temp image messages when real messages arrive
                    if (m._id.startsWith('tmp_img_')) return false;
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

            // ── Determine which thread this message belongs to ──
            const msgThreadId = msg.conversationId || msg.threadId || '';

            // ── Check if message belongs to the currently open conversation ──
            const currentConvId = selectedConvIdRef.current;
            const currentConvs = conversationsRef.current;
            const currentConv = currentConvId ? currentConvs.find(c => c._id === currentConvId) : null;
            const currentThreadId = currentConv?.threadId || '';
            const isCurrentThread = msgThreadId && currentThreadId && msgThreadId === currentThreadId;

            // ── Only append to message list if it belongs to the open conversation ──
            if (isCurrentThread) {
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
                    senderId: msg.senderId || undefined,
                    cliMsgId: msg.cliMsgId || undefined,
                    content: msg.content || '',
                    type: msg.msgType || 'text',
                    attachments: attachments.length > 0 ? attachments : undefined,
                    attachmentUrl: msg.attachmentUrl,
                    thumbUrl: msg.thumbUrl,
                    stickerUrl: msg.stickerUrl || undefined,
                    quote: msg.quote || undefined,
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
            }

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

            // Show notification for incoming messages (from other people, not self)
            if (!msg.isSelf && msg.senderId) {
                playNotificationSound();
                const senderName = msg.senderName || 'Khách';
                const content = (msg.content || '').substring(0, 30);
                message.info(`Tin nhắn mới từ ${senderName}: ${content}...`);
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

        // ── Message recalled handler ──
        socket.on('zalo:undoResult', (data: { success: boolean; error?: string; msgId?: string }) => {
            if (data.success) {
                message.success('Đã thu hồi tin nhắn');
            } else {
                message.error('Thu hồi thất bại: ' + (data.error || 'Lỗi'));
            }
        });
        socket.on('zalo:messageRecalled', (data: { msgId: string; threadId: string }) => {
            setMessages(prev => prev.map(m => m._id === data.msgId ? {
                ...m,
                content: 'Tin nhắn đã được thu hồi',
                type: 'recalled' as const,
                attachments: undefined,
                attachmentUrl: undefined,
                thumbUrl: undefined,
                stickerUrl: undefined,
            } : m));
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
                            cliMsgId: m.cliMsgId || undefined,
                            senderId: m.senderId || undefined,
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
                            stickerUrl: m.stickerUrl || undefined,
                            quote: m.quote || undefined,
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
        if (!selectedConvId || !socketRef.current || !selectedAccountId) {
            message.error('Chưa chọn hội thoại hoặc chưa kết nối');
            return;
        }
        const selectedConv = conversations.find(c => c._id === selectedConvId);

        // Validate file
        if (!file.type.startsWith('image/')) {
            message.error('Chỉ hỗ trợ gửi file hình ảnh');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            message.error('Ảnh quá lớn (tối đa 10MB)');
            return;
        }

        console.log('[ImageSend] Starting...', { name: file.name, type: file.type, size: file.size });

        // Optimistic: show image immediately while uploading
        const localUrl = URL.createObjectURL(file);
        const tempImgMsg: ZaloMessage = {
            _id: 'tmp_img_' + Date.now(),
            conversationId: selectedConvId,
            sender: { type: 'agent', name: 'Bạn' },
            content: '',
            type: 'image',
            attachments: [{ data: localUrl, url: localUrl, filename: file.name, mimeType: file.type, size: file.size }],
            status: 'sent',
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempImgMsg]);

        try {
            setSending(true);
            message.loading({ content: 'Đang tải ảnh lên server...', key: 'imgUpload', duration: 0 });
            
            console.log('[ImageSend] Uploading to /api/upload...');
            const { url } = await uploadService.uploadImage(file);
            console.log('[ImageSend] Upload success:', url);
            
            // Convert relative /uploads/... to absolute URL for Zalo backend to download
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
            const baseUrl = apiUrl.replace(/\/api$/, '');
            const absoluteImageUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
            
            message.loading({ content: 'Đang gửi ảnh qua Zalo...', key: 'imgUpload', duration: 0 });
            console.log('[ImageSend] Emitting zalo:sendMessage with imageUrl:', absoluteImageUrl);
            
            // Wait for backend response
            const sendResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
                const timeout = setTimeout(() => {
                    socketRef.current?.off('zalo:messageSent', onSent);
                    resolve({ success: false, error: 'Timeout - không nhận được phản hồi từ Zalo (30s)' });
                }, 30000);
                
                const onSent = (data: { success: boolean; error?: string }) => {
                    clearTimeout(timeout);
                    socketRef.current?.off('zalo:messageSent', onSent);
                    resolve(data);
                };
                socketRef.current!.on('zalo:messageSent', onSent);
                
                socketRef.current!.emit('zalo:sendMessage', {
                    sessionId: selectedAccountId,
                    threadId: selectedConv?.threadId || selectedConvId.replace('zca_', ''),
                    threadType: selectedConv?.threadType || 'user',
                    text: '',
                    imageUrl: absoluteImageUrl,
                });
            });
            
            console.log('[ImageSend] Backend response:', sendResult);
            
            if (sendResult.success) {
                message.success({ content: 'Đã gửi ảnh!', key: 'imgUpload', duration: 2 });
                // Remove optimistic temp image message
                setMessages(prev => prev.filter(m => m._id !== tempImgMsg._id));
                // Re-fetch messages
                setTimeout(() => {
                    socketRef.current?.emit('zalo:getMessages', {
                        sessionId: selectedAccountId,
                        threadId: selectedConvId,
                        threadType: selectedConv?.threadType || 'user',
                    });
                }, 500);
            } else {
                message.error({ content: 'Gửi ảnh thất bại: ' + (sendResult.error || 'Lỗi Zalo'), key: 'imgUpload', duration: 4 });
                // Remove optimistic message on failure
                setMessages(prev => prev.filter(m => m._id !== tempImgMsg._id));
            }
            
            setSending(false);
        } catch (error: any) {
            console.error('[ImageSend] Error:', error);
            message.error({ content: 'Gửi ảnh thất bại: ' + (error?.response?.data?.message || error?.message || 'Lỗi không xác định'), key: 'imgUpload', duration: 3 });
            setMessages(prev => prev.filter(m => m._id !== tempImgMsg._id));
            setSending(false);
        } finally {
            URL.revokeObjectURL(localUrl);
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
        if (convTypeFilter !== 'all' && c.threadType !== convTypeFilter) return false;
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
                .zalo-msg-row:hover .zalo-msg-actions {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }
                .zalo-msg-action-btn {
                    width: 28px; height: 28px; border-radius: 50%; border: none;
                    background: #f1f5f9; cursor: pointer; display: flex;
                    align-items: center; justify-content: center; font-size: 13px;
                    color: #475569;
                    transition: all 0.15s ease;
                }
                .zalo-msg-action-btn:hover {
                    background: #e2e8f0; transform: scale(1.15);
                }

                /* ═══ MOBILE RESPONSIVE ═══ */
                @media (max-width: 768px) {
                    /* Hide desktop account sidebar */
                    .zalo-account-sidebar {
                        display: none !important;
                    }
                    /* Mobile account panel (replaces sidebar) */
                    .zalo-mobile-accounts {
                        display: none;
                        width: 100% !important;
                        flex-direction: column;
                        flex: 1;
                    }
                    .zalo-mobile-accounts.zalo-mobile-accounts-active {
                        display: flex !important;
                    }
                    /* Conv sidebar — full width, shown only when active */
                    .zalo-conv-sidebar {
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        border-right: none !important;
                        display: none !important;
                    }
                    .zalo-conv-sidebar.zalo-conv-active {
                        display: flex !important;
                    }
                    /* Chat panel — full screen overlay */
                    .zalo-chat-panel {
                        position: fixed !important;
                        left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important;
                        z-index: 50;
                        width: 100% !important;
                        background: #e5e7eb !important;
                        display: none !important;
                    }
                    .zalo-chat-panel.zalo-chat-active {
                        display: flex !important;
                    }
                    /* Show mobile back button */
                    .zalo-mobile-back {
                        display: inline-flex !important;
                    }
                    /* Smaller header buttons */
                    .zalo-header-actions button {
                        padding: 4px !important;
                        min-width: 28px !important;
                    }
                    /* Wider bubbles on mobile */
                    .zalo-msg-bubble-mobile {
                        max-width: 82% !important;
                    }
                    /* Compact composer */
                    .zalo-composer-mobile {
                        padding: 8px 10px !important;
                    }
                    .zalo-composer-mobile input[type="text"] {
                        font-size: 14px !important;
                    }
                }

                /* ═══ TABLET RESPONSIVE ═══ */
                @media (min-width: 769px) and (max-width: 1024px) {
                    .zalo-account-sidebar {
                        width: 60px !important;
                        min-width: 60px !important;
                    }
                    .zalo-account-sidebar .zalo-sidebar-text {
                        display: none !important;
                    }
                    .zalo-conv-sidebar {
                        width: 280px !important;
                        min-width: 280px !important;
                    }
                    .zalo-info-sidebar {
                        width: 280px !important;
                    }
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
                            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                <Smartphone size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: '#6366f1' }} />
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
                                        fontWeight: 600, fontSize: 11, borderRadius: 10,
                                        padding: '2px 10px', height: 26,
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
                                    style={{ background: '#6366f1', borderColor: '#6366f1', borderRadius: 10 }}
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
                                    style={{ cursor: 'pointer', borderRadius: 12, padding: '2px 10px', margin: 0, fontSize: 11, transition: 'all 0.15s' }}
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
                                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            ...styles.accountAvatar,
                                            background: account.status === 'connected' ? '#ecfdf5' : '#eef2ff',
                                        }}>
                                            <Smartphone size={16} color={account.status === 'connected' ? '#10b981' : '#6366f1'} />
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

                {/* ═══ MOBILE: Account Selection Panel ═══ */}
                <div className={`zalo-mobile-accounts ${isMobile && mobileView === 'accounts' ? 'zalo-mobile-accounts-active' : ''}`}
                    style={{ background: '#fff', height: '100%', display: 'none', flexDirection: 'column' as const }}>
                    {/* Mobile header */}
                    <div style={{
                        padding: '16px', borderBottom: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 64,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button type="text" icon={<ArrowLeft size={18} />}
                                onClick={() => router.push(`/workspace/${workspaceId}`)}
                                style={{ padding: '4px 8px' }} />
                            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                                <Smartphone size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: '#6366f1' }} />
                                Zalo
                            </h2>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Badge count={inboxUnreadCount} overflowCount={99}>
                                <Button size="small"
                                    onClick={() => router.push(`/workspace/${workspaceId}/inbox`)}
                                    style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 11, borderRadius: 10, padding: '2px 10px', height: 26 }}>
                                    <MessageSquare size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    Inbox
                                </Button>
                            </Badge>
                            <Tooltip title="Thêm tài khoản">
                                <Button type="primary" icon={<PlusOutlined />} size="small"
                                    onClick={() => setCreateModalOpen(true)}
                                    style={{ background: '#6366f1', borderColor: '#6366f1', borderRadius: 10 }} />
                            </Tooltip>
                        </div>
                    </div>
                    {/* Mobile account list */}
                    <div style={{ flex: 1, overflowY: 'auto' as const, padding: '8px 0' }}>
                        {filteredAccounts.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={<span style={{ color: '#999', fontSize: 13 }}>Chưa có tài khoản Zalo</span>}
                                style={{ marginTop: 60 }} />
                        ) : (
                            filteredAccounts.map(account => {
                                const cfg = ACCOUNT_STATUS[account.status] || { color: 'default', label: account.status, icon: null };
                                return (
                                    <div key={account._id}
                                        onClick={() => {
                                            setSelectedAccountId(account._id);
                                            setMobileView('conversations');
                                        }}
                                        style={{
                                            display: 'flex', gap: 14, padding: '14px 16px', cursor: 'pointer',
                                            alignItems: 'center', margin: '2px 10px', borderRadius: 14,
                                            background: selectedAccountId === account._id ? '#eef2ff' : '#fff',
                                            transition: 'all .2s ease',
                                            border: selectedAccountId === account._id ? '1px solid rgba(99,102,241,0.15)' : '1px solid transparent',
                                        }}>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 14,
                                            background: account.status === 'connected' ? '#ecfdf5' : '#eef2ff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <Smartphone size={20} color={account.status === 'connected' ? '#10b981' : '#6366f1'} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{account.label}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                <Tag color={cfg.color} style={{ fontSize: 11, margin: 0, lineHeight: '18px', padding: '0 8px', borderRadius: 8 }}>
                                                    {cfg.label}
                                                </Tag>
                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(account.lastActiveAt)}</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} color="#cbd5e1" />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ═══ COLUMN 2: Conversation List ═══ */}
                <div style={styles.convSidebar} className={`zalo-conv-sidebar ${isMobile && mobileView === 'conversations' ? 'zalo-conv-active' : ''}`}>
                    {selectedAccount ? (
                        selectedAccount.status === 'connected' ? (
                            <>
                                {/* Conv sidebar header */}
                                <div style={styles.convSidebarHeader}>
                                    {isMobile && (
                                        <Button type="text" icon={<ArrowLeft size={18} />}
                                            onClick={() => { setSelectedAccountId(null); setMobileView('accounts'); }}
                                            style={{ padding: '4px 8px', marginRight: 4 }} />
                                    )}
                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', flex: 1 }}>
                                        Hội thoại
                                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>
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
                                                background: '#6366f1',
                                                borderColor: '#6366f1',
                                                borderRadius: 10,
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
                                                style={{ cursor: 'pointer', borderRadius: 12, padding: '2px 10px', margin: 0, fontSize: 11, transition: 'all 0.15s' }}
                                            >
                                                {label}
                                            </Tag>
                                        ))}
                                    </div>
                                    {/* Thread type filter */}
                                    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                                        {([
                                            ['all', '💬 Tất cả', conversations.length],
                                            ['user', '👤 Cá nhân', conversations.filter(c => c.threadType === 'user').length],
                                            ['group', '👥 Nhóm', conversations.filter(c => c.threadType === 'group').length],
                                        ] as const).map(([val, label, count]) => (
                                            <Tag
                                                key={val}
                                                color={convTypeFilter === val ? '#10b981' : undefined}
                                                onClick={() => setConvTypeFilter(val as any)}
                                                style={{ cursor: 'pointer', borderRadius: 12, padding: '2px 10px', margin: 0, fontSize: 11, transition: 'all 0.15s' }}
                                            >
                                                {label} ({count})
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
                                                                    style={{ background: '#6366f1', borderColor: '#6366f1', borderRadius: 10 }}
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
                                                        {conv.contactAvatar ? (
                                                            <img src={conv.contactAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="color:#6366f1;font-weight:700;font-size:14px">${(conv.contactName || '?')[0].toUpperCase()}</span>`); }} />
                                                        ) : (
                                                            <span style={{ color: '#6366f1', fontWeight: 700, fontSize: 14 }}>{(conv.contactName || '?')[0].toUpperCase()}</span>
                                                        )}
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
                                    {isMobile && (
                                        <Button type="text" icon={<ArrowLeft size={18} />}
                                            onClick={() => { setSelectedAccountId(null); setMobileView('accounts'); }}
                                            style={{ alignSelf: 'flex-start', padding: '4px 8px', marginBottom: 8 }} />
                                    )}
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

                                    <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', marginBottom: 6, letterSpacing: '-0.02em' }}>
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
                                                    style={{ borderRadius: 14, fontWeight: 600, height: 48, fontSize: 15, marginBottom: 16, background: '#6366f1', borderColor: '#6366f1' }}
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
                                            style={{ background: '#6366f1', borderColor: '#6366f1', borderRadius: 14 }}
                                        >
                                            Kết nối lại
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    ) : (
                        <div style={styles.emptyColumn}>
                            {isMobile ? (
                                <>
                                    <div style={{ width: 64, height: 64, borderRadius: 20, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                                        <Smartphone size={28} color="#94a3b8" strokeWidth={1.5} />
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginTop: 4 }}>
                                        Chọn tài khoản Zalo
                                    </div>
                                    <Button type="primary" onClick={() => setMobileView('accounts')}
                                        style={{ borderRadius: 12, background: '#6366f1', borderColor: '#6366f1', marginTop: 12 }}>
                                        <ArrowLeft size={14} style={{ marginRight: 6 }} /> Quay lại
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <div style={{ width: 64, height: 64, borderRadius: 20, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                                        <Smartphone size={28} color="#94a3b8" strokeWidth={1.5} />
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginTop: 4 }}>
                                        Chọn tài khoản Zalo
                                    </div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                                        từ danh sách bên trái
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ═══ COLUMN 3: Chat Panel ═══ */}
                <div style={styles.chatPanel} className={`zalo-chat-panel ${(isMobile && mobileView === 'chat') || (!isMobile && selectedConvId) ? 'zalo-chat-active' : ''}`}>
                    {selectedConvId && selectedConv ? (
                        <>
                            {/* Chat header */}
                            <div style={styles.chatHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Button
                                        type="text"
                                        icon={<ArrowLeft size={18} />}
                                        onClick={() => { setSelectedConvId(null); if (isMobile) setMobileView('conversations'); }}
                                        className="zalo-mobile-back"
                                        style={{ display: isMobile ? 'inline-flex' : 'none' }}
                                    />
                                    <div style={styles.chatAvatar}>
                                                        {selectedConv.contactAvatar ? (
                                                            <img src={selectedConv.contactAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                        ) : (
                                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{(selectedConv.contactName || '?')[0].toUpperCase()}</span>
                                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14.5, color: '#0f172a', letterSpacing: '-0.01em' }}>{selectedConv.contactName}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Tag color="blue" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 6px', borderRadius: 6 }}>
                                                Zalo
                                            </Tag>
                                            <span>qua {selectedAccount?.label}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <Tooltip title="Gọi thoại">
                                        <Button type="text" icon={<Phone size={18} color="#555" />} style={{ padding: '4px 8px' }} />
                                    </Tooltip>
                                    <Tooltip title="Gọi video">
                                        <Button type="text" icon={<Video size={18} color="#555" />} style={{ padding: '4px 8px' }} />
                                    </Tooltip>
                                    <Tooltip title="Tìm tin nhắn">
                                        <Button type="text" icon={<Search size={18} color={showSearchBar ? '#0068ff' : '#555'} />} style={{ padding: '4px 8px' }}
                                            onClick={() => { setShowSearchBar(!showSearchBar); if (showSearchBar) setSearchQuery(''); }} />
                                    </Tooltip>
                                    <Tooltip title="Đánh dấu">
                                        <Button type="text" icon={<Bookmark size={18} color="#555" />} style={{ padding: '4px 8px' }}
                                            onClick={() => {
                                                // Toggle a 'starred' label on the conversation
                                                setConversations(prev => prev.map(c => {
                                                    if (c._id === selectedConvId) {
                                                        const isStarred = c.tags?.includes('⭐');
                                                        return { ...c, tags: isStarred ? c.tags?.filter(t => t !== '⭐') || [] : [...(c.tags || []), '⭐'] };
                                                    }
                                                    return c;
                                                }));
                                                const isCurrentlyStarred = selectedConv?.tags?.includes('⭐');
                                                message.success(isCurrentlyStarred ? 'Đã bỏ đánh dấu' : 'Đã đánh dấu ⭐');
                                            }} />
                                    </Tooltip>
                                    <Tooltip title="Thông tin hội thoại">
                                        <Button
                                            type="text"
                                            icon={<Users size={18} color={showDataPanel ? '#0068ff' : '#555'} />}
                                            onClick={() => {
                                                setShowDataPanel(!showDataPanel);
                                                if (!showDataPanel && socketRef.current && selectedAccountId && selectedConvId) {
                                                    const conv = conversations.find(c => c._id === selectedConvId);
                                                    socketRef.current.emit('zalo:getContactData', {
                                                        sessionId: selectedAccountId,
                                                        threadId: conv?.threadId || selectedConvId.replace('zca_', ''),
                                                    });
                                                    socketRef.current.once('zalo:contactData', (data: any) => {
                                                        setContactData(data.data || null);
                                                    });
                                                }
                                            }}
                                            style={{ padding: '4px 8px' }}
                                        />
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Inline search bar */}
                            {showSearchBar && (
                                <div style={{
                                    padding: '8px 16px',
                                    background: '#fff',
                                    borderBottom: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}>
                                    <Search size={16} color="#94a3b8" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Tìm tin nhắn..."
                                        autoFocus
                                        style={{
                                            flex: 1, border: 'none', outline: 'none',
                                            fontSize: 14, padding: '6px 0', background: 'transparent',
                                        }}
                                    />
                                    {searchQuery && (
                                        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                            {messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} kết quả
                                        </span>
                                    )}
                                    <Button type="text" size="small" icon={<XIcon size={14} />}
                                        onClick={() => { setShowSearchBar(false); setSearchQuery(''); }} />
                                </div>
                            )}

                            {/* ═══ Content area: flex row with messages + optional sidebar ═══ */}
                            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                            {/* ── Chat content (messages + input) ── */}
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

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
                                        {messages.map((msg, idx) => {
                                            const isAgent = msg.sender.type === 'agent';
                                            const isSearchMatch = searchQuery ? msg.content.toLowerCase().includes(searchQuery.toLowerCase()) : false;
                                            const isSystem = msg.sender.type === 'system';

                                            // Date separator
                                            const msgDate = new Date(msg.createdAt).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
                                            const prevDate = idx > 0 ? new Date(messages[idx - 1].createdAt).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
                                            const showDateSep = idx === 0 || msgDate !== prevDate;

                                            if (isSystem) {
                                                return (
                                                    <div key={msg._id}>
                                                        {showDateSep && (
                                                            <div style={{ textAlign: 'center', margin: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
                                                                <span style={{ fontSize: 12, color: '#6b7280', background: '#e5e7eb', padding: '2px 12px', borderRadius: 12, whiteSpace: 'nowrap' }}>{msgDate}</span>
                                                                <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
                                                            </div>
                                                        )}
                                                        <div style={{ ...styles.systemMsg, background: 'rgba(0,0,0,0.06)', display: 'inline-block', padding: '4px 14px', borderRadius: 14, margin: '4px auto', fontSize: 12 }}>
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const isSticker = msg.type === 'sticker' || !!msg.stickerUrl;
                                            // Show avatar only for last consecutive message from same sender
                                            const nextMsg = messages[idx + 1];
                                            const showAvatar = !isAgent && (!nextMsg || nextMsg.sender.type === 'agent' || nextMsg.sender.type === 'system');

                                            return (
                                                <div key={msg._id}>
                                                    {showDateSep && (
                                                        <div style={{ textAlign: 'center', margin: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
                                                            <span style={{ fontSize: 12, color: '#6b7280', background: '#e5e7eb', padding: '2px 12px', borderRadius: 12, whiteSpace: 'nowrap' }}>{msgDate}</span>
                                                            <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
                                                        </div>
                                                    )}
                                                <div
                                                    id={`msg-${msg._id}`}
                                                    className="zalo-msg-row"
                                                    style={{
                                                        ...styles.msgRow,
                                                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                                        position: 'relative' as const,
                                                        ...(searchQuery ? {
                                                            opacity: isSearchMatch ? 1 : 0.3,
                                                            background: isSearchMatch ? 'rgba(255,235,59,0.15)' : 'transparent',
                                                            borderRadius: isSearchMatch ? 8 : 0,
                                                            transition: 'opacity 0.2s, background 0.2s',
                                                        } : {}),
                                                    }}
                                                >
                                                    {/* ── Zalo-style hover action toolbar ── */}
                                                    <div
                                                        className="zalo-msg-actions"
                                                        style={{
                                                            position: 'absolute',
                                                            top: -6,
                                                            ...(isAgent ? { right: 8 } : { left: 44 }),
                                                            display: 'flex',
                                                            gap: 2,
                                                            background: '#fff',
                                                            borderRadius: 16,
                                                            padding: '2px 4px',
                                                            boxShadow: '0 1px 8px rgba(0,0,0,0.12)',
                                                            border: '1px solid #e5e7eb',
                                                            zIndex: 5,
                                                            opacity: 0,
                                                            pointerEvents: 'none' as const,
                                                            transition: 'opacity 0.15s ease',
                                                        }}
                                                    >
                                                        <button className="zalo-msg-action-btn" title="Trả lời" onClick={() => setReplyingTo(msg)}><Reply size={14} /></button>
                                                        {isAgent && (
                                                            <button className="zalo-msg-action-btn" title="Thu hồi" onClick={() => {
                                                                if (!window.confirm('Thu hồi tin nhắn này cho tất cả mọi người?')) return;
                                                                if (socketRef.current && selectedAccountId && selectedConvId) {
                                                                    const conv = conversations.find(c => c._id === selectedConvId);
                                                                    console.log('[Recall] Emitting zalo:undoMessage', { msgId: msg._id, cliMsgId: msg.cliMsgId });
                                                                    socketRef.current.emit('zalo:undoMessage', {
                                                                        sessionId: selectedAccountId,
                                                                        msgId: msg._id,
                                                                        cliMsgId: msg.cliMsgId || msg._id,
                                                                        threadId: conv?.threadId || selectedConvId.replace('zca_', ''),
                                                                        threadType: conv?.threadType || 'user',
                                                                    });
                                                                } else {
                                                                    console.warn('[Recall] Missing socket/account/conv', { socket: !!socketRef.current, selectedAccountId, selectedConvId });
                                                                }
                                                                // Show "recalled" state instead of removing
                                                                setMessages(prev => prev.map(m => m._id === msg._id ? {
                                                                    ...m,
                                                                    content: 'Tin nhắn đã được thu hồi',
                                                                    type: 'recalled',
                                                                    attachments: undefined,
                                                                    attachmentUrl: undefined,
                                                                    thumbUrl: undefined,
                                                                    stickerUrl: undefined,
                                                                } : m));
                                                            }}><Undo2 size={14} /></button>
                                                        )}
                                                        <button className="zalo-msg-action-btn" title="Sao chép" onClick={() => {
                                                            navigator.clipboard.writeText(msg.content);
                                                            message.success('Đã sao chép!');
                                                        }}><Copy size={14} /></button>
                                                    </div>

                                                    {/* Avatar for customer messages */}
                                                    {!isAgent && showAvatar && (
                                                        <div style={{
                                                            width: 32, height: 32, borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, #0068ff 0%, #4e8cff 100%)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: '#fff', fontSize: 13, fontWeight: 700,
                                                            flexShrink: 0, overflow: 'hidden',
                                                        }}>
                                                            {selectedConv?.contactAvatar ? (
                                                                <img src={selectedConv.contactAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                            ) : (
                                                                (msg.sender.name || '?')[0].toUpperCase()
                                                            )}
                                                        </div>
                                                    )}
                                                    {!isAgent && !showAvatar && <div style={{ width: 32, flexShrink: 0 }} />}

                                                    <div
                                                        style={{
                                                            ...styles.msgBubble,
                                                            ...(isAgent ? styles.msgAgent : styles.msgCustomer),
                                                            ...(msg._id.startsWith('tmp_') ? { opacity: 0.6 } : {}),
                                                            ...(isSticker ? { background: 'transparent', padding: 4, boxShadow: 'none' } : {}),
                                                            ...(msg.type === 'recalled' ? {
                                                                background: 'transparent',
                                                                border: '1px dashed #ccc',
                                                                boxShadow: 'none',
                                                                fontStyle: 'italic',
                                                                color: '#999',
                                                                padding: '6px 12px',
                                                            } : {}),
                                                            position: 'relative' as const,
                                                        }}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            setContextMenu({ x: e.clientX, y: e.clientY, msg });
                                                        }}
                                                    >
                                                        {/* Quote/Reply preview */}
                                                        {msg.quote && (
                                                            <div style={{
                                                                background: isAgent ? '#c5d8f8' : '#f0f0f0',
                                                                borderLeft: '3px solid #0068ff',
                                                                borderRadius: 4,
                                                                padding: '4px 8px',
                                                                marginBottom: 6,
                                                                fontSize: 11,
                                                                color: isAgent ? '#1a3a5c' : '#666',
                                                                maxHeight: 40,
                                                                overflow: 'hidden',
                                                            }}>
                                                                <Reply size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                                                {msg.quote.msg.substring(0, 60)}{msg.quote.msg.length > 60 ? '...' : ''}
                                                            </div>
                                                        )}
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
                                                        {msg.content && renderZaloContent(msg.content, isAgent, msg.stickerUrl)}
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
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Reply Preview Bar */}
                            {replyingTo && (
                                <div style={{
                                    padding: '8px 14px',
                                    background: '#eef2ff',
                                    borderTop: '1px solid #e0e7ff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 12,
                                    color: '#4338ca',
                                }}>
                                    <Reply size={14} color="#0068ff" />
                                    <div style={{ flex: 1, overflow: 'hidden', borderLeft: '2px solid #0068ff', paddingLeft: 8 }}>
                                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 1 }}>
                                            {replyingTo.sender?.name || (replyingTo.sender?.type === 'agent' ? 'Bạn' : 'Khách')}
                                        </div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555', fontSize: 12 }}>
                                            {replyingTo.attachments?.some(a => a.mimeType?.startsWith('image/')) || replyingTo.stickerUrl
                                                ? (replyingTo.content ? replyingTo.content.substring(0, 60) : replyingTo.stickerUrl ? '🎭 Sticker' : '📷 Hình ảnh')
                                                : (replyingTo.content || '[Tin nhắn]').substring(0, 80)
                                            }
                                        </div>
                                    </div>
                                    <Button type="text" size="small" icon={<XIcon size={14} />} onClick={() => setReplyingTo(null)} style={{ flexShrink: 0 }} />
                                </div>
                            )}

                            {/* Composer */}
                            <MessageComposer
                                sending={sending}
                                onSend={(text) => {
                                    if (replyingTo && socketRef.current && selectedAccountId && selectedConvId) {
                                        const conv = conversations.find(c => c._id === selectedConvId);
                                        const replyContent = replyingTo.content || (replyingTo.stickerUrl ? '🎭 Sticker' : replyingTo.attachments?.length ? '📷 Hình ảnh' : '');
                                        // Add optimistic reply message with quote
                                        const tempReplyMsg: ZaloMessage = {
                                            _id: 'tmp_reply_' + Date.now(),
                                            conversationId: selectedConvId,
                                            sender: { type: 'agent', name: 'Bạn' },
                                            content: text,
                                            type: 'text',
                                            quote: {
                                                ownerId: replyingTo.senderId || '',
                                                msg: replyContent,
                                                msgId: replyingTo._id,
                                                cliMsgId: replyingTo.cliMsgId || replyingTo._id,
                                                ts: new Date(replyingTo.createdAt).getTime(),
                                            },
                                            createdAt: new Date().toISOString(),
                                        };
                                        setMessages(prev => [...prev, tempReplyMsg]);
                                        // Listen for reply result to update the temp message
                                        const onReplySent = (data: { success: boolean; error?: string; result?: any }) => {
                                            socketRef.current?.off('zalo:messageSent', onReplySent);
                                            if (data.success) {
                                                // Update temp message to real ID and mark as sent
                                                const realMsgId = data.result?.message?.msgId;
                                                setMessages(prev => prev.map(m => {
                                                    if (m._id === tempReplyMsg._id) {
                                                        return { ...m, _id: realMsgId ? String(realMsgId) : `sent_reply_${Date.now()}`, status: 'read' as const };
                                                    }
                                                    return m;
                                                }));
                                            } else {
                                                message.error('Gửi trả lời thất bại: ' + (data.error || 'Lỗi'));
                                                setMessages(prev => prev.filter(m => m._id !== tempReplyMsg._id));
                                            }
                                        };
                                        socketRef.current.on('zalo:messageSent', onReplySent);
                                        socketRef.current.emit('zalo:replyMessage', {
                                            sessionId: selectedAccountId,
                                            threadId: conv?.threadId || selectedConvId.replace('zca_', ''),
                                            threadType: conv?.threadType || 'user',
                                            text,
                                            quotedMsg: {
                                                msgId: replyingTo._id,
                                                cliMsgId: replyingTo.cliMsgId || replyingTo._id,
                                                content: replyContent,
                                                uidFrom: replyingTo.senderId || '',
                                                ts: new Date(replyingTo.createdAt).getTime(),
                                            },
                                        });
                                        setReplyingTo(null);
                                    } else {
                                        handleSend(text);
                                    }
                                }}
                                onImageSend={handleImageSend}
                                onStickerSend={(sticker) => {
                                    if (!socketRef.current || !selectedAccountId || !selectedConvId) return;
                                    const conv = conversations.find(c => c._id === selectedConvId);
                                    socketRef.current.emit('zalo:sendSticker', {
                                        sessionId: selectedAccountId,
                                        sticker,
                                        threadId: conv?.threadId || selectedConvId.replace('zca_', ''),
                                        threadType: conv?.threadType || 'user',
                                    });
                                }}
                                socketRef={socketRef}
                                selectedAccountId={selectedAccountId}
                            />
                            </div>{/* END chat content */}

                            {/* ═══ Right Sidebar: Thông tin hội thoại ═══ */}
                            {showDataPanel && (
                                <div className="zalo-info-sidebar" style={{
                                    width: 340,
                                    borderLeft: '1px solid #e5e7eb',
                                    background: '#fff',
                                    display: 'flex',
                                    flexDirection: 'column' as const,
                                    overflowY: 'auto' as const,
                                    flexShrink: 0,
                                }}>
                                    {/* ─── Sidebar Header: Back (if viewAll) or Avatar + Name ─── */}
                                    {sidebarViewAll ? (
                                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Button type="text" icon={<ArrowLeft size={18} />} onClick={() => setSidebarViewAll(null)} />
                                            <span style={{ fontWeight: 600, fontSize: 15, color: '#333' }}>
                                                {sidebarViewAll === 'media' ? 'Ảnh/Video' : sidebarViewAll === 'files' ? 'File' : 'Link'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: '6px solid #f0f0f0' }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 12 }}>Thông tin hội thoại</div>
                                            <div style={{
                                                width: 56, height: 56, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #0068ff 0%, #4e8cff 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                margin: '0 auto 8px', color: '#fff', fontSize: 22, fontWeight: 700,
                                                overflow: 'hidden',
                                            }}>
                                                {selectedConv.contactAvatar ? (
                                                    <img src={selectedConv.contactAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                ) : (
                                                    (selectedConv.contactName || '?')[0].toUpperCase()
                                                )}
                                            </div>
                                            <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a2e' }}>{selectedConv.contactName}</div>
                                            {selectedConv.threadType === 'group' && (
                                                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Nhóm · {selectedConv.threadType}</div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
                                                {[
                                                    { icon: <BellOff size={18} color="#555" />, label: 'Tắt thông\nbáo' },
                                                    { icon: <Pin size={18} color="#555" />, label: 'Ghim hội\nthoại' },
                                                    { icon: <Users size={18} color="#555" />, label: 'Tạo nhóm\ntrò chuyện' },
                                                ].map((item, i) => (
                                                    <div key={i} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => message.info('Tính năng đang phát triển')}>
                                                        <div style={{
                                                            width: 36, height: 36, borderRadius: '50%', background: '#f0f2f5',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            margin: '0 auto 4px', transition: 'background 0.2s',
                                                        }}>
                                                            {item.icon}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line', lineHeight: 1.3 }}>
                                                            {item.label}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── VIEW ALL MODE: Show full gallery/list ─── */}
                                    {sidebarViewAll === 'media' && (() => {
                                        const allMedia = messages
                                            .filter(m => m.attachments?.some(a => a.mimeType?.startsWith('image/') || isImageUrl(a.url || a.data || ''))
                                                || (m.content && /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i.test(m.content)));
                                        return (
                                            <div style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4, overflow: 'auto', flex: 1 }}>
                                                {allMedia.length > 0 ? allMedia.map((m, i) => {
                                                    const imgSrc = m.attachments?.find(a => a.mimeType?.startsWith('image/'))?.url
                                                        || m.attachments?.find(a => a.mimeType?.startsWith('image/'))?.data
                                                        || m.content?.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i)?.[0];
                                                    return imgSrc ? (
                                                        <div key={i} style={{
                                                            width: 98, height: 98, borderRadius: 4, overflow: 'hidden',
                                                            cursor: 'pointer', background: '#f0f0f0',
                                                        }} onClick={() => window.open(imgSrc, '_blank')}>
                                                            <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    ) : null;
                                                }) : (
                                                    <div style={{ color: '#999', fontSize: 13, padding: 16, textAlign: 'center', width: '100%' }}>Chưa có ảnh/video trong hội thoại này</div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {sidebarViewAll === 'files' && (() => {
                                        const allFiles = messages
                                            .filter(m => m.attachments?.some(a => !a.mimeType?.startsWith('image/')))
                                            .flatMap(m => m.attachments?.filter(a => !a.mimeType?.startsWith('image/')).map(a => ({ ...a, date: m.createdAt })) || []);
                                        return (
                                            <div style={{ padding: '0 16px', overflow: 'auto', flex: 1 }}>
                                                {allFiles.length > 0 ? allFiles.map((f, i) => (
                                                    <a key={i} href={f.url || f.data} download={f.filename} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                                        color: '#333', textDecoration: 'none', fontSize: 13, borderBottom: '1px solid #f0f0f0',
                                                    }}>
                                                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <FileText size={20} color="#0068ff" />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.filename || 'File'}</div>
                                                            <div style={{ fontSize: 11, color: '#999' }}>{new Date(f.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                                        </div>
                                                    </a>
                                                )) : (
                                                    <div style={{ color: '#999', fontSize: 13, padding: 16, textAlign: 'center' }}>Chưa có file trong hội thoại này</div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {sidebarViewAll === 'links' && (() => {
                                        const allLinks = messages
                                            .filter(m => m.content && /https?:\/\/[^\s]+/i.test(m.content))
                                            .map(m => {
                                                const url = m.content.match(/https?:\/\/[^\s]+/i)?.[0] || '';
                                                let domain = '';
                                                try { domain = new URL(url).hostname; } catch { domain = url; }
                                                return { url, domain, date: new Date(m.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }), sender: m.sender?.name || '' };
                                            });
                                        return (
                                            <div style={{ padding: '0 16px', overflow: 'auto', flex: 1 }}>
                                                {allLinks.length > 0 ? allLinks.map((l, i) => (
                                                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                                        textDecoration: 'none', borderBottom: '1px solid #f0f0f0',
                                                    }}>
                                                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <Link size={18} color="#0068ff" />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>
                                                            <div style={{ fontSize: 11, color: '#0068ff' }}>{l.domain}</div>
                                                        </div>
                                                        <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{l.date}</span>
                                                    </a>
                                                )) : (
                                                    <div style={{ color: '#999', fontSize: 13, padding: 16, textAlign: 'center' }}>Chưa có link trong hội thoại này</div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* ─── Normal sidebar sections (hidden when viewAll is active) ─── */}
                                    {!sidebarViewAll && (
                                        <>
                                    {/* Danh sách nhắc hẹn */}
                                    <div>
                                        <div onClick={() => toggleSection('reminders')} style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <Clock size={16} color="#555" />
                                            <span style={{ flex: 1, fontSize: 13, color: '#333' }}>Danh sách nhắc hẹn</span>
                                            {expandedSections.reminders ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.reminders && (
                                            <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                                                <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                                                    <Clock size={20} color="#ccc" style={{ display: 'block', margin: '0 auto 6px' }} />
                                                    Chưa có nhắc hẹn nào
                                                </div>
                                                <div onClick={() => message.info('Tính năng đang phát triển')} style={{
                                                    textAlign: 'center', padding: '6px 0', marginTop: 4, cursor: 'pointer',
                                                    color: '#0068ff', fontSize: 13, fontWeight: 500, background: '#e8f0fe', borderRadius: 6,
                                                }}>
                                                    + Thêm nhắc hẹn
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Nhóm chung */}
                                    <div>
                                        <div onClick={() => toggleSection('commonGroups')} style={{ padding: '10px 16px', borderBottom: expandedSections.commonGroups ? '1px solid #f0f0f0' : '6px solid #f0f0f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <Users size={16} color="#555" />
                                            <span style={{ flex: 1, fontSize: 13, color: '#333' }}>Nhóm chung</span>
                                            {expandedSections.commonGroups ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.commonGroups && (
                                            <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '6px solid #f0f0f0' }}>
                                                {(() => {
                                                    const groups = conversations.filter(c => c.threadType === 'group');
                                                    return groups.length > 0 ? groups.slice(0, 5).map((g, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                                                            onClick={() => { setSelectedConvId(g._id); }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <Users size={14} color="#0068ff" />
                                                            </div>
                                                            <span style={{ fontSize: 13, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.contactName}</span>
                                                        </div>
                                                    )) : (
                                                        <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                                                            Không có nhóm chung
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Ảnh/Video Section */}
                                    <div style={{ borderBottom: '6px solid #f0f0f0' }}>
                                        <div onClick={() => toggleSection('media')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Ảnh/Video</span>
                                            {expandedSections.media ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.media && (
                                            <div style={{ padding: '0 16px 12px' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                    {(() => {
                                                        const mediaItems = messages
                                                            .filter(m => m.attachments?.some(a => a.mimeType?.startsWith('image/') || isImageUrl(a.url || a.data || ''))
                                                                || (m.content && /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i.test(m.content)))
                                                            .slice(-8);
                                                        return mediaItems.length > 0 ? mediaItems.map((m, i) => {
                                                            const imgSrc = m.attachments?.find(a => a.mimeType?.startsWith('image/'))?.url
                                                                || m.attachments?.find(a => a.mimeType?.startsWith('image/'))?.data
                                                                || m.content?.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i)?.[0];
                                                            return imgSrc ? (
                                                                <div key={i} style={{
                                                                    width: 72, height: 72, borderRadius: 4, overflow: 'hidden',
                                                                    cursor: 'pointer', background: '#f0f0f0',
                                                                }} onClick={() => window.open(imgSrc, '_blank')}>
                                                                    <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                </div>
                                                            ) : null;
                                                        }) : (
                                                            <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>Chưa có ảnh/video</div>
                                                        );
                                                    })()}
                                                </div>
                                                <div onClick={() => setSidebarViewAll('media')} style={{
                                                    textAlign: 'center', padding: '8px 0', marginTop: 4, cursor: 'pointer',
                                                    color: '#333', fontSize: 13, fontWeight: 500, background: '#f5f5f5', borderRadius: 6,
                                                    transition: 'background 0.15s',
                                                }} onMouseEnter={e => (e.currentTarget.style.background = '#eee')} onMouseLeave={e => (e.currentTarget.style.background = '#f5f5f5')}>
                                                    Xem tất cả
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* File Section */}
                                    <div style={{ borderBottom: '6px solid #f0f0f0' }}>
                                        <div onClick={() => toggleSection('files')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>File</span>
                                            {expandedSections.files ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.files && (
                                            <div style={{ padding: '0 16px 12px' }}>
                                                {(() => {
                                                    const fileItems = messages
                                                        .filter(m => m.attachments?.some(a => !a.mimeType?.startsWith('image/')))
                                                        .flatMap(m => m.attachments?.filter(a => !a.mimeType?.startsWith('image/')).map(a => ({ ...a, date: m.createdAt })) || [])
                                                        .slice(-5);
                                                    return fileItems.length > 0 ? (
                                                        <>
                                                            {fileItems.map((f, i) => (
                                                                <a key={i} href={f.url || f.data} download={f.filename} target="_blank" rel="noopener noreferrer" style={{
                                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                                                                    color: '#333', textDecoration: 'none', fontSize: 12, borderBottom: '1px solid #f5f5f5',
                                                                }}>
                                                                    <FileText size={16} color="#0068ff" />
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename || 'File'}</div>
                                                                        <div style={{ fontSize: 10, color: '#999' }}>{new Date(f.date).toLocaleDateString('vi-VN')}</div>
                                                                    </div>
                                                                </a>
                                                            ))}
                                                            <div onClick={() => setSidebarViewAll('files')} style={{
                                                                textAlign: 'center', padding: '8px 0', marginTop: 4, cursor: 'pointer',
                                                                color: '#333', fontSize: 13, fontWeight: 500, background: '#f5f5f5', borderRadius: 6,
                                                                transition: 'background 0.15s',
                                                            }} onMouseEnter={e => (e.currentTarget.style.background = '#eee')} onMouseLeave={e => (e.currentTarget.style.background = '#f5f5f5')}>
                                                                Xem tất cả
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>Chưa có File được chia sẻ</div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Link Section */}
                                    <div style={{ borderBottom: '6px solid #f0f0f0' }}>
                                        <div onClick={() => toggleSection('links')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Link</span>
                                            {expandedSections.links ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.links && (
                                            <div style={{ padding: '0 16px 12px' }}>
                                                {(() => {
                                                    const linkItems = messages
                                                        .filter(m => m.content && /https?:\/\/[^\s]+/i.test(m.content))
                                                        .map(m => {
                                                            const url = m.content.match(/https?:\/\/[^\s]+/i)?.[0] || '';
                                                            let domain = '';
                                                            try { domain = new URL(url).hostname; } catch { domain = url; }
                                                            return { url, domain, date: new Date(m.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) };
                                                        })
                                                        .slice(-5);
                                                    return linkItems.length > 0 ? (
                                                        <>
                                                            {linkItems.map((l, i) => (
                                                                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                                                                    textDecoration: 'none', borderBottom: '1px solid #f5f5f5',
                                                                }}>
                                                                    <div style={{
                                                                        width: 36, height: 36, borderRadius: 8, background: '#f0f2f5',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                                    }}>
                                                                        <Link size={16} color="#0068ff" />
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {l.url.length > 40 ? l.url.substring(0, 40) + '...' : l.url}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: '#0068ff' }}>{l.domain}</div>
                                                                    </div>
                                                                    <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{l.date}</span>
                                                                </a>
                                                            ))}
                                                            <div onClick={() => setSidebarViewAll('links')} style={{
                                                                textAlign: 'center', padding: '8px 0', marginTop: 4, cursor: 'pointer',
                                                                color: '#333', fontSize: 13, fontWeight: 500, background: '#f5f5f5', borderRadius: 6,
                                                                transition: 'background 0.15s',
                                                            }} onMouseEnter={e => (e.currentTarget.style.background = '#eee')} onMouseLeave={e => (e.currentTarget.style.background = '#f5f5f5')}>
                                                                Xem tất cả
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>Chưa có link</div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Contact Data (Dữ liệu thu thập) */}
                                    {contactData && (
                                        <div style={{ borderBottom: '6px solid #f0f0f0' }}>
                                            <div onClick={() => toggleSection('contactData')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <Database size={14} color="#0068ff" />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#333', flex: 1 }}>Dữ liệu thu thập</span>
                                                <Tag color="blue" style={{ fontSize: 10, borderRadius: 10 }}>{contactData.messageCount} tin nhắn</Tag>
                                                {expandedSections.contactData ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                            </div>
                                            {expandedSections.contactData && (
                                                <div style={{ padding: '0 16px 12px' }}>
                                                    {contactData.emails.length > 0 && (
                                                        <div style={{ marginBottom: 6 }}>
                                                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Email</div>
                                                            {contactData.emails.map((e: string, i: number) => (
                                                                <div key={i} onClick={() => { navigator.clipboard.writeText(e); message.success('Copied!'); }}
                                                                    style={{ padding: '3px 8px', background: '#e8f0fe', borderRadius: 6, marginBottom: 2, cursor: 'pointer', color: '#0068ff', fontSize: 12, display: 'inline-block', marginRight: 4 }}>
                                                                    {e}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {contactData.phones.length > 0 && (
                                                        <div style={{ marginBottom: 6 }}>
                                                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Số điện thoại</div>
                                                            {contactData.phones.map((p: string, i: number) => (
                                                                <div key={i} onClick={() => { navigator.clipboard.writeText(p); message.success('Copied!'); }}
                                                                    style={{ padding: '3px 8px', background: '#ecfdf5', borderRadius: 6, marginBottom: 2, cursor: 'pointer', color: '#065f46', fontSize: 12, display: 'inline-block', marginRight: 4 }}>
                                                                    {p}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                                        Lần đầu: {new Date(contactData.firstSeen).toLocaleDateString('vi-VN')} ·
                                                        Lần cuối: {new Date(contactData.lastSeen).toLocaleDateString('vi-VN')}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Thiết lập bảo mật */}
                                    <div>
                                        <div onClick={() => toggleSection('security')} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Thiết lập bảo mật</span>
                                            {expandedSections.security ? <ChevronDown size={16} color="#999" /> : <ChevronRight size={16} color="#999" />}
                                        </div>
                                        {expandedSections.security && (
                                            <div style={{ padding: '0 16px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#333', cursor: 'pointer' }}
                                                    onClick={() => message.info('Tính năng đang phát triển')}>
                                                    <Clock size={16} color="#555" />
                                                    <span style={{ flex: 1 }}>Tin nhắn tự xoá</span>
                                                    <span style={{ fontSize: 12, color: '#999' }}>Không bao giờ</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#333', cursor: 'pointer' }}
                                                    onClick={() => message.info('Tính năng đang phát triển')}>
                                                    <EyeOff size={16} color="#555" />
                                                    <span style={{ flex: 1 }}>Ẩn trò chuyện</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#e53e3e', cursor: 'pointer' }}
                                                    onClick={() => message.warning('Tính năng đang phát triển')}>
                                                    <AlertTriangle size={16} color="#e53e3e" />
                                                    <span>Báo xấu</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#e53e3e', cursor: 'pointer' }}
                                                    onClick={() => {
                                                        if (window.confirm('Bạn có chắc muốn xoá toàn bộ lịch sử trò chuyện?')) {
                                                            message.info('Tính năng đang phát triển');
                                                        }
                                                    }}>
                                                    <Trash2 size={16} color="#e53e3e" />
                                                    <span>Xoá lịch sử trò chuyện</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                        </>
                                    )}
                                </div>
                            )}
                            </div>{/* END flex row */}
                        </>
                    ) : (
                        <div style={styles.emptyColumn}>
                            <div style={{ width: 72, height: 72, borderRadius: 22, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                                <MessageSquare size={32} color="#94a3b8" strokeWidth={1.5} />
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginTop: 4 }}>
                                Chọn một hội thoại
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                                để bắt đầu trò chuyện
                            </div>
                        </div>
                    )}
            </div>
            </div>

            {/* ═══ Context Menu Overlay ═══ */}
            {contextMenu && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}
                    onClick={() => setContextMenu(null)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
                >
                    <div style={{
                        position: 'absolute',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: '#fff',
                        borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                        minWidth: 160,
                        fontSize: 13,
                        border: '1px solid #e5e7eb',
                    }}>
                        <div
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                            onMouseOver={e => (e.currentTarget.style.background = '#f5f3ff')}
                            onMouseOut={e => (e.currentTarget.style.background = '#fff')}
                            onClick={() => {
                                setReplyingTo(contextMenu.msg);
                                setContextMenu(null);
                            }}
                        >
                            <Reply size={14} color="#6366f1" />
                            <span>Trả lời</span>
                        </div>
                        {contextMenu.msg.sender.type === 'agent' && (
                            <div
                                style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f0f0f0' }}
                                onMouseOver={e => (e.currentTarget.style.background = '#fef2f2')}
                                onMouseOut={e => (e.currentTarget.style.background = '#fff')}
                                onClick={() => {
                                    if (socketRef.current && selectedAccountId && selectedConvId) {
                                        const conv = conversations.find(c => c._id === selectedConvId);
                                        socketRef.current.emit('zalo:undoMessage', {
                                            sessionId: selectedAccountId,
                                            msgId: contextMenu.msg._id,
                                            cliMsgId: contextMenu.msg.cliMsgId || contextMenu.msg._id,
                                            threadId: conv?.threadId || selectedConvId.replace('zca_', ''),
                                            threadType: conv?.threadType || 'user',
                                        });
                                    }
                                    // Remove from local messages
                                    setMessages(prev => prev.filter(m => m._id !== contextMenu.msg._id));
                                    setContextMenu(null);
                                }}
                            >
                                <Undo2 size={14} color="#ef4444" />
                                <span style={{ color: '#ef4444' }}>Thu hồi</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                        <QrcodeOutlined style={{ fontSize: 28, color: '#6366f1' }} />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 4, letterSpacing: '-0.02em' }}>
                        Quét mã QR để đăng nhập Zalo
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
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
                        border: '2px solid #e2e8f0',
                        borderRadius: 20,
                        overflow: 'hidden',
                        display: 'inline-block',
                        maxWidth: 640,
                        width: '100%',
                        boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
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
                        width: 240px !important;
                        min-width: 240px !important;
                    }
                    .zalo-conv-sidebar {
                        width: 300px !important;
                        min-width: 300px !important;
                    }
                }

                @media (max-width: 768px) {
                    .zalo-account-sidebar {
                        display: none !important;
                    }
                    .zalo-mobile-accounts {
                        display: none;
                        width: 100% !important;
                        flex-direction: column;
                        flex: 1;
                    }
                    .zalo-mobile-accounts.zalo-mobile-accounts-active {
                        display: flex !important;
                    }
                    .zalo-conv-sidebar {
                        display: none !important;
                        width: 100% !important;
                        min-width: 100% !important;
                        border-right: none !important;
                    }
                    .zalo-conv-sidebar.zalo-conv-active {
                        display: flex !important;
                    }
                    .zalo-chat-panel {
                        position: fixed !important;
                        left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important;
                        z-index: 50;
                        width: 100% !important;
                        background: #e5e7eb !important;
                        display: none !important;
                        flex-direction: column !important;
                    }
                    .zalo-chat-panel.zalo-chat-active {
                        display: flex !important;
                    }
                    .zalo-mobile-back {
                        display: inline-flex !important;
                    }
                    /* Info sidebar on mobile — slide-up panel */
                    .zalo-info-sidebar {
                        position: fixed !important;
                        left: 0 !important; right: 0 !important; bottom: 0 !important;
                        top: auto !important;
                        height: 70vh !important;
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        z-index: 60;
                        border-radius: 16px 16px 0 0 !important;
                        box-shadow: 0 -4px 24px rgba(0,0,0,0.15) !important;
                    }
                }
            `}</style>
        </>
    );
}

// ── Styles — Google/Apple-Inspired Premium Design ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        height: '100vh',
        background: '#f8fafc',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    },

    // ── Column 1: Account Sidebar ──
    accountSidebar: {
        width: 272,
        minWidth: 272,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    },
    sidebarHeader: {
        padding: '16px 16px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 64,
    },
    searchArea: {
        padding: '10px 14px 12px',
        borderBottom: '1px solid #f1f5f9',
    },
    accountList: {
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
    },
    accountItem: {
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        borderBottom: 'none',
        transition: 'all .2s ease',
        background: '#fff',
        alignItems: 'center',
        margin: '2px 8px',
        borderRadius: 14,
    },
    accountItemActive: {
        background: '#eef2ff',
        boxShadow: '0 1px 3px rgba(99,102,241,0.08)',
    },
    accountAvatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    accountName: {
        fontWeight: 600,
        fontSize: 13,
        color: '#1e293b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
    },
    accountTime: {
        fontSize: 10,
        color: '#94a3b8',
        flexShrink: 0,
    },
    accountOwner: {
        fontSize: 11,
        color: '#94a3b8',
        display: 'flex',
        alignItems: 'center',
    },

    // ── Column 2: Conversation Sidebar ──
    convSidebar: {
        width: 340,
        minWidth: 340,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    },
    convSidebarHeader: {
        padding: '16px 16px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 60,
    },
    convList: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '4px 0',
    },
    convItem: {
        display: 'flex',
        gap: 12,
        padding: '14px 14px',
        cursor: 'pointer',
        borderBottom: 'none',
        transition: 'all .2s ease',
        margin: '2px 8px',
        borderRadius: 14,
    },
    convItemActive: {
        background: '#eef2ff',
        boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.12)',
    },
    convAvatar: {
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#eef2ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden' as const,
    },
    convName: {
        fontWeight: 600,
        fontSize: 13.5,
        color: '#1e293b',
        letterSpacing: '-0.01em',
    },
    convTime: {
        fontSize: 11,
        color: '#94a3b8',
    },
    convPreview: {
        fontSize: 12.5,
        color: '#64748b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        maxWidth: 180,
    },

    // ── Column 3: Chat Panel ──
    chatPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#e5e7eb',
    },
    chatHeader: {
        padding: '14px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 64,
    },
    chatAvatar: {
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #0068ff 0%, #4e8cff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,104,255,0.2)',
        overflow: 'hidden' as const,
    },
    messagesArea: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '16px 20px',
        background: '#e5e7eb',
    },
    msgRow: {
        display: 'flex',
        marginBottom: 4,
        alignItems: 'flex-end',
        gap: 8,
    },
    msgBubble: {
        maxWidth: '60%',
        padding: '10px 14px',
        borderRadius: 18,
        fontSize: 14,
        lineHeight: 1.5,
        wordBreak: 'break-word' as const,
    },
    msgAgent: {
        background: '#dbebff',
        color: '#1a1a2e',
        borderBottomRightRadius: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    },
    msgCustomer: {
        background: '#ffffff',
        color: '#1a1a2e',
        borderBottomLeftRadius: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    },
    systemMsg: {
        textAlign: 'center' as const,
        color: '#6b7280',
        fontSize: 12,
        padding: '8px 0',
        margin: '4px 0',
    },
    msgTime: {
        fontSize: 11,
        color: '#8b95a2',
        marginTop: 4,
        textAlign: 'right' as const,
    },
    msgImage: {
        maxWidth: 280,
        borderRadius: 12,
        cursor: 'pointer',
    },
    fileLink: {
        color: '#0068ff',
        textDecoration: 'none',
        fontWeight: 500,
    },
    inputArea: {
        padding: '12px 20px',
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        minHeight: 68,
    },
    textInput: {
        flex: 1,
        padding: '11px 18px',
        border: '1.5px solid #e2e8f0',
        borderRadius: 24,
        fontSize: 13.5,
        outline: 'none',
        transition: 'all .2s ease',
        background: '#f8fafc',
    },

    // ── Shared states ──
    emptyColumn: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        gap: 8,
    },
    onboardingState: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    onboardingCard: {
        textAlign: 'center' as const,
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
    },
    onboardingSteps: {
        textAlign: 'left' as const,
        width: '100%',
        background: '#f8fafc',
        borderRadius: 16,
        padding: '18px 22px',
        border: '1px solid #e2e8f0',
    },
    onboardingStep: {
        fontSize: 13,
        color: '#475569',
        padding: '8px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 10,
        background: '#6366f1',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(99,102,241,0.2)',
    },
};

// ── Subcomponents ──

const MessageComposer = ({ sending, onSend, onImageSend, onStickerSend, socketRef, selectedAccountId }: {
    sending: boolean;
    onSend: (text: string) => void;
    onImageSend: (file: File) => void;
    onStickerSend?: (sticker: { id: number; cateId: number; type: number }) => void;
    socketRef?: React.RefObject<any>;
    selectedAccountId?: string | null;
}) => {
    const [inputText, setInputText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [stickerSearch, setStickerSearch] = useState('');
    const [stickerResults, setStickerResults] = useState<Array<{ id: number; cateId: number; type: number; stickerUrl: string }>>([]);
    const [stickerLoading, setStickerLoading] = useState(false);

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

    const handleStickerSearch = () => {
        if (!stickerSearch.trim() || !socketRef?.current || !selectedAccountId) return;
        setStickerLoading(true);
        socketRef.current.emit('zalo:searchStickers', {
            sessionId: selectedAccountId,
            keyword: stickerSearch.trim(),
        });
        // Listen for result
        socketRef.current.once('zalo:stickersResult', (data: any) => {
            setStickerResults(data.stickers || []);
            setStickerLoading(false);
        });
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Sticker Picker Popover */}
            {showStickerPicker && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px 12px 0 0',
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
                    maxHeight: 260,
                    overflow: 'hidden',
                    zIndex: 10,
                }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Tìm sticker... (ví dụ: hi, vui, buồn)"
                            value={stickerSearch}
                            onChange={e => setStickerSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleStickerSearch(); }}
                            style={{
                                flex: 1,
                                border: '1px solid #e5e7eb',
                                borderRadius: 8,
                                padding: '6px 10px',
                                fontSize: 13,
                                outline: 'none',
                            }}
                        />
                        <Button size="small" type="primary" onClick={handleStickerSearch} loading={stickerLoading}
                            style={{ borderRadius: 8, background: '#0068ff', border: 'none' }}>
                            Tìm
                        </Button>
                        <Button size="small" type="text" icon={<XIcon size={14} />} onClick={() => setShowStickerPicker(false)} />
                    </div>
                    <div style={{
                        padding: 12,
                        overflowY: 'auto',
                        maxHeight: 200,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        justifyContent: stickerResults.length > 0 ? 'flex-start' : 'center',
                    }}>
                        {stickerResults.length === 0 ? (
                            <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                                {stickerLoading ? 'Đang tìm...' : 'Nhập từ khóa để tìm sticker'}
                            </div>
                        ) : (
                            stickerResults.map((s, i) => (
                                <div key={i}
                                    onClick={() => {
                                        onStickerSend?.({ id: s.id, cateId: s.cateId, type: s.type });
                                        setShowStickerPicker(false);
                                    }}
                                    style={{
                                        width: 64, height: 64,
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: '#f9fafb',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.background = '#eef2ff')}
                                    onMouseOut={e => (e.currentTarget.style.background = '#f9fafb')}
                                >
                                    {s.stickerUrl ? (
                                        <img src={s.stickerUrl} alt="sticker" style={{ width: 52, height: 52, objectFit: 'contain' }}
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                        <span style={{ fontSize: 10, color: '#999' }}>{s.id}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

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
                <Button
                    type="text"
                    icon={<Smile size={18} color={showStickerPicker ? '#0068ff' : '#666'} />}
                    onClick={() => setShowStickerPicker(!showStickerPicker)}
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
                                const blob = items[i].getAsFile();
                                if (blob) {
                                    // Create proper File from clipboard blob with correct name
                                    const ext = blob.type.split('/')[1] || 'png';
                                    const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: blob.type });
                                    onImageSend(file);
                                }
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
                    style={{ borderRadius: 24, background: '#0068ff', border: 'none', width: 40, height: 40 }}
                />
            </div>
        </div>
    );
};
