import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Input, Badge, Spin, Empty, Tag, Button, message, Tooltip, Popover, Select, DatePicker, Form, Modal } from 'antd';
import {
    Search, Send, Paperclip, ArrowLeft, X as XIcon,
    MessageSquare, Clock, User, Image as ImageIcon, RotateCw, Filter, Check, CheckCheck, UserCheck, UserX, Users, Zap, Reply, Edit2, Trash2, Globe
} from 'lucide-react';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { httpClient } from '../../../lib/http/client';
import io, { Socket } from 'socket.io-client';
import { Conversation, Message } from '../../../types';
import { VisitorProfileSidebar } from '../../../features/inbox/components/VisitorProfileSidebar';
import { useQueryClient } from '@tanstack/react-query';
import { useTotalUnreadCount, conversationKeys, useAddInternalNote } from '../../../domains/conversation';
import AppLayout from '../../../components/layout/AppLayout';

const { RangePicker } = DatePicker;

interface MacroItem {
    _id: string;
    scope: 'personal' | 'team';
    title: string;
    content: string;
    shortcut?: string;
    category?: string;
}


// ── Helpers ──
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

import { playNotificationSound } from '../../../utils/audio';

function visitorName(conv: Conversation) {
    return conv.visitorInfo?.name || conv.visitorInfo?.email || conv.visitorId?.slice(0, 8) || 'Khách';
}

function getAssignedId(conv: Conversation): string | undefined {
    if (!conv.assignedTo) return undefined;
    if (typeof conv.assignedTo === 'string') return conv.assignedTo;
    return conv.assignedTo._id;
}

function getAssignedName(conv: Conversation): string | undefined {
    if (!conv.assignedTo) return undefined;
    if (typeof conv.assignedTo === 'object' && conv.assignedTo.name) return conv.assignedTo.name;
    return undefined;
}

// ── Zalo image URL detection & rendering ──
const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp)(\?[^\s]*)?/gi;
const ZALO_CDN_REGEX = /https?:\/\/photo-stal[\w-]*\.zdn\.vn\/[^\s]+/gi;

function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /photo-stal[\w-]*\.zdn\.vn\//i.test(url);
}

function renderMessageContent(content: string, isAgent: boolean) {
    if (!content) return null;

    // Combine both patterns
    const combinedRegex = new RegExp(`(${IMAGE_URL_REGEX.source}|${ZALO_CDN_REGEX.source})`, 'gi');
    const parts: Array<{ type: 'text' | 'image'; value: string }> = [];
    let lastIndex = 0;
    let match;

    // Reset regex state
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

    // If no images found, render as plain text
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
                            // Fallback: show as link if image fails to load
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

export default function InboxPage() {
    const router = useRouter();
    const { workspaceId } = router.query as { workspaceId: string };
    const { data: meData, isLoading: meLoading } = useGetMe();
    const me = meData?.data;

    const queryClient = useQueryClient();
    const { data: unreadCounts } = useTotalUnreadCount(workspaceId, !!workspaceId && !!meData);
    const totalUnreadCount = unreadCounts?.totalUnread || 0;
    const inboxUnreadCount = unreadCounts?.inboxUnread || 0;
    const zaloUnreadCount = unreadCounts?.zaloUnread || 0;

    useEffect(() => {
        if (totalUnreadCount > 0) {
            document.title = `(${totalUnreadCount}) Inbox | NemarChat`;
        } else {
            document.title = `Inbox | NemarChat`;
        }
    }, [totalUnreadCount]);

    // State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [filterChannel, setFilterChannel] = useState<string>('all');
    const [filterDateFrom, setFilterDateFrom] = useState<string | null>(null);
    const [filterDateTo, setFilterDateTo] = useState<string | null>(null);
    const [filterTags, setFilterTags] = useState<string[]>([]);
    const [filterSortBy, setFilterSortBy] = useState<'newest' | 'oldest'>('newest');
    const [filterDomain, setFilterDomain] = useState<string[]>([]);
    const [domainOptions, setDomainOptions] = useState<{label: string, value: string}[]>([]);

    const [typingVisitor, setTypingVisitor] = useState<string | null>(null);
    const [msgPage, setMsgPage] = useState(1);
    const [hasMoreMsgs, setHasMoreMsgs] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [workspaceMembers, setWorkspaceMembers] = useState<Array<{ _id: string; name: string; email?: string; role?: string }>>([]);

    const isMemberOnly = workspaceMembers.find(m => m._id === me?.user?.id)?.role === 'member';
    const [workspaceTags, setWorkspaceTags] = useState<string[]>([]);
    const [noteText, setNoteText] = useState('');
    const [showNoteInput, setShowNoteInput] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [macros, setMacros] = useState<MacroItem[]>([]);
    const [showMacroPopover, setShowMacroPopover] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [agentPresence, setAgentPresence] = useState<Record<string, 'online' | 'away' | 'offline'>>({});
    const [visitorOnlineMap, setVisitorOnlineMap] = useState<Record<string, 'online' | 'idle' | 'offline'>>({});

    const addInternalNote = useAddInternalNote();

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);
    const [newMsgCount, setNewMsgCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const selectedConvIdRef = useRef<string | null>(null);
    const messagesRef = useRef<Message[]>([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Keep ref in sync with state (so socket callbacks always see latest value)
    useEffect(() => {
        selectedConvIdRef.current = selectedConvId;
    }, [selectedConvId]);

    // ── Fetch conversations ──
    const fetchConversations = useCallback(async () => {
        if (!workspaceId) return;
        const currentWorkspaceId = workspaceId;
        try {
            setLoadingConvs(true);
            const params = new URLSearchParams();
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterAssignee !== 'all') params.append('assignee', filterAssignee);
            if (filterChannel !== 'all') params.append('channel', filterChannel);
            if (filterDateFrom) params.append('dateFrom', filterDateFrom);
            if (filterDateTo) params.append('dateTo', filterDateTo);
            if (filterDomain && filterDomain.length > 0) {
                filterDomain.forEach(d => params.append('domain', d));
            }
            filterTags.forEach(tag => params.append('tags', tag));
            if (filterSortBy !== 'newest') params.append('sortBy', filterSortBy);

            const res = await httpClient.get(`/conversations/workspace/${workspaceId}?${params.toString()}`);
            if (workspaceId !== currentWorkspaceId) return; // Prevent race conditions on workspace switch
            if (res.data?.success) {
                setConversations(res.data.data.items || res.data.data || []);
            }
        } catch { /* handled by interceptor */ }
        finally { setLoadingConvs(false); }
    }, [workspaceId, filterStatus, filterAssignee, filterChannel, filterDateFrom, filterDateTo, filterTags, filterSortBy, filterDomain]);

    useEffect(() => {
        setConversations([]);
        setMessages([]);
        setMsgPage(1);
        setHasMoreMsgs(false);
        fetchConversations();
    }, [workspaceId]); // Explicitly clear state on workspace switch so React does not persist it across route changes

    // ── Fetch workspace tags ──
    useEffect(() => {
        if (!workspaceId) return;
        httpClient.get(`/workspaces/${workspaceId}/tags`)
            .then(res => setWorkspaceTags(res.data?.data || []))
            .catch(() => {});
        // Also fetch macros
        httpClient.get(`/macros/workspace/${workspaceId}`)
            .then(res => setMacros(res.data?.data || []))
            .catch(() => {});
        // Also fetch domains
        httpClient.get(`/conversations/workspace/${workspaceId}/domains`)
            .then(res => setDomainOptions((res.data?.data || []).map((d: string) => ({ label: d, value: d }))))
            .catch(() => {});
    }, [workspaceId]);

    // ── Fetch messages for selected conversation ──
    const fetchMessages = useCallback(async (convId: string, jumpToMessageId?: string) => {
        setLoadingMsgs(true);
        let targetLimit = 30;
        let targetPageNum = 1;

        try {
            if (jumpToMessageId) {
                // Fetch context page
                const ctxRes = await httpClient.get(`/conversations/workspace/${workspaceId}/${convId}/messages/${jumpToMessageId}/context`);
                if (ctxRes.data?.success && ctxRes.data.data?.page) {
                    targetPageNum = ctxRes.data.data.page;
                    targetLimit = targetPageNum * 30;
                }
            }

            const res = await httpClient.get(
                `/conversations/workspace/${workspaceId}/${convId}/messages`,
                { params: { page: 1, limit: targetLimit } }
            );
            if (res.data?.success) {
                const items = res.data.data.items || [];
                const total = res.data.data.total || 0;
                setMessages(items);
                setMsgPage(targetPageNum);
                setHasMoreMsgs(items.length < total);

                // Scroll and highlight if jumping
                if (jumpToMessageId) {
                    setTimeout(() => {
                        const el = document.getElementById(`msg-${jumpToMessageId}`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.transition = 'background-color 1s ease';
                            el.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
                            el.style.borderRadius = '8px';
                            setTimeout(() => {
                                el.style.backgroundColor = 'transparent';
                            }, 3000);
                        }
                    }, 500); // Wait for render
                }
            }
        } catch { /* */ }
        finally { setLoadingMsgs(false); }
    }, [workspaceId]);

    const loadOlderMessages = useCallback(async () => {
        if (!selectedConvId || !hasMoreMsgs || loadingOlder) return;
        setLoadingOlder(true);
        const nextPage = msgPage + 1;
        try {
            const res = await httpClient.get(
                `/conversations/workspace/${workspaceId}/${selectedConvId}/messages`,
                { params: { page: nextPage, limit: 30 } }
            );
            if (res.data?.success) {
                const olderItems = res.data.data.items || [];
                const total = res.data.data.total || 0;
                setMessages((prev) => [...olderItems, ...prev]);
                setMsgPage(nextPage);
                setHasMoreMsgs(nextPage * 30 < total);
            }
        } catch { /* */ }
        finally { setLoadingOlder(false); }
    }, [selectedConvId, workspaceId, msgPage, hasMoreMsgs, loadingOlder]);

    useEffect(() => {
        if (selectedConvId) {
            const jumpToMsgId = router.query.messageId as string;
            fetchMessages(selectedConvId, jumpToMsgId);

            // Clean up the URL after jumping so clicking other convs doesn't jump
            if (jumpToMsgId) {
                const newQuery = { ...router.query };
                delete newQuery.messageId;
                router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
            }

            // Ensure agent is in this conversation's socket room
            socketRef.current?.emit('join:conversation', { conversationId: selectedConvId });
            // Mark as read (reset unread count)
            httpClient.patch(`/conversations/workspace/${workspaceId}/${selectedConvId}/read`).then(() => {
                queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });
            }).catch(() => { });
            setConversations((prev) =>
                prev.map((c) => c._id === selectedConvId ? { ...c, unreadCount: 0 } : c)
            );
        } else {
            setMessages([]);
        }
    }, [selectedConvId, fetchMessages, workspaceId, router]);

    // ── Smart auto-scroll (only when user is at bottom) ──
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        setNewMsgCount(0);
    }, []);

    const handleMessagesScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        // Consider "at bottom" if within 80px of the bottom
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        isAtBottomRef.current = atBottom;
        if (atBottom) setNewMsgCount(0);
    }, []);

    useEffect(() => {
        if (isAtBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            // Count new messages while scrolled up (only from non-self senders)
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.sender?.type === 'visitor') {
                setNewMsgCount(prev => prev + 1);
            }
        }
    }, [messages]);

    // Always scroll on typing indicator (lightweight)
    useEffect(() => {
        if (typingVisitor && isAtBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [typingVisitor]);

    // Scroll to bottom when switching conversations
    useEffect(() => {
        if (selectedConvId) {
            isAtBottomRef.current = true;
            setNewMsgCount(0);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
        }
    }, [selectedConvId]);

    // ── Socket.IO connection ──
    useEffect(() => {
        if (!workspaceId || !me) return;

        const token = localStorage.getItem('nemark_token');
        if (!token) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';
        const baseUrl = apiUrl.replace(/\/api$/, '');

        const socket = io(`${baseUrl}/agent`, {
            auth: { token },
            query: { workspaceId },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 30000,
            reconnectionAttempts: Infinity,
            randomizationFactor: 0.5,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Inbox] Socket connected:', socket.id);
            // Join all open conversation rooms
            conversations.forEach((c) => {
                socket.emit('join:conversation', { conversationId: c._id });
            });

            // ── Backfill missed receipts on reconnect ──
            // Re-fetch conversation list (includes fresh unread counts)
            fetchConversations();
            // Invalidate total unread count
            queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });

            // Backfill message statuses for the currently open conversation
            const activeConvId = selectedConvIdRef.current;
            if (activeConvId) {
                httpClient.get(`/conversations/workspace/${workspaceId}/${activeConvId}/receipts`)
                    .then((res) => {
                        if (res.data?.success) {
                            const { statuses } = res.data.data as {
                                readCursors: Array<{ participantId: string; participantType: string; lastReadMessageId: string }>;
                                statuses: Record<string, string>;
                            };
                            setMessages((prev) =>
                                prev.map((m) => {
                                    const freshStatus = statuses[(m._id as any).toString()];
                                    if (freshStatus && freshStatus !== m.status) {
                                        return { ...m, status: freshStatus as any };
                                    }
                                    return m;
                                })
                            );
                        }
                    })
                    .catch(() => { /* silent */ });
            }
        });

        // ── Heartbeat (30s) to keep agent online ──
        const heartbeatInterval = setInterval(() => {
            socket.emit('heartbeat');
        }, 30000);

        // ── Fetch initial agent presence ──
        httpClient.get(`/workspaces/${workspaceId}/presence`)
            .then(res => {
                const agents = res.data?.data?.agents || [];
                const map: Record<string, 'online' | 'away' | 'offline'> = {};
                agents.forEach((a: { userId: string; status: 'online' | 'away' | 'offline' }) => {
                    map[a.userId] = a.status;
                });
                setAgentPresence(map);
            })
            .catch(() => {});

        // ── New conversation ──
        socket.on('conversation:new', (data: { conversation: Conversation }) => {
            if ((data.conversation as any).workspaceId?.toString() !== workspaceId && data.conversation.workspaceId !== workspaceId) return;
            setConversations((prev) => {
                const exists = prev.find((c) => c._id === data.conversation._id);
                if (exists) return prev;
                playNotificationSound(); // sound on new active incoming lead
                return [data.conversation, ...prev];
            });
            // Auto-join room
            socket.emit('join:conversation', { conversationId: data.conversation._id });
        });

        // ── Conversation updated (new message) ──
        socket.on('conversation:updated', (data: { conversationId: string; lastMessage: any }) => {
            const lm = data.lastMessage;
            const preview = lm?.content
                ? (lm.sender?.type === 'visitor' ? '' : `${lm.sender?.name || 'Agent'}: `) +
                (lm.content.length > 50 ? lm.content.slice(0, 50) + '…' : lm.content)
                : lm?.type === 'image' ? '📷 Hình ảnh'
                    : lm?.type === 'file' ? '📎 Tệp đính kèm'
                        : '';

            const isFromVisitor = lm?.sender?.type === 'visitor';
            const isWindowFocused = !document.hidden;
            const isTargetSelected = data.conversationId === selectedConvIdRef.current;

            // If the message is from a visitor, and the agent is NOT actively looking at this conversation, 
            // play sound and increment. 
            // BUT if the agent IS looking at it, we should automatically mark it as read on the server
            // and NOT increment the local unread count.
            if (isFromVisitor) {
                if (!isTargetSelected || !isWindowFocused) {
                    playNotificationSound();
                } else {
                    // Agent is actively looking at this conversation, mark it as read automatically
                    httpClient.patch(`/conversations/workspace/${workspaceId}/${data.conversationId}/read`).then(() => {
                        queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });
                    }).catch(() => { });
                }
            }

            if (isFromVisitor && (!isTargetSelected || !isWindowFocused)) {
                queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });
            }

            setConversations((prev) =>
                prev.map((c) =>
                    c._id === data.conversationId
                        ? {
                            ...c,
                            lastMessageAt: lm?.createdAt || new Date().toISOString(),
                            lastMessagePreview: preview,
                            unreadCount: (isFromVisitor && (!isTargetSelected || !isWindowFocused))
                                ? (c.unreadCount || 0) + 1
                                : ((isFromVisitor && isTargetSelected && isWindowFocused) ? 0 : c.unreadCount)
                        }
                        : c
                ).sort((a, b) =>
                    new Date(b.lastMessageAt || b.createdAt).getTime() -
                    new Date(a.lastMessageAt || a.createdAt).getTime()
                )
            );
        });

        // ── Conversation closed ──
        socket.on('conversation:closed', (data: { conversationId: string }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId ? { ...c, status: 'closed' } : c)
            );
        });

        // ── Conversation reopened ──
        socket.on('conversation:reopened', (data: { conversationId: string }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId ? { ...c, status: 'open' } : c)
            );
        });

        // ── Conversation assigned/unassigned ──
        socket.on('conversation:assigned', (data: { conversationId: string; assignedTo: { id: string; name: string } | null }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId
                    ? { ...c, assignedTo: data.assignedTo ? { _id: data.assignedTo.id, name: data.assignedTo.name } : undefined }
                    : c
                )
            );
        });

        // ── Conversation status changed (pending) ──
        socket.on('conversation:statusChanged', (data: { conversationId: string; status: string }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId ? { ...c, status: data.status as Conversation['status'] } : c)
            );
        });

        // ── Priority changed ──
        socket.on('conversation:priorityChanged', (data: { conversationId: string; priority: string; slaDeadline: string | null }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId
                    ? { ...c, priority: data.priority as Conversation['priority'], slaDeadline: data.slaDeadline || undefined }
                    : c
                )
            );
        });

        // ── SLA warning ──
        socket.on('sla:warning', (data: { conversationId: string; type: 'approaching' | 'breached'; priority: string }) => {
            if (data.type === 'breached') {
                message.error(`⚠️ SLA đã quá hạn cho cuộc hội thoại ${data.conversationId.slice(-6)}`);
            } else {
                message.warning(`⏰ SLA sắp hết hạn cho cuộc hội thoại ${data.conversationId.slice(-6)}`);
            }
        });

        // ── Conversations requeued (agent offline) ──
        socket.on('conversation:requeued', (data: { agentId: string; count: number }) => {
            message.info(`${data.count} cuộc hội thoại đã được trả về hàng đợi (agent offline)`);
            // Refresh conversation list
            setConversations((prev) =>
                prev.map((c) =>
                    (c.assignedTo && typeof c.assignedTo === 'object' && (c.assignedTo as any)._id === data.agentId)
                        ? { ...c, assignedTo: undefined }
                        : c
                )
            );
        });

        // ── Tags changed ──
        socket.on('conversation:tagsChanged', (data: { conversationId: string; tags: string[] }) => {
            setConversations((prev) =>
                prev.map((c) => c._id === data.conversationId ? { ...c, tags: data.tags } : c)
            );
        });

        // ── Internal note ──
        socket.on('note:new', (data: { conversationId: string; note: Message }) => {
            if (data.conversationId === selectedConvIdRef.current) {
                setMessages((prev) => {
                    if (prev.find(m => m._id === data.note._id)) return prev;
                    return [...prev, data.note];
                });
            }
        });

        // ── New message in active conversation ──
        socket.on('message:new', (msg: Message) => {
            // Emit received for visitor messages
            if (msg.sender?.type === 'visitor') {
                socket.emit('message:delivered', {
                    messageIds: [msg._id],
                    conversationId: msg.conversationId
                });
            }

            // Skip own agent messages (already shown via optimistic UI + API ACK)
            if (msg.sender?.type === 'agent' && msg.sender?.id === me?.user?.id) return;

            // Only add to messages list if it belongs to the currently viewed conversation
            if (msg.conversationId !== selectedConvIdRef.current) return;

            setMessages((prev) => {
                if (prev.find((m) => m._id === msg._id)) return prev; // dedup
                return [...prev, msg];
            });
        });

        // ── Message Edited/Recalled ──
        socket.on('message:edited', (editedMsg: Message) => {
            setMessages((prev) => prev.map(m => m._id === editedMsg._id ? editedMsg : m));
        });
        socket.on('message:recalled', (data: { messageId: string; conversationId: string }) => {
            if (data.conversationId === selectedConvIdRef.current) {
                setMessages((prev) => prev.map(m => m._id === data.messageId ? { ...m, isDeleted: true } : m));
            }
        });

        // ── Message Status Updates ──
        socket.on('message:updated', (data: { messageIds: string[], status: 'delivered' | 'read' }) => {
            setMessages((prev) =>
                prev.map((m) =>
                    data.messageIds.includes(m._id) ? { ...m, status: data.status } : m
                )
            );
        });

        socket.on('messages:read', (data: { conversationId: string, lastReadMessageId: string, participantId: string, participantType: string }) => {
            // If the current agent read this conversation on another device
            if (data.participantType === 'agent' && data.participantId === me?.user?.id) {
                setConversations(prev => prev.map(c => c._id === data.conversationId ? { ...c, unreadCount: 0 } : c));
                queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });
            }

            if (data.conversationId !== selectedConvIdRef.current) return;
            
            setMessages((prev) => {
                const targetIdx = prev.findIndex(m => m._id === data.lastReadMessageId);
                if (targetIdx === -1) return prev;
                const targetTime = new Date(prev[targetIdx].createdAt).getTime();

                return prev.map((m) => {
                    const isOppositeSender = (data.participantType === 'visitor' && m.sender.type === 'agent') ||
                                             (data.participantType === 'agent' && m.sender.type === 'visitor');
                    if (isOppositeSender && new Date(m.createdAt).getTime() <= targetTime && m.status !== 'read') {
                        return { ...m, status: 'read' as any };
                    }
                    return m;
                });
            });
        });

        // ── Typing indicators ──
        socket.on('typing:start', (data: { conversationId: string; sender: any }) => {
            if (data.sender?.type === 'visitor') {
                setTypingVisitor(data.sender.id);
                // Auto-clear after 3s
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setTypingVisitor(null), 3000);
            }
        });

        socket.on('typing:stop', (data: { sender: any }) => {
            if (data.sender?.type === 'visitor') setTypingVisitor(null);
        });

        // ── Presence events ──
        socket.on('presence:agentStatus', (data: { userId: string; name?: string; status: 'online' | 'away' | 'offline' }) => {
            setAgentPresence(prev => ({ ...prev, [data.userId]: data.status }));
        });

        socket.on('presence:visitorOnline', (data: { visitorId: string }) => {
            setVisitorOnlineMap(prev => ({ ...prev, [data.visitorId]: 'online' }));
        });

        socket.on('presence:visitorOffline', (data: { visitorId: string }) => {
            setVisitorOnlineMap(prev => ({ ...prev, [data.visitorId]: 'offline' }));
        });

        // ── Visibility Change Listener ──
        // If the window regains focus and the agent is on a conversation, mark it as read immediately
        const handleVisibilityChange = () => {
            if (!document.hidden && selectedConvIdRef.current) {
                httpClient.patch(`/conversations/workspace/${workspaceId}/${selectedConvIdRef.current}/read`).catch(() => { });
                setConversations((prev) =>
                    prev.map((c) => c._id === selectedConvIdRef.current ? { ...c, unreadCount: 0 } : c)
                );

                // Emit message:seen for the latest visitor message if exists
                const visitorMsgs = messagesRef.current.filter(m => m.sender.type === 'visitor');
                if (visitorMsgs.length > 0) {
                    socket.emit('message:seen', {
                        conversationId: selectedConvIdRef.current,
                        messageId: visitorMsgs[visitorMsgs.length - 1]._id
                    });
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(heartbeatInterval);
            socket.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, me]);

    // Join new conversation rooms when list updates
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket?.connected) return;
        conversations.forEach((c) => {
            socket.emit('join:conversation', { conversationId: c._id });
        });
    }, [conversations]);

    // ── Send text message ──
    const handleSend = async () => {
        if (!inputText.trim() || !selectedConvId || !workspaceId || sending) return;
        const text = inputText.trim();
        setInputText('');
        const replyContext = replyingTo ? {
            messageId: replyingTo._id,
            content: replyingTo.content,
            senderName: replyingTo.sender.name || (replyingTo.sender.type === 'visitor' ? 'Khách' : 'Agent')
        } : undefined;
        setReplyingTo(null);
        setSending(true);

        // Optimistic
        const tempMsg: Message = {
            _id: 'tmp_' + Date.now(),
            conversationId: selectedConvId,
            sender: { type: 'agent', id: me?.user?.id || '', name: me?.user?.name || 'Agent' },
            content: text,
            type: 'text',
            createdAt: new Date().toISOString(),
            replyTo: replyContext,
        };
        setMessages((prev) => [...prev, tempMsg]);

        try {
            const clientMessageId = crypto.randomUUID();
            const res = await httpClient.post(
                `/conversations/workspace/${workspaceId}/${selectedConvId}/messages`,
                { content: text, type: 'text', clientMessageId, replyTo: replyContext }
            );
            if (res.data?.success) {
                setMessages((prev) =>
                    prev.map((m) => m._id === tempMsg._id ? res.data.data : m)
                );
            }
        } catch {
            message.error('Gửi tin nhắn thất bại');
            setMessages((prev) => prev.map((m) => m._id === tempMsg._id ? { ...m, status: 'error' } : m));
        }
        setSending(false);
    };

    // ── Retry sending message ──
    const retryMessage = async (msg: Message) => {
        if (!selectedConvId || !workspaceId) return;

        // Optimistically set back to sending state
        setMessages((prev) => prev.map((m) => m._id === msg._id ? { ...m, status: undefined } : m));

        try {
            const clientMessageId = msg.clientMessageId || crypto.randomUUID();
            const payload = {
                content: msg.content,
                type: msg.type,
                attachments: msg.attachments,
                clientMessageId
            };
            const res = await httpClient.post(
                `/conversations/workspace/${workspaceId}/${selectedConvId}/messages`,
                payload
            );
            if (res.data?.success) {
                setMessages((prev) =>
                    prev.map((m) => m._id === msg._id ? res.data.data : m)
                );
            }
        } catch {
            setMessages((prev) => prev.map((m) => m._id === msg._id ? { ...m, status: 'error' } : m));
        }
    };

    // ── Auto-retry on network reconnect ──
    useEffect(() => {
        const handleOnline = () => {
            const failedMessages = messagesRef.current.filter(m => m.status === 'error');
            if (failedMessages.length > 0) {
                console.log(`[Inbox] Network restored. Retrying ${failedMessages.length} messages...`);
                failedMessages.forEach(msg => retryMessage(msg));
            }
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [workspaceId, selectedConvId]);

    // ── Send file/image ──
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedConvId || !workspaceId) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const b64 = ev.target?.result as string;
            const msgType = file.type.startsWith('image/') ? 'image' : 'file';
            const attachment = { data: b64, filename: file.name, mimeType: file.type, size: file.size };

            const tempMsg: Message = {
                _id: 'tmp_' + Date.now(),
                conversationId: selectedConvId!,
                sender: { type: 'agent', id: me?.user?.id || '', name: me?.user?.name || 'Agent' },
                content: '',
                type: msgType as any,
                attachments: [attachment],
                createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, tempMsg]);

            try {
                const clientMessageId = crypto.randomUUID();
                const res = await httpClient.post(
                    `/conversations/workspace/${workspaceId}/${selectedConvId}/messages`,
                    { content: '', type: msgType, attachments: [attachment], clientMessageId }
                );
                if (res.data?.success) {
                    setMessages((prev) =>
                        prev.map((m) => m._id === tempMsg._id ? res.data.data : m)
                    );
                }
            } catch {
                message.error('Gửi file thất bại');
                setMessages((prev) => prev.map((m) => m._id === tempMsg._id ? { ...m, status: 'error' } : m));
            }
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset
    };

    // ── Close conversation ──
    const handleClose = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/close`);
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, status: 'closed' } : c)
            );
            message.success('Đã đóng cuộc hội thoại');
        } catch {
            message.error('Lỗi khi đóng cuộc hội thoại');
        }
    };

    // ── Reopen conversation ──
    const handleReopen = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/reopen`);
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, status: 'open' } : c)
            );
            message.success('Đã mở lại cuộc hội thoại');
        } catch {
            message.error('Lỗi khi mở lại cuộc hội thoại');
        }
    };

    // ── Set pending ──
    const handleSetPending = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/pending`);
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, status: 'pending' } : c)
            );
            message.success('Đã chuyển sang chờ xử lý');
        } catch {
            message.error('Lỗi khi chuyển trạng thái');
        }
    };

    // ── Set priority ──
    const handleSetPriority = async (convId: string, priority: string) => {
        try {
            // Set SLA deadline based on priority
            const slaMinutes: Record<string, number> = { urgent: 15, high: 30, normal: 60, low: 240 };
            const mins = slaMinutes[priority];
            const slaDeadline = mins ? new Date(Date.now() + mins * 60 * 1000).toISOString() : undefined;

            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/priority`, { priority, slaDeadline });
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, priority: priority as Conversation['priority'], slaDeadline } : c)
            );
            const labels: Record<string, string> = { urgent: 'Khẩn cấp', high: 'Cao', normal: 'Bình thường', low: 'Thấp' };
            message.success(`Đã đặt mức ưu tiên: ${labels[priority]}`);
        } catch {
            message.error('Lỗi khi đặt mức ưu tiên');
        }
    };

    // ── Tags ──
    const handleAddTag = async (convId: string, tag: string) => {
        try {
            await httpClient.post(`/conversations/workspace/${workspaceId}/${convId}/tags`, { tag });
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, tags: [...(c.tags || []), tag] } : c)
            );
            // Auto-register tag in workspace tags registry for future suggestions
            if (!workspaceTags.includes(tag)) {
                httpClient.post(`/workspaces/${workspaceId}/tags`, { tag })
                    .then(() => setWorkspaceTags(prev => [...prev, tag]))
                    .catch(() => { /* silent - tag registry is best-effort */ });
            }
        } catch { message.error('Lỗi khi gắn tag'); }
    };

    const handleRemoveTag = async (convId: string, tag: string) => {
        try {
            await httpClient.delete(`/conversations/workspace/${workspaceId}/${convId}/tags`, { data: { tag } });
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, tags: (c.tags || []).filter(t => t !== tag) } : c)
            );
        } catch { message.error('Lỗi khi gỡ tag'); }
    };

    // ── Internal note ──
    const handleAddNote = async (convId: string) => {
        if (!noteText.trim()) return;
        try {
            await httpClient.post(`/conversations/workspace/${workspaceId}/${convId}/notes`, { content: noteText.trim() });
            setNoteText('');
            setShowNoteInput(false);
            message.success('Ghi chú nội bộ đã thêm');
        } catch { message.error('Lỗi khi thêm ghi chú'); }
    };

    // ── Assign to me ──
    const handleAssign = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/assign`);
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, assignedTo: { _id: me?.user?.id || '', name: me?.user?.name || 'Agent' } } : c)
            );
            message.success('Đã nhận cuộc hội thoại');
        } catch (err: any) {
            const serverMsg = err?.response?.data?.message;
            if (err?.response?.status === 409) {
                message.warning(serverMsg || 'Cuộc hội thoại đã được agent khác nhận trước');
            } else {
                message.error(serverMsg || 'Lỗi khi nhận cuộc hội thoại');
            }
        }
    };

    // ── Unassign ──
    const handleUnassign = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/unassign`);
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, assignedTo: undefined } : c)
            );
            message.success('Đã trả cuộc hội thoại về hàng đợi');
        } catch {
            message.error('Lỗi khi bỏ nhận cuộc hội thoại');
        }
    };

    // ── Assign/Transfer to specific agent ──
    const handleAssignToAgent = async (convId: string, agentId: string, agentName: string) => {
        try {
            const conv = conversations.find((c) => c._id === convId);
            const currentAssignee = conv ? getAssignedId(conv) : null;
            const isTransfer = currentAssignee && currentAssignee === me?.user?.id;

            if (isTransfer) {
                // Current agent transferring → use transfer endpoint
                await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/transfer`, { toAgentId: agentId, toAgentName: agentName });
                message.success(`Đã chuyển cuộc hội thoại cho ${agentName}`);
            } else {
                // Admin/manager assigning → use assign-agent endpoint
                await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/assign-agent`, { agentId, agentName });
                message.success(`Đã gán cho ${agentName}`);
            }
            setConversations((prev) =>
                prev.map((c) => c._id === convId ? { ...c, assignedTo: { _id: agentId, name: agentName } } : c)
            );
        } catch {
            message.error('Lỗi khi gán/chuyển agent');
        }
    };

    // ── Edit / Recall Message ──
    const handleSaveEdit = async (msgId: string) => {
        if (!selectedConvIdRef.current || !editingContent.trim()) return;
        try {
            const res = await httpClient.patch(`/conversations/workspace/${workspaceId}/${selectedConvIdRef.current}/messages/${msgId}`, {
                content: editingContent
            });
            setMessages(prev => prev.map(m => m._id === msgId ? res.data?.data || m : m));
            setEditingMessageId(null);
            setEditingContent('');
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Lỗi khi sửa tin nhắn');
        }
    };

    const handleRecall = async (msgId: string) => {
        if (!selectedConvIdRef.current) return;
        try {
            await httpClient.delete(`/conversations/workspace/${workspaceId}/${selectedConvIdRef.current}/messages/${msgId}`);
            setMessages(prev => prev.map(m => m._id === msgId ? { ...m, isDeleted: true } : m));
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Lỗi khi thu hồi tin nhắn');
        }
    };

    // ── Reset all messages ──
    const handleResetAllMessages = () => {
        Modal.confirm({
            title: 'Xóa toàn bộ tin nhắn?',
            content: (
                <div>
                    <p style={{ marginBottom: 8 }}>
                        Thao tác này sẽ <strong>xóa vĩnh viễn</strong> toàn bộ:
                    </p>
                    <ul style={{ marginLeft: 16, marginBottom: 8, color: '#555' }}>
                        <li>Tất cả tin nhắn trong Inbox</li>
                        <li>Tất cả tin nhắn Zalo đã lưu</li>
                    </ul>
                    <p style={{ color: '#666', fontSize: 13 }}>
                        ✔ Thông tin khách hàng (visitor profiles) sẽ được giữ nguyên.
                    </p>
                </div>
            ),
            okText: 'Xóa tất cả',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    const res = await httpClient.delete(`/conversations/workspace/${workspaceId}/reset-messages`);
                    const d = res.data?.data || {};
                    message.success(`Đã xóa ${d.deletedMessages || 0} tin nhắn, ${d.deletedZaloMessages || 0} tin Zalo`);
                    setMessages([]);
                    setSelectedConvId(null);
                    setConversations(prev => prev.map(c => ({ ...c, lastMessage: undefined, unreadCount: 0 })));
                } catch (err: any) {
                    message.error(err.response?.data?.message || 'Xóa thất bại');
                }
            },
        });
    };

    useEffect(() => {
        if (!workspaceId) return;
        httpClient.get(`/workspaces/${workspaceId}/members`)
            .then((res: any) => {
                const members = (res.data?.data || []).map((m: any) => ({
                    _id: m.userId?._id || m.userId,
                    name: m.userId?.name || 'Agent',
                    email: m.userId?.email,
                    role: m.role,
                }));
                setWorkspaceMembers(members);
            })
            .catch(() => { /* ignore */ });
    }, [workspaceId]);

    // ── Agent typing emit ──
    const handleTyping = () => {
        if (!socketRef.current?.connected || !selectedConvId) return;
        socketRef.current.emit('typing:start', { conversationId: selectedConvId });
        // Auto-stop after 2s idle
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit('typing:stop', { conversationId: selectedConvId });
        }, 2000);
    };

    // ── Filter + search ──
    const filteredConvs = conversations.filter((c) => {
        if (filterStatus !== 'all' && c.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const name = visitorName(c).toLowerCase();
            const email = (c.visitorInfo?.email || '').toLowerCase();
            return name.includes(q) || email.includes(q) || c.visitorId.includes(q);
        }
        return true;
    });

    const selectedConv = conversations.find((c) => c._id === selectedConvId);

    const advancedFilterContent = (
        <Form layout="vertical" style={{ width: 250 }}>
            <Form.Item label="Sắp xếp hoạt động" style={{ marginBottom: 12 }}>
                <Select
                    value={filterSortBy}
                    onChange={setFilterSortBy as any}
                    options={[
                        { label: 'Mới nhất', value: 'newest' },
                        { label: 'Cũ nhất', value: 'oldest' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="Người phụ trách" style={{ marginBottom: 12 }}>
                <Select
                    value={filterAssignee}
                    onChange={setFilterAssignee}
                    options={[
                        { label: 'Tất cả', value: 'all' },
                        { label: 'Chưa phân công', value: 'unassigned' },
                        { label: 'Của tôi', value: (me as any)?._id || (me as any)?.user?._id || 'me' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="Kênh" style={{ marginBottom: 12 }}>
                <Select
                    value={filterChannel}
                    onChange={setFilterChannel}
                    options={[
                        { label: 'Tất cả', value: 'all' },
                        { label: 'Live Chat (Widget)', value: 'widget' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="Thẻ (Tags)" style={{ marginBottom: 12 }}>
                <Select
                    mode="tags"
                    placeholder="Nhập thẻ..."
                    value={filterTags}
                    onChange={setFilterTags}
                    style={{ width: '100%' }}
                />
            </Form.Item>
            <Form.Item label="Ngày tạo" style={{ marginBottom: 0 }}>
                <RangePicker
                    style={{ width: '100%' }}
                    onChange={(dates) => {
                        if (dates && dates[0] && dates[1]) {
                            setFilterDateFrom(dates[0].toISOString());
                            setFilterDateTo(dates[1].toISOString());
                        } else {
                            setFilterDateFrom(null);
                            setFilterDateTo(null);
                        }
                    }}
                />
            </Form.Item>
        </Form>
    );

    if (meLoading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spin size="large" />
        </div>;
    }

    return (
        <AppLayout hideHeader={true}>
            <Head>
                <title>Inbox | NemarChat</title>
            </Head>

            <style>{`
                @media (min-width: 769px) {
                    .inbox-sidebar { display: flex !important; flex-direction: column; }
                    .inbox-chat-panel { display: flex !important; flex-direction: column; }
                }
                @media (max-width: 768px) {
                    .inbox-sidebar.conv-selected { display: none !important; }
                    .inbox-chat-panel:not(.conv-selected) { display: none !important; }
                }
            `}</style>
            <div style={styles.container}>
                {/* ── Sidebar: Conversation List ── */}
                <div style={styles.sidebar}
                    className={`inbox-sidebar${selectedConvId ? ' conv-selected' : ''}`}
                >
                    {/* Header */}
                    <div style={styles.sidebarHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button
                                type="text"
                                icon={<ArrowLeft size={18} />}
                                onClick={() => router.push(`/workspace/${workspaceId}`)}
                                style={{ padding: '4px 8px' }}
                            />
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                                <MessageSquare size={20} style={{ marginRight: 6 }} />
                                Inbox
                                <Badge count={inboxUnreadCount} style={{ marginLeft: 8 }} />
                            </h2>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tooltip title="Zalo Cá nhân">
                                <Button
                                    size="small"
                                    onClick={() => router.push(`/workspace/${workspaceId}/remote-session`)}
                                    style={{
                                        background: '#0068ff',
                                        borderColor: '#0068ff',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: 12,
                                        borderRadius: 6,
                                        padding: '2px 10px',
                                        height: 26,
                                    }}
                                >
                                    Zalo
                                </Button>
                            </Tooltip>
                            <Badge count={zaloUnreadCount} overflowCount={99} />
                            <Tooltip title="Xóa hết tin nhắn">
                                <Button
                                    size="small"
                                    danger
                                    icon={<Trash2 size={13} />}
                                    onClick={handleResetAllMessages}
                                    style={{ height: 26, padding: '2px 8px', borderRadius: 6 }}
                                />
                            </Tooltip>
                        </div>
                    </div>

                    {/* Search + filter */}
                    <div style={styles.searchArea}>
                        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                            <Input
                                prefix={<Search size={14} color="#999" />}
                                placeholder="Tìm theo tên, email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ borderRadius: 8 }}
                                allowClear
                            />
                            <Select
                                mode="tags"
                                placeholder={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={14} color="#999" /> Lọc theo Domain</span>}
                                value={filterDomain}
                                onChange={setFilterDomain}
                                style={{ width: '100%' }}
                                allowClear
                                options={domainOptions}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {(['all', 'open', 'pending', 'closed'] as const).map((s) => (
                                    <Tag
                                        key={s}
                                        color={filterStatus === s ? '#6366f1' : undefined}
                                        onClick={() => setFilterStatus(s)}
                                        style={{ cursor: 'pointer', borderRadius: 12, padding: '2px 12px', margin: 0 }}
                                    >
                                        {s === 'all' ? 'Tất cả' : s === 'open' ? 'Đang mở' : s === 'pending' ? 'Chờ xử lý' : 'Đã đóng'}
                                    </Tag>
                                ))}
                            </div>
                            <Popover content={advancedFilterContent} title="Lọc nâng cao" trigger="click" placement="bottomRight">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Filter size={14} />}
                                    style={{
                                        color: (filterAssignee !== 'all' || filterChannel !== 'all' || filterTags.length > 0 || filterDateFrom) ? '#6366f1' : '#ccc'
                                    }}
                                />
                            </Popover>
                        </div>
                    </div>

                    {/* Conversation list */}
                    <div style={styles.convList}>
                        {loadingConvs ? (
                            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                        ) : filteredConvs.length === 0 ? (
                            <Empty description="Chưa có cuộc hội thoại" style={{ marginTop: 60 }} />
                        ) : (
                            filteredConvs.map((conv) => (
                                <div
                                    key={conv._id}
                                    style={{
                                        ...styles.convItem,
                                        ...(selectedConvId === conv._id ? styles.convItemActive : {}),
                                        borderLeft: conv.priority === 'urgent' ? '3px solid #ef4444'
                                            : conv.priority === 'high' ? '3px solid #f59e0b'
                                            : conv.priority === 'low' ? '3px solid #9ca3af'
                                            : '3px solid transparent',
                                        backgroundColor: selectedConvId === conv._id
                                            ? '#eef2ff'
                                            : conv.priority === 'urgent' ? '#fef2f2'
                                            : conv.priority === 'high' ? '#fffbeb'
                                            : conv.priority === 'low' ? '#f9fafb'
                                            : undefined,
                                    }}
                                    onClick={() => setSelectedConvId(conv._id)}
                                >
                                    <div style={styles.convAvatar}>
                                        {conv.visitorInfo?.avatar ? (
                                            <img
                                                src={conv.visitorInfo.avatar}
                                                alt=""
                                                style={{ width: 42, height: 42, borderRadius: 14, objectFit: 'cover' }}
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                                            />
                                        ) : null}
                                        <span style={{
                                            display: conv.visitorInfo?.avatar ? 'none' : 'flex',
                                            width: 42, height: 42, borderRadius: 14,
                                            alignItems: 'center', justifyContent: 'center',
                                            background: `hsl(${(visitorName(conv).charCodeAt(0) * 37) % 360}, 55%, 55%)`,
                                            color: '#fff', fontWeight: 700, fontSize: 16,
                                        }}>
                                            {visitorName(conv).charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={styles.convName}>{visitorName(conv)}</span>
                                            <span style={styles.convTime}>
                                                {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : timeAgo(conv.createdAt)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                            <span style={{ ...styles.convPreview, fontWeight: conv.unreadCount ? 600 : 400, color: conv.unreadCount ? '#111' : '#666' }}>
                                                {conv.lastMessagePreview || conv.lastMessageSnippet || conv.visitorInfo?.email || 'Cuộc hội thoại mới'}
                                            </span>
                                            {conv.unreadCount ? (
                                                <Badge count={conv.unreadCount} style={{ backgroundColor: '#ef4444' }} />
                                            ) : (
                                                <Tag
                                                    color={conv.status === 'open' ? 'green' : 'default'}
                                                    style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 8, margin: 0 }}
                                                >
                                                    {conv.status === 'open' ? 'Mở' : 'Đóng'}
                                                </Tag>
                                            )}
                                        </div>
                                         {conv.metadata?.domain && (
                                            <div style={{ fontSize: 10, color: '#6366f1', marginTop: 2, display: 'flex', alignItems: 'center' }}>
                                              {conv.metadata.domain}
                                            </div>
                                         )}
                                        {getAssignedName(conv) && (
                                            <div style={{ fontSize: 10, color: '#10b981', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <UserCheck size={10} />
                                                {getAssignedName(conv)}
                                            </div>
                                        )}
                                        {/* Tags on conversation item */}
                                        {conv.tags && conv.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                                                {conv.tags.slice(0, 3).map(t => (
                                                    <Tag key={t} style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', borderRadius: 6, margin: 0 }}>{t}</Tag>
                                                ))}
                                                {conv.tags.length > 3 && <span style={{ fontSize: 9, color: '#999' }}>+{conv.tags.length - 3}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── Chat Panel ── */}
                <div style={styles.chatPanel}
                    className={`inbox-chat-panel${selectedConvId ? ' conv-selected' : ''}`}
                >
                    {selectedConvId && selectedConv ? (
                        <>
                            {/* Chat header */}
                            <div style={styles.chatHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Button
                                        type="text"
                                        icon={<ArrowLeft size={18} />}
                                        onClick={() => setSelectedConvId(null)}
                                        className="mobile-back-btn"
                                    />
                                    <div style={{ position: 'relative' }}>
                                        <div style={styles.chatAvatar}>
                                            {selectedConv.visitorInfo?.avatar ? (
                                                <img
                                                    src={selectedConv.visitorInfo.avatar}
                                                    alt=""
                                                    style={{ width: 38, height: 38, borderRadius: 14, objectFit: 'cover' }}
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                                                />
                                            ) : null}
                                            <span style={{
                                                display: selectedConv.visitorInfo?.avatar ? 'none' : 'flex',
                                                width: 38, height: 38, borderRadius: 14,
                                                alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 700, fontSize: 15,
                                            }}>
                                                {visitorName(selectedConv).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        {/* Visitor presence dot */}
                                        <span style={{
                                            position: 'absolute', bottom: 0, right: 0,
                                            width: 10, height: 10, borderRadius: '50%',
                                            border: '2px solid #fff',
                                            background: visitorOnlineMap[selectedConv?.visitorId || ''] === 'online' ? '#22c55e'
                                                : visitorOnlineMap[selectedConv?.visitorId || ''] === 'idle' ? '#eab308'
                                                    : '#d1d5db',
                                        }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{visitorName(selectedConv)}</div>
                                        <div style={{ fontSize: 11, color: '#888' }}>
                                            {selectedConv.visitorInfo?.email || selectedConv.visitorId?.slice(0, 12)}
                                        </div>
                                        {selectedConv.metadata?.domain && (
                                            <div style={{ fontSize: 11, color: '#6366f1', display: 'flex', alignItems: 'center', marginTop: 1 }}>
                                                {selectedConv.metadata.domain}
                                            </div>
                                        )}
                                        {getAssignedName(selectedConv) && (
                                            <div style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                                                <UserCheck size={11} />
                                                {getAssignedName(selectedConv)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {!isMemberOnly && (
                                        <>
                                            {/* Assign to me / Unassign */}
                                            {getAssignedId(selectedConv) === me?.user?.id ? (
                                        <Tooltip title="Trả về hàng đợi">
                                            <Button
                                                size="small"
                                                icon={<UserX size={14} />}
                                                onClick={() => handleUnassign(selectedConv._id)}
                                            >
                                                Bỏ nhận
                                            </Button>
                                        </Tooltip>
                                    ) : !getAssignedId(selectedConv) ? (
                                        <Tooltip title="Nhận cuộc hội thoại về mình">
                                            <Button
                                                size="small"
                                                type="primary"
                                                style={{ background: '#10b981', border: 'none' }}
                                                icon={<UserCheck size={14} />}
                                                onClick={() => handleAssign(selectedConv._id)}
                                            >
                                                Nhận
                                            </Button>
                                        </Tooltip>
                                    ) : null}
                                    {/* Assign/Transfer to specific agent dropdown */}
                                    <Select
                                        size="small"
                                        placeholder={<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {getAssignedId(selectedConv) === me?.user?.id ? 'Chuyển cho...' : 'Gán cho...'}</span>}
                                        style={{ minWidth: 130 }}
                                        value={undefined}
                                        onChange={(agentId: string) => {
                                            const agent = workspaceMembers.find(m => m._id === agentId);
                                            if (agent) handleAssignToAgent(selectedConv._id, agent._id, agent.name);
                                        }}
                                        options={workspaceMembers
                                            .filter(m => m._id !== getAssignedId(selectedConv))
                                            .map(m => ({ label: m.name, value: m._id }))}
                                        allowClear={false}
                                        popupMatchSelectWidth={false}
                                    />
                                    {/* Unassign (if assigned to someone else) */}
                                    {getAssignedId(selectedConv) && getAssignedId(selectedConv) !== me?.user?.id && (
                                        <Tooltip title="Trả về hàng đợi">
                                            <Button
                                                size="small"
                                                icon={<UserX size={14} />}
                                                onClick={() => handleUnassign(selectedConv._id)}
                                            />
                                        </Tooltip>
                                    )}
                                    {selectedConv.status === 'open' && (
                                        <>
                                            <Tooltip title="Chờ xử lý">
                                                <Button
                                                    size="small"
                                                    style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                                                    icon={<Clock size={14} />}
                                                    onClick={() => handleSetPending(selectedConv._id)}
                                                >
                                                    Chờ
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Đóng cuộc hội thoại">
                                                <Button
                                                    size="small"
                                                    danger
                                                    icon={<XIcon size={14} />}
                                                    onClick={() => handleClose(selectedConv._id)}
                                                >
                                                    Đóng
                                                </Button>
                                            </Tooltip>
                                        </>
                                    )}
                                    {selectedConv.status === 'pending' && (
                                        <>
                                            <Tooltip title="Mở lại (đang xử lý)">
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    style={{ background: '#10b981', border: 'none' }}
                                                    onClick={() => handleReopen(selectedConv._id)}
                                                >
                                                    Mở lại
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Đóng cuộc hội thoại">
                                                <Button
                                                    size="small"
                                                    danger
                                                    icon={<XIcon size={14} />}
                                                    onClick={() => handleClose(selectedConv._id)}
                                                >
                                                    Đóng
                                                </Button>
                                            </Tooltip>
                                        </>
                                    )}
                                    {selectedConv.status === 'closed' && (
                                        <Tooltip title="Mở lại cuộc hội thoại">
                                            <Button
                                                size="small"
                                                type="primary"
                                                onClick={() => handleReopen(selectedConv._id)}
                                            >
                                                Mở lại
                                            </Button>
                                        </Tooltip>
                                    )}
                                    {/* Priority selector */}
                                    {selectedConv.status !== 'closed' && (
                                        <Select
                                            size="small"
                                            value={(selectedConv as any).priority || 'normal'}
                                            style={{ minWidth: 110 }}
                                            onChange={(val: string) => handleSetPriority(selectedConv._id, val)}
                                            options={[
                                                { label: '🔴 Khẩn cấp', value: 'urgent' },
                                                { label: '🟠 Cao', value: 'high' },
                                                { label: '🟢 Bình thường', value: 'normal' },
                                                { label: '⚪ Thấp', value: 'low' },
                                            ]}
                                            popupMatchSelectWidth={false}
                                        />
                                    )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Messages */}
                            <div ref={messagesContainerRef} onScroll={handleMessagesScroll} style={styles.messagesArea}>
                                {loadingMsgs ? (
                                    <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
                                ) : messages.length === 0 ? (
                                    <Empty description="Chưa có tin nhắn" style={{ marginTop: 80 }} />
                                ) : (
                                    <>
                                        {hasMoreMsgs && (
                                            <div style={{ textAlign: 'center', margin: '16px 0' }}>
                                                <Button size="small" onClick={loadOlderMessages} loading={loadingOlder} shape="round">
                                                    Tải tin nhắn cũ hơn
                                                </Button>
                                            </div>
                                        )}
                                        {messages.map((msg) => {
                                            const isAgent = msg.sender.type === 'agent';
                                            const isSystem = msg.sender.type === 'system';
                                            const isNote = msg.isInternal === true;

                                            if (isSystem) {
                                                return (
                                                    <div key={msg._id} id={`msg-${msg._id}`} style={styles.systemMsg}>
                                                        {msg.content}
                                                    </div>
                                                );
                                            }

                                            // Internal note — distinct yellow style
                                            if (isNote) {
                                                return (
                                                    <div key={msg._id} id={`msg-${msg._id}`} style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                                                        <div style={{
                                                            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                                                            padding: '8px 14px', maxWidth: '75%', fontSize: 13,
                                                        }}>
                                                            <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                📝 Ghi chú nội bộ · {msg.sender.name || 'Agent'}
                                                            </div>
                                                            <div style={{ color: '#78350f' }}>{msg.content}</div>
                                                            <div style={{ fontSize: 10, color: '#d97706', marginTop: 3 }}>
                                                                {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={msg._id}
                                                    id={`msg-${msg._id}`}
                                                    className="msg-row"
                                                    style={{
                                                        ...styles.msgRow,
                                                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            ...styles.msgBubble,
                                                            ...(isAgent ? styles.msgAgent : styles.msgVisitor),
                                                            ...(msg._id.startsWith('tmp_') ? { opacity: 0.6 } : {}),
                                                        }}
                                                    >
                                                        {/* Reply Block */}
                                                        {msg.replyTo && (
                                                            <div style={{
                                                                background: isAgent ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                                                                borderLeft: `3px solid ${isAgent ? '#fff' : '#8b5cf6'}`,
                                                                padding: '6px 10px',
                                                                borderRadius: 4,
                                                                marginBottom: 8,
                                                                fontSize: 12,
                                                                cursor: 'pointer'
                                                            }} onClick={() => {
                                                                const el = document.getElementById(`msg-${msg.replyTo?.messageId}`);
                                                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            }}>
                                                                <div style={{ fontWeight: 600, color: isAgent ? '#fff' : '#8b5cf6', marginBottom: 2 }}>{msg.replyTo.senderName}</div>
                                                                <div style={{ opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.replyTo.content}</div>
                                                            </div>
                                                        )}
                                                        {/* Attachments */}
                                                        {msg.attachments?.map((att, i) => {
                                                            const src = att.url || att.data;
                                                            return (
                                                                <div key={i} style={{ marginBottom: msg.content ? 6 : 0 }}>
                                                                    {att.mimeType?.startsWith('image/') || isImageUrl(src || '') ? (
                                                                        <img
                                                                            src={src}
                                                                            alt={att.filename || 'Image'}
                                                                            style={styles.msgImage}
                                                                            onClick={() => window.open(src, '_blank')}
                                                                        />
                                                                    ) : (
                                                                        <a href={src} download={att.filename} style={{...styles.fileLink, display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                                            📎 {att.filename}
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Text and Actions */}
                                                        {editingMessageId === msg._id ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, marginTop: 4 }}>
                                                                <Input.TextArea
                                                                    autoSize={{ minRows: 1, maxRows: 4 }}
                                                                    value={editingContent}
                                                                    onChange={e => setEditingContent(e.target.value)}
                                                                    style={{ fontSize: 13, borderRadius: 6, color: '#000' }}
                                                                />
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                                                    <Button size="small" onClick={() => {
                                                                        setEditingMessageId(null);
                                                                        setEditingContent('');
                                                                    }}>Hủy</Button>
                                                                    <Button size="small" type="primary" onClick={() => handleSaveEdit(msg._id)}>Lưu</Button>
                                                                </div>
                                                            </div>
                                                        ) : msg.isDeleted ? (
                                                            <div style={{ fontStyle: 'italic', opacity: 0.7, color: isAgent ? '#e5e7eb' : '#6b7280' }}>
                                                                🚫 Tin nhắn đã được thu hồi
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                {msg.content && renderMessageContent(msg.content, isAgent)}
                                                                {msg.editedAt && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>(Đã chỉnh sửa)</div>}
                                                            </div>
                                                        )}
                                                        {/* Time + Status */}
                                                        <div style={styles.msgTime}>
                                                            {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                            {isAgent && msg.sender.name && (
                                                                <span> · {msg.sender.name}</span>
                                                            )}
                                                            {isAgent && (
                                                                <span style={{ marginLeft: 4 }}>
                                                                    {msg.status === 'error' ? (
                                                                        <Tooltip title="Chạm để gửi lại">
                                                                            <RotateCw
                                                                                size={12}
                                                                                color="#ff4d4f"
                                                                                style={{ cursor: 'pointer' }}
                                                                                onClick={() => retryMessage(msg)}
                                                                            />
                                                                        </Tooltip>
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
                                                    {/* Message Actions (Reply) */}
                                                    <div className="msg-actions" style={{
                                                        display: 'flex', alignItems: 'center', opacity: 0, transition: 'opacity 0.2s', padding: '0 8px'
                                                    }}>
                                                        <Tooltip title="Trả lời">
                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                icon={<Reply size={14} />}
                                                                onClick={() => {
                                                                    setReplyingTo(msg);
                                                                    // Focus input
                                                                    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
                                                                }}
                                                            />
                                                        </Tooltip>
                                                        {isAgent && msg.sender.id === me?.user?.id && !msg.isDeleted && !msg._id.startsWith('tmp_') && (
                                                            <>
                                                                <Tooltip title="Sửa">
                                                                    <Button
                                                                        type="text"
                                                                        size="small"
                                                                        icon={<Edit2 size={14} />}
                                                                        onClick={() => {
                                                                            setEditingMessageId(msg._id);
                                                                            setEditingContent(msg.content);
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                                <Tooltip title="Thu hồi">
                                                                    <Button
                                                                        type="text"
                                                                        size="small"
                                                                        danger
                                                                        icon={<Trash2 size={14} />}
                                                                        onClick={() => handleRecall(msg._id)}
                                                                    />
                                                                </Tooltip>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                                {/* Typing indicator */}
                                {typingVisitor && (
                                    <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
                                        <div style={{ ...styles.msgBubble, ...styles.msgVisitor, fontStyle: 'italic', color: '#999' }}>
                                            Đang nhập...
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                                {/* Floating "New messages" button when scrolled up */}
                                {newMsgCount > 0 && (
                                    <div
                                        onClick={() => scrollToBottom('smooth')}
                                        style={{
                                            position: 'sticky',
                                            bottom: 8,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '8px 16px',
                                            borderRadius: 20,
                                            background: 'var(--color-primary, #6366f1)',
                                            color: '#fff',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                                            zIndex: 10,
                                            transition: 'all 0.2s ease',
                                            width: 'fit-content',
                                            margin: '0 auto',
                                        }}
                                    >
                                        ↓ {newMsgCount} tin nhắn mới
                                    </div>
                                )}
                            </div>

                            {/* Input area */}
                            {selectedConv.status !== 'open' ? (
                                <div style={styles.closedBanner}>
                                    Cuộc hội thoại đã đóng
                                </div>
                            ) : isMemberOnly ? (
                                <div style={{ ...styles.closedBanner, background: '#fef3c7', color: '#92400e', borderTop: '1px solid #fde68a' }}>
                                    <Users size={14} style={{ marginRight: 6, flexShrink: 0 }} />
                                    Tài khoản của bạn chỉ có quyền xem cuộc hội thoại (Member).
                                </div>
                            ) : getAssignedId(selectedConv) && getAssignedId(selectedConv) !== me?.user?.id ? (
                                <div style={{ ...styles.closedBanner, background: '#fef3c7', color: '#92400e', borderTop: '1px solid #fde68a' }}>
                                    <UserCheck size={14} style={{ marginRight: 6, flexShrink: 0 }} />
                                    Cuộc hội thoại đang được {getAssignedName(selectedConv) || 'agent khác'} phụ trách. Bạn không thể nhắn tin.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                    {/* Quote Preview */}
                                    {replyingTo && (
                                        <div style={{
                                            padding: '8px 12px', background: '#f3f4f6', borderLeft: '3px solid #8b5cf6',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            borderTop: '1px solid #e5e7eb',
                                        }}>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 2 }}>
                                                    Đang trả lời {replyingTo.sender.name || (replyingTo.sender.type === 'visitor' ? 'Khách' : 'Agent')}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {replyingTo.content || 'Hình ảnh/File đính kèm'}
                                                </div>
                                            </div>
                                            <Button type="text" size="small" icon={<XIcon size={16} />} onClick={() => setReplyingTo(null)} />
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
                                    {/* Macro selector */}
                                    <Popover
                                        open={showMacroPopover}
                                        onOpenChange={setShowMacroPopover}
                                        trigger="click"
                                        placement="topLeft"
                                        content={
                                            <div style={{ width: 300, maxHeight: 350, overflowY: 'auto' }}>
                                                <div style={{ fontWeight: 600, padding: '4px 0 8px', borderBottom: '1px solid #f0f0f0', marginBottom: 8, fontSize: 13 }}>
                                                    ⚡ Chọn Macro
                                                </div>
                                                {macros.length === 0 ? (
                                                    <Empty description="Chưa có macro" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                                ) : (
                                                    <>
                                                        {['team', 'personal'].map(scope => {
                                                            const scopeMacros = macros.filter(m => m.scope === scope);
                                                            if (scopeMacros.length === 0) return null;
                                                            return (
                                                                <div key={scope} style={{ marginBottom: 8 }}>
                                                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', padding: '4px 0' }}>
                                                                        {scope === 'team' ? '👥 Team' : '👤 Cá nhân'}
                                                                    </div>
                                                                    {scopeMacros.map(m => (
                                                                        <div
                                                                            key={m._id}
                                                                            onClick={() => {
                                                                                const visitor = selectedConv?.visitorInfo;
                                                                                const visitorName = visitor?.name || visitor?.email || 'Khách';
                                                                                const agentName = me?.user?.name || 'Agent';
                                                                                const filled = m.content
                                                                                    .replace(/\{\{customer_name\}\}/g, visitorName)
                                                                                    .replace(/\{\{agent_name\}\}/g, agentName)
                                                                                    .replace(/\{\{order_id\}\}/g, '[order_id]');
                                                                                setInputText(prev => prev + filled);
                                                                                setShowMacroPopover(false);
                                                                            }}
                                                                            style={{
                                                                                padding: '8px 10px',
                                                                                cursor: 'pointer',
                                                                                borderRadius: 6,
                                                                                transition: 'background 0.15s',
                                                                            }}
                                                                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                                        >
                                                                            <div style={{ fontWeight: 500, fontSize: 13 }}>
                                                                                {m.title}
                                                                                {m.shortcut && <Tag color="purple" style={{ marginLeft: 6, fontSize: 11 }}>{m.shortcut}</Tag>}
                                                                                {m.category && <Tag style={{ marginLeft: 4, fontSize: 11 }}>{m.category}</Tag>}
                                                                            </div>
                                                                            <div style={{ fontSize: 12, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                {m.content.slice(0, 80)}{m.content.length > 80 ? '...' : ''}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>
                                        }
                                    >
                                        <Button
                                            type="text"
                                            icon={<Zap size={18} color="#8b5cf6" />}
                                            style={{ padding: '4px 8px' }}
                                        />
                                    </Popover>
                                    <input
                                        id="chat-input"
                                        style={styles.textInput}
                                        placeholder="Nhập tin nhắn..."
                                        value={inputText}
                                        onChange={(e) => { setInputText(e.target.value); handleTyping(); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        onPaste={(e) => {
                                            const items = e.clipboardData?.items;
                                            if (!items) return;
                                            for (let i = 0; i < items.length; i++) {
                                                if (items[i].type.startsWith('image/')) {
                                                    const file = items[i].getAsFile();
                                                    if (file) {
                                                        e.preventDefault();
                                                        const dt = new DataTransfer();
                                                        dt.items.add(file);
                                                        if (fileInputRef.current) {
                                                            fileInputRef.current.files = dt.files;
                                                            fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                                                        }
                                                    }
                                                    break;
                                                }
                                            }
                                        }}
                                    />
                                    <Button
                                        type="primary"
                                        icon={<Send size={16} />}
                                        onClick={handleSend}
                                        loading={sending}
                                        style={{ borderRadius: 20, background: 'var(--gradient-primary, #6366f1)', border: 'none', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}
                                    />
                                </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="empty-state" style={{ height: '100%' }}>
                            <div className="empty-state-icon" style={{ width: 96, height: 96, borderRadius: 28 }}>
                                <MessageSquare size={40} strokeWidth={1.5} />
                            </div>
                            <div className="empty-state-title" style={{ fontSize: 20 }}>Chọn cuộc hội thoại</div>
                            <div className="empty-state-desc">Chọn một cuộc trò chuyện từ danh sách bên trái để xem và trả lời tin nhắn</div>
                        </div>
                    )}
                </div>

                {/* Visitor Profile Sidebar */}
                {selectedConvId && (
                    <div className="visitor-profile-sidebar">
                        <VisitorProfileSidebar
                            workspaceId={workspaceId}
                            visitorId={selectedConv?.visitorId || null}
                            conversationTags={selectedConv?.tags || []}
                            workspaceTags={workspaceTags}
                            workspaceMembers={workspaceMembers}
                            onAddTag={(tag) => !isMemberOnly && selectedConv && handleAddTag(selectedConv._id, tag)}
                            onRemoveTag={(tag) => !isMemberOnly && selectedConv && handleRemoveTag(selectedConv._id, tag)}
                            onAddNote={(content, mentionedUserIds) => {
                                if (isMemberOnly || !selectedConv) return;
                                addInternalNote.mutateAsync({ workspaceId: workspaceId as string, conversationId: selectedConv._id, content, mentionedUserIds })
                                    .then(() => message.success('Ghi chú nội bộ đã thêm'))
                                    .catch(() => message.error('Lỗi khi thêm ghi chú'));
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Responsive CSS */}
            <style jsx global>{`
                .inbox-sidebar { display: flex !important; }
                .inbox-chat-panel { display: flex !important; }
                .mobile-back-btn { display: none !important; }

                .msg-row:hover .msg-actions {
                    opacity: 1 !important;
                }

                @media (max-width: 768px) {
                    .inbox-sidebar {
                        width: 100% !important;
                        border-right: none !important;
                    }
                    .inbox-chat-panel {
                        width: 100% !important;
                        position: absolute !important;
                        inset: 0 !important;
                        z-index: 10 !important;
                    }
                    .mobile-back-btn {
                        display: inline-flex !important;
                    }
                    .visitor-profile-sidebar {
                        display: none !important;
                    }
                }
            `}</style>
        </AppLayout>
    );
}

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        background: 'var(--color-bg-muted, #f1f5f9)',
        overflow: 'hidden',
        fontFamily: "var(--font-sans, 'Inter', -apple-system, sans-serif)",
    },
    // Sidebar
    sidebar: {
        width: 360,
        background: 'var(--color-bg, #fff)',
        borderRight: '1px solid var(--color-border, #e2e8f0)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    },
    sidebarHeader: {
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border, #e2e8f0)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-bg, #fff)',
    },
    searchArea: {
        padding: '12px 20px',
        borderBottom: '1px solid var(--color-border-light, #f1f5f9)',
        background: 'var(--color-bg, #fff)',
    },
    convList: {
        flex: 1,
        overflowY: 'auto' as const,
        minHeight: 0,
    },
    convItem: {
        display: 'flex',
        gap: 12,
        padding: '14px 20px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--color-border-light, #f8fafc)',
        transition: 'all .15s ease',
    },
    convItemActive: {
        background: 'var(--color-primary-bg, #eef2ff)',
        borderLeft: '3px solid var(--color-primary, #6366f1)',
    },
    convAvatar: {
        width: 42,
        height: 42,
        borderRadius: 14,
        background: 'linear-gradient(135deg, var(--color-primary-50, #eef2ff) 0%, #f5f3ff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    convName: {
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--color-text, #0f172a)',
    },
    convTime: {
        fontSize: 11,
        color: 'var(--color-text-muted, #94a3b8)',
    },
    convPreview: {
        fontSize: 13,
        color: 'var(--color-text-secondary, #475569)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        maxWidth: 220,
    },
    // Chat panel
    chatPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg, #fff)',
        boxShadow: '-1px 0 4px rgba(0,0,0,0.02)',
        zIndex: 1,
        minWidth: 0,
        minHeight: 0,
    },
    chatHeader: {
        padding: '16px 24px',
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border, #e2e8f0)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chatAvatar: {
        width: 38,
        height: 38,
        borderRadius: 14,
        background: 'var(--gradient-primary, #6366f1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
    },
    messagesArea: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '20px 24px',
        minHeight: 0,
        background: 'var(--color-bg-soft, #f8fafc)',
    },
    msgRow: {
        display: 'flex',
        marginBottom: 10,
    },
    msgBubble: {
        maxWidth: '70%',
        padding: '12px 16px',
        borderRadius: 18,
        fontSize: 14,
        lineHeight: 1.55,
        wordBreak: 'break-word' as const,
    },
    msgAgent: {
        background: 'var(--gradient-primary, #6366f1)',
        color: '#fff',
        borderBottomRightRadius: 6,
        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.2)',
    },
    msgVisitor: {
        background: 'var(--color-bg, #fff)',
        border: '1px solid var(--color-border, #e2e8f0)',
        color: 'var(--color-text, #1e293b)',
        borderBottomLeftRadius: 6,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    },
    systemMsg: {
        textAlign: 'center' as const,
        color: 'var(--color-text-muted, #94a3b8)',
        fontSize: 12,
        padding: '8px 0',
    },
    msgTime: {
        fontSize: 10,
        opacity: 0.65,
        marginTop: 4,
        textAlign: 'right' as const,
    },
    msgImage: {
        maxWidth: 240,
        borderRadius: 12,
        cursor: 'pointer',
    },
    fileLink: {
        color: 'var(--color-primary, #6366f1)',
        textDecoration: 'underline',
    },
    inputArea: {
        padding: '16px 24px',
        background: 'var(--color-bg, #fff)',
        borderTop: '1px solid var(--color-border, #e2e8f0)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
    },
    textInput: {
        flex: 1,
        padding: '12px 20px',
        border: '1.5px solid var(--color-border, #cbd5e1)',
        borderRadius: 24,
        fontSize: 14,
        outline: 'none',
        transition: 'all .2s',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
        background: 'var(--color-bg-soft, #f8fafc)',
    },
    closedBanner: {
        padding: '16px 24px',
        background: 'var(--color-bg-soft, #f8fafc)',
        borderTop: '1px solid var(--color-border, #e2e8f0)',
        textAlign: 'center' as const,
        color: 'var(--color-text-muted, #94a3b8)',
        fontSize: 13,
    },
};
