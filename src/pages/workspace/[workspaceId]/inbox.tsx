import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from 'react';
import { Input, Badge, Spin, Empty, Tag, Button, message, Tooltip, Popover, Select, DatePicker, Form, Modal, Checkbox, Progress, Dropdown, ColorPicker } from 'antd';
import {
    Search, Send, Paperclip, ArrowLeft, X as XIcon,
    MessageSquare, Clock, User, Image as ImageIcon, RotateCw, Filter, Check, CheckCheck, UserCheck, UserX, Users, Zap, Reply, Edit2, Trash2, Globe, Forward, Bookmark, Plus, Settings, ChevronDown, Copy, Megaphone, MoreHorizontal
} from 'lucide-react';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { httpClient } from '../../../lib/http/client';
import io, { Socket } from 'socket.io-client';
import { Conversation, Message } from '../../../types';
import { VisitorProfileSidebar } from '../../../features/inbox/components/VisitorProfileSidebar';
import ContactProfileModal from '../../../features/inbox/components/ContactProfileModal';
import KnowledgeSuggestPanel from '../../../features/workspace/components/KnowledgeSuggestPanel';
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

// ── URL detection & rendering ──
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /photo-stal[\w-]*\.zdn\.vn\//i.test(url);
}

/** Decode common HTML entities that Zalo sometimes injects */
function decodeHTMLEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&#x27;/g, "'");
}

function renderMessageContent(content: string, isAgent: boolean, hasAttachments: boolean = false) {
    if (!content) return null;

    // First decode HTML entities
    const decoded = decodeHTMLEntities(content);

    // Find all URLs (images + regular links)
    const parts: Array<{ type: 'text' | 'image' | 'link'; value: string }> = [];
    let lastIndex = 0;

    const urlRegex = new RegExp(URL_REGEX.source, 'gi');
    urlRegex.lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(decoded)) !== null) {
        const url = match[0].replace(/[.,;:!?)]+$/, ''); // trim trailing punctuation

        if (match.index > lastIndex) {
            const text = decoded.slice(lastIndex, match.index);
            if (text) parts.push({ type: 'text', value: text });
        }
        // When message has attachments, treat image URLs as links to avoid duplicate rendering
        if (isImageUrl(url) && !hasAttachments) {
            parts.push({ type: 'image', value: url });
        } else {
            parts.push({ type: 'link', value: url });
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < decoded.length) {
        const text = decoded.slice(lastIndex);
        if (text) parts.push({ type: 'text', value: text });
    }

    // If no URLs found, render as plain text
    if (parts.every(p => p.type === 'text')) {
        return <div style={{ whiteSpace: 'pre-wrap' }}>{decoded}</div>;
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
                ) : part.type === 'link' ? (
                    <a
                        key={i}
                        href={part.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: isAgent ? '#c7d2fe' : '#4f46e5',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                            fontSize: 'inherit',
                        }}
                    >
                        {part.value.length > 60 ? part.value.slice(0, 60) + '…' : part.value}
                    </a>
                ) : (
                    <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part.value}</span>
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
            document.title = `(${totalUnreadCount}) Inbox | NemarkChat`;
        } else {
            document.title = `Inbox | NemarkChat`;
        }
    }, [totalUnreadCount]);

    // State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [convPage, setConvPage] = useState(1);
    const [convPerPage, setConvPerPage] = useState(50);
    const [hasMoreConvs, setHasMoreConvs] = useState(true);
    const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
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
    const [filterPageId, setFilterPageId] = useState<string>('all');
    const [fbPages, setFbPages] = useState<Array<{ id: string; pageId: string; pageName: string; pageAvatar: string; status: string }>>([]);

    const [typingVisitor, setTypingVisitor] = useState<string | null>(null);
    const [msgPage, setMsgPage] = useState(1);
    const [hasMoreMsgs, setHasMoreMsgs] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [workspaceMembers, setWorkspaceMembers] = useState<Array<{ _id: string; name: string; email?: string; role?: string }>>([]);

    const isMemberOnly = workspaceMembers.find(m => m._id === me?.user?.id)?.role === 'member';
    const [workspaceTags, setWorkspaceTags] = useState<string[]>([]);
    const [workspaceLabels, setWorkspaceLabels] = useState<Array<{ name: string; color: string }>>([]);
    const [filterLabel, setFilterLabel] = useState<string | null>(null);
    const [searchMatchMap, setSearchMatchMap] = useState<Record<string, { snippet: string; messageId: string }>>({});
    const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
    const [searchingMessages, setSearchingMessages] = useState(false);
    const [showLabelManager, setShowLabelManager] = useState(false);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#6366f1');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [noteText, setNoteText] = useState('');
    const [showNoteInput, setShowNoteInput] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [macros, setMacros] = useState<MacroItem[]>([]);
    const [showMacroPopover, setShowMacroPopover] = useState(false);
    const [macroSearchText, setMacroSearchText] = useState('');
    const [showMacroSuggestions, setShowMacroSuggestions] = useState(false);
    const [macroSuggestionIndex, setMacroSuggestionIndex] = useState(0);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [agentPresence, setAgentPresence] = useState<Record<string, 'online' | 'away' | 'offline'>>({});
    const [visitorOnlineMap, setVisitorOnlineMap] = useState<Record<string, 'online' | 'idle' | 'offline'>>({});
    const [profileModalConv, setProfileModalConv] = useState<Conversation | null>(null);

    // ── Context menu ──
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; convId: string; showLabels: boolean } | null>(null);

    // ── Forward/Broadcast mode ──
    const [forwardMode, setForwardMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [forwardFriends, setForwardFriends] = useState<Array<{ threadId: string; displayName: string; avatar: string }>>([]);
    const [forwardContacts, setForwardContacts] = useState<Array<{ threadId: string; displayName: string; avatar: string }>>([]);
    const [forwardTab, setForwardTab] = useState<'friends' | 'contacts'>('friends');
    const [forwardFriendsLoading, setForwardFriendsLoading] = useState(false);
    const [forwardSearch, setForwardSearch] = useState('');
    const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastProgress, setBroadcastProgress] = useState<{ current: number; total: number; successCount: number; failedCount: number; batchInfo?: string; status?: 'sending' | 'paused' | 'stopped' | 'completed' } | null>(null);
    const broadcastPausedRef = useRef(false);
    const broadcastCancelledRef = useRef(false);

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
    const convListRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<Message[]>([]);
    const chatInputRef = useRef<HTMLInputElement>(null);

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
            setConvPage(1);
            const params = new URLSearchParams();
            params.append('page', '1');
            params.append('limit', String(convPerPage));
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterAssignee !== 'all') params.append('assignee', filterAssignee);
            if (filterChannel !== 'all') params.append('channel', filterChannel);
            if (filterChannel === 'facebook' && filterPageId !== 'all') params.append('pageId', filterPageId);
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
                const items = res.data.data.items || res.data.data || [];
                const total = res.data.data.total || items.length;
                setConversations(items);
                setHasMoreConvs(items.length < total);
            }
        } catch { /* handled by interceptor */ }
        finally { setLoadingConvs(false); }
    }, [workspaceId, filterStatus, filterAssignee, filterChannel, filterPageId, filterDateFrom, filterDateTo, filterTags, filterSortBy, filterDomain, convPerPage]);

    const loadMoreConversations = useCallback(async () => {
        if (!workspaceId || !hasMoreConvs || loadingMoreConvs) return;
        const nextPage = convPage + 1;
        try {
            setLoadingMoreConvs(true);
            const params = new URLSearchParams();
            params.append('page', String(nextPage));
            params.append('limit', String(convPerPage));
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterAssignee !== 'all') params.append('assignee', filterAssignee);
            if (filterChannel !== 'all') params.append('channel', filterChannel);
            if (filterChannel === 'facebook' && filterPageId !== 'all') params.append('pageId', filterPageId);
            if (filterDateFrom) params.append('dateFrom', filterDateFrom);
            if (filterDateTo) params.append('dateTo', filterDateTo);
            if (filterDomain && filterDomain.length > 0) {
                filterDomain.forEach(d => params.append('domain', d));
            }
            filterTags.forEach(tag => params.append('tags', tag));
            if (filterSortBy !== 'newest') params.append('sortBy', filterSortBy);

            const res = await httpClient.get(`/conversations/workspace/${workspaceId}?${params.toString()}`);
            if (res.data?.success) {
                const items = res.data.data.items || res.data.data || [];
                const total = res.data.data.total || 0;
                setConversations(prev => {
                    // Deduplicate
                    const existingIds = new Set(prev.map(c => c._id));
                    const newItems = items.filter((c: Conversation) => !existingIds.has(c._id));
                    return [...prev, ...newItems];
                });
                setConvPage(nextPage);
                setHasMoreConvs(nextPage * convPerPage < total);
            }
        } catch { /* silent */ }
        finally { setLoadingMoreConvs(false); }
    }, [workspaceId, convPage, hasMoreConvs, loadingMoreConvs, convPerPage, filterStatus, filterAssignee, filterChannel, filterPageId, filterDateFrom, filterDateTo, filterTags, filterSortBy, filterDomain]);

    useEffect(() => {
        setConversations([]);
        setMessages([]);
        setMsgPage(1);
        setHasMoreMsgs(false);
        fetchConversations();
    }, [workspaceId]); // Explicitly clear state on workspace switch so React does not persist it across route changes

    // ── Re-fetch when any filter changes ──
    useEffect(() => {
        if (!workspaceId) return;
        fetchConversations();
    }, [fetchConversations]);

    // ── Auto-select Zalo conversation from friends page ──
    useEffect(() => {
        const zaloThread = router.query.zaloThread as string;
        if (!zaloThread || conversations.length === 0) return;

        // Find conversation matching this Zalo threadId
        const match = conversations.find((c: any) =>
            c.visitorId === `zalo_${zaloThread}` ||
            c.metadata?.zaloUserId === zaloThread
        );

        if (match) {
            setSelectedConvId(match._id);
            // Clean up URL
            const newQuery = { ...router.query };
            delete newQuery.zaloThread;
            delete newQuery.zaloName;
            router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
        } else {
            // No existing conversation — try fetching all statuses to find closed/pending ones
            if (filterStatus !== 'all') {
                // Switch to 'all' filter to find the conversation in any status
                setFilterStatus('all');
            } else {
                // Still not found after fetching all — clean up and show inbox normally
                const newQuery = { ...router.query };
                delete newQuery.zaloThread;
                delete newQuery.zaloName;
                router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
                // Show a message that user needs to send a message first from Zalo
                const friendName = router.query.zaloName as string;
                if (friendName) {
                    message.info(`Chưa có hội thoại với ${decodeURIComponent(friendName)}. Hãy gửi tin nhắn đầu tiên từ Zalo.`);
                }
            }
        }
    }, [conversations, router.query.zaloThread]);

    // ── Fetch workspace tags & labels ──
    useEffect(() => {
        if (!workspaceId) return;
        httpClient.get(`/workspaces/${workspaceId}/tags`)
            .then(res => setWorkspaceTags(res.data?.data || []))
            .catch(() => {});
        httpClient.get(`/workspaces/${workspaceId}/labels`)
            .then(res => setWorkspaceLabels(res.data?.data || []))
            .catch(() => {});
        // Also fetch macros
        httpClient.get(`/macros/workspace/${workspaceId}`)
            .then(res => setMacros(res.data?.data || []))
            .catch(() => {});
        // Also fetch domains
        httpClient.get(`/conversations/workspace/${workspaceId}/domains`)
            .then(res => setDomainOptions((res.data?.data || []).map((d: string) => ({ label: d, value: d }))))
            .catch(() => {});
        // Fetch connected Facebook pages for fanpage filter
        httpClient.get(`/workspaces/${workspaceId}/facebook/pages`)
            .then(res => setFbPages(res.data?.data?.pages || []))
            .catch(() => {});
    }, [workspaceId]);

    // ── Debounced message content search ──
    useEffect(() => {
        if (!workspaceId) return;
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchResultIds(null);
            setSearchMatchMap({});
            setSearchingMessages(false);
            return;
        }
        setSearchingMessages(true);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const res = await httpClient.get(`/conversations/workspace/${workspaceId}/search`, {
                    params: { q: searchQuery.trim(), status: filterStatus !== 'all' ? filterStatus : undefined }
                });
                if (res.data?.success) {
                    const data = res.data.data;
                    setSearchResultIds((data.items || []).map((c: any) => c._id));
                    setSearchMatchMap(data.matchMap || {});
                    // Also merge any NEW conversations from search that aren't in our list
                    setConversations(prev => {
                        const existingIds = new Set(prev.map(c => c._id));
                        const newOnes = (data.items || []).filter((c: any) => !existingIds.has(c._id));
                        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
                    });
                }
            } catch { /* silent */ }
            finally { setSearchingMessages(false); }
        }, 400);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery, workspaceId, filterStatus]);

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
            // Mark as read (reset unread count) — preserve scroll position
            httpClient.patch(`/conversations/workspace/${workspaceId}/${selectedConvId}/read`).then(() => {
                queryClient.invalidateQueries({ queryKey: conversationKeys.unreadCount(workspaceId) });
            }).catch(() => { });
            const scrollPos = convListRef.current?.scrollTop ?? 0;
            setConversations((prev) =>
                prev.map((c) => c._id === selectedConvId ? { ...c, unreadCount: 0 } : c)
            );
            requestAnimationFrame(() => {
                if (convListRef.current) convListRef.current.scrollTop = scrollPos;
                // Auto-focus chat input when conversation is selected
                chatInputRef.current?.focus();
            });
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

            // Preserve scroll position across conversation list re-order
            const scrollBefore = convListRef.current?.scrollTop ?? 0;
            setConversations((prev) => {
                const idx = prev.findIndex(c => c._id === data.conversationId);
                if (idx === -1) return prev;

                // Create updated conversation object
                const updated = {
                    ...prev[idx],
                    lastMessageAt: lm?.createdAt || new Date().toISOString(),
                    lastMessagePreview: preview,
                    unreadCount: (isFromVisitor && (!isTargetSelected || !isWindowFocused))
                        ? (prev[idx].unreadCount || 0) + 1
                        : ((isFromVisitor && isTargetSelected && isWindowFocused) ? 0 : prev[idx].unreadCount)
                };

                // Only move to top if NOT the currently selected conversation
                if (isTargetSelected) {
                    return prev.map(c => c._id === data.conversationId ? updated : c);
                }

                // Move to top: remove from current position, insert at front
                const next = [...prev];
                next.splice(idx, 1);
                next.unshift(updated);
                return next;
            });
            // Restore scroll position after React re-render
            requestAnimationFrame(() => {
                if (convListRef.current) convListRef.current.scrollTop = scrollBefore;
            });
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
        // Re-focus input so user can keep typing
        chatInputRef.current?.focus();
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
    const filteredConvs = useMemo(() => {
        const filtered = conversations.filter((c) => {
            if (filterStatus !== 'all' && c.status !== filterStatus) return false;
            // Label filter
            if (filterLabel && !(c.tags || []).includes(filterLabel)) return false;
            if (searchQuery && searchQuery.trim().length >= 2) {
                const q = searchQuery.toLowerCase();
                const name = visitorName(c).toLowerCase();
                const email = (c.visitorInfo?.email || '').toLowerCase();
                const phone = (c.visitorInfo?.phone || '').toLowerCase();
                const visitorIdFull = (c.visitorId || '').toLowerCase();
                const ip = (c.metadata?.ip || '').toLowerCase();
                const domain = (c.metadata?.domain || '').toLowerCase();
                const snippet = (c.lastMessageSnippet || c.lastMessagePreview || '').toLowerCase();
                const tagMatch = (c.tags || []).some(t => t.toLowerCase().includes(q));
                const metaMatch = name.includes(q) || email.includes(q) || phone.includes(q)
                    || visitorIdFull.includes(q) || ip.includes(q) || domain.includes(q)
                    || snippet.includes(q) || tagMatch;
                const serverMatch = searchResultIds?.includes(c._id);
                return metaMatch || serverMatch;
            }
            if (searchQuery && searchQuery.trim().length > 0 && searchQuery.trim().length < 2) {
                const q = searchQuery.toLowerCase();
                const name = visitorName(c).toLowerCase();
                return name.includes(q);
            }
            return true;
        });
        // Sort: pinned first, then by lastMessageAt
        filtered.sort((a, b) => {
            const aPinned = a.isPinned ? 1 : 0;
            const bPinned = b.isPinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return 0; // keep existing order within same pin status
        });
        return filtered;
    }, [conversations, filterStatus, filterLabel, searchQuery, searchResultIds]);

    const selectedConv = conversations.find((c) => c._id === selectedConvId);

    // ── Context menu handlers ──
    const handleCtxPin = async (convId: string) => {
        try {
            const res = await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/pin`);
            setConversations(prev => prev.map(c => c._id === convId ? { ...c, isPinned: res.data?.data?.isPinned } : c));
            message.success(res.data?.data?.isPinned ? 'Đã ghim hội thoại' : 'Đã bỏ ghim');
        } catch { message.error('Lỗi ghim'); }
        setCtxMenu(null);
    };

    const handleCtxLabel = async (convId: string, labelName: string) => {
        const conv = conversations.find(c => c._id === convId);
        const tags = conv?.tags || [];
        try {
            if (tags.includes(labelName)) {
                await httpClient.delete(`/conversations/workspace/${workspaceId}/${convId}/tags`, { data: { tag: labelName } });
                setConversations(prev => prev.map(c => c._id === convId ? { ...c, tags: (c.tags || []).filter(t => t !== labelName) } : c));
            } else {
                await httpClient.post(`/conversations/workspace/${workspaceId}/${convId}/tags`, { tag: labelName });
                setConversations(prev => prev.map(c => c._id === convId ? { ...c, tags: [...(c.tags || []), labelName] } : c));
            }
        } catch { message.error('Lỗi phân loại'); }
    };

    const handleCtxMarkUnread = async (convId: string) => {
        try {
            await httpClient.patch(`/conversations/workspace/${workspaceId}/${convId}/mark-unread`);
            setConversations(prev => prev.map(c => c._id === convId ? { ...c, unreadCount: 1 } : c));
            message.success('Đã đánh dấu chưa đọc');
        } catch { message.error('Lỗi'); }
        setCtxMenu(null);
    };

    const advancedFilterContent = (
        <Form layout="vertical" style={{ width: 260 }}>
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
                        { label: '🌐 Live Chat (Widget)', value: 'widget' },
                        { label: '💬 Zalo', value: 'zalo' },
                        { label: '📘 Facebook', value: 'facebook' },
                    ]}
                />
            </Form.Item>
            <Form.Item label={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Bookmark size={13} /> Nhãn phân loại</span>} style={{ marginBottom: 12 }}>
                <Select
                    value={filterLabel || undefined}
                    onChange={(v) => setFilterLabel(v || null)}
                    allowClear
                    placeholder="Tất cả nhãn"
                    style={{ width: '100%' }}
                    dropdownRender={(menu) => (
                        <>
                            {menu}
                            <div style={{ padding: '6px 8px', borderTop: '1px solid #f0f0f0' }}>
                                <Button type="link" size="small" icon={<Settings size={11} />} onClick={() => setShowLabelManager(true)} style={{ padding: 0, fontSize: 12 }}>
                                    Quản lý nhãn
                                </Button>
                            </div>
                        </>
                    )}
                >
                    {workspaceLabels.map(lb => (
                        <Select.Option key={lb.name} value={lb.name}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: lb.color, flexShrink: 0 }} />
                                {lb.name}
                            </span>
                        </Select.Option>
                    ))}
                </Select>
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
                <title>Inbox | NemarkChat</title>
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
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: '#f1f5f9', borderRadius: 10, padding: 3,
                        }}>
                            {/* Zalo channel pill */}
                            <button
                                onClick={() => router.push(`/workspace/${workspaceId}/remote-session`)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 12px', borderRadius: 8,
                                    border: 'none', cursor: 'pointer',
                                    background: '#0068ff',
                                    color: '#fff',
                                    fontSize: 12, fontWeight: 600,
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                            >
                                <svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4z" fill="currentColor" opacity=".2"/><path d="M24 8c-8.84 0-16 7.16-16 16 0 5.02 2.32 9.5 5.94 12.44V42l5.22-2.87c1.49.41 3.07.63 4.7.63h.14c8.84 0 16-7.16 16-16S32.84 8 24 8z" fill="currentColor"/></svg>
                                Zalo
                                {zaloUnreadCount > 0 && (
                                    <span style={{
                                        background: '#fff', color: '#0068ff',
                                        fontSize: 10, fontWeight: 700,
                                        padding: '1px 6px', borderRadius: 10,
                                        lineHeight: '16px', minWidth: 18, textAlign: 'center',
                                    }}>
                                        {zaloUnreadCount > 99 ? '99+' : zaloUnreadCount}
                                    </span>
                                )}
                            </button>
                            {/* Facebook channel pill */}
                            <button
                                onClick={() => setFilterChannel(filterChannel === 'facebook' ? 'all' : 'facebook')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 12px', borderRadius: 8,
                                    border: 'none', cursor: 'pointer',
                                    background: filterChannel === 'facebook' ? '#1877F2' : 'transparent',
                                    color: filterChannel === 'facebook' ? '#fff' : '#64748b',
                                    fontSize: 12, fontWeight: 600,
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => { if (filterChannel !== 'facebook') e.currentTarget.style.background = '#e2e8f0'; }}
                                onMouseLeave={e => { if (filterChannel !== 'facebook') e.currentTarget.style.background = 'transparent'; }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                FB
                            </button>
                            {/* Reset messages btn — very small, icon only */}
                            <Tooltip title="Xóa hết tin nhắn" placement="bottom">
                                <button
                                    onClick={handleResetAllMessages}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 28, height: 28, borderRadius: 8,
                                        border: 'none', cursor: 'pointer',
                                        background: 'transparent', color: '#94a3b8',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Search + filter */}
                    <div style={styles.searchArea}>
                        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                            <Input
                                prefix={<Search size={14} color="#999" />}
                                placeholder="Tìm theo tên, email, IP, SĐT..."
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
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                            {/* ── Channel source tabs ── */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {[
                                    { key: 'all', label: 'Tất cả', icon: '📋' },
                                    { key: 'widget', label: 'Website', icon: '🌐' },
                                    { key: 'zalo', label: 'Zalo', icon: '💬' },
                                    { key: 'facebook', label: 'Facebook', icon: '📘' },
                                ].map((ch) => (
                                    <Tag
                                        key={ch.key}
                                        color={filterChannel === ch.key ? '#1877F2' : undefined}
                                        onClick={() => setFilterChannel(ch.key)}
                                        style={{ cursor: 'pointer', borderRadius: 12, padding: '2px 10px', margin: 0, fontSize: 12 }}
                                    >
                                        {ch.icon} {ch.label}
                                    </Tag>
                                ))}
                            </div>
                            {/* Fanpage sub-filter (visible when channel=facebook) */}
                            {filterChannel === 'facebook' && fbPages.length > 0 && (
                                <Select
                                    size="small"
                                    value={filterPageId}
                                    onChange={(v) => setFilterPageId(v)}
                                    style={{ minWidth: 140, fontSize: 11 }}
                                    popupMatchSelectWidth={false}
                                    options={[
                                        { label: '📘 Tất cả Fanpage', value: 'all' },
                                        ...fbPages.filter(p => p.status === 'active').map(p => ({
                                            label: p.pageName,
                                            value: p.pageId,
                                        })),
                                    ]}
                                />
                            )}
                            {/* Page size selector */}
                            <Select
                                size="small"
                                value={convPerPage}
                                onChange={(v) => setConvPerPage(v)}
                                style={{ width: 90, fontSize: 11 }}
                                options={[
                                    { label: '50/trang', value: 50 },
                                    { label: '100/trang', value: 100 },
                                    { label: '500/trang', value: 500 },
                                    { label: '1000/trang', value: 1000 },
                                ]}
                            />
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {/* Label filter dropdown */}
                                <Popover
                                    trigger="click"
                                    placement="bottomRight"
                                    title={
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Phân loại</span>
                                            <Button type="link" size="small" icon={<Settings size={12} />} onClick={() => setShowLabelManager(true)}>Quản lý</Button>
                                        </div>
                                    }
                                    content={
                                        <div style={{ width: 200 }}>
                                            <div
                                                onClick={() => setFilterLabel(null)}
                                                style={{
                                                    padding: '6px 8px', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
                                                    background: !filterLabel ? '#f0f0ff' : 'transparent',
                                                    fontWeight: !filterLabel ? 600 : 400,
                                                }}
                                            >
                                                <Bookmark size={14} color="#999" /> Tất cả
                                            </div>
                                            {workspaceLabels.map(lb => (
                                                <div
                                                    key={lb.name}
                                                    onClick={() => setFilterLabel(filterLabel === lb.name ? null : lb.name)}
                                                    style={{
                                                        padding: '6px 8px', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
                                                        background: filterLabel === lb.name ? '#f0f0ff' : 'transparent',
                                                        fontWeight: filterLabel === lb.name ? 600 : 400,
                                                    }}
                                                >
                                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: lb.color, display: 'inline-block', flexShrink: 0 }} />
                                                    {lb.name}
                                                </div>
                                            ))}
                                            {workspaceLabels.length === 0 && (
                                                <div style={{ padding: '12px 8px', color: '#999', fontSize: 12, textAlign: 'center' }}>Chưa có nhãn. Bấm Quản lý để tạo.</div>
                                            )}
                                        </div>
                                    }
                                >
                                    <Tooltip title="Phân loại">
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<Bookmark size={14} />}
                                            style={{ color: filterLabel ? '#6366f1' : '#ccc' }}
                                        />
                                    </Tooltip>
                                </Popover>
                                {searchingMessages && <Spin size="small" />}
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
                    </div>

                    {/* Label Manager Modal */}
                    <Modal
                        open={showLabelManager}
                        onCancel={() => setShowLabelManager(false)}
                        title={
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bookmark size={18} style={{ color: '#6366f1' }} />
                                Quản lý nhãn phân loại
                            </span>
                        }
                        footer={null}
                        width={440}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {workspaceLabels.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '20px 0 12px', color: '#999' }}>
                                    <Bookmark size={32} style={{ color: '#d1d5db', marginBottom: 8 }} />
                                    <div style={{ fontSize: 13 }}>Chưa có nhãn nào. Tạo nhãn đầu tiên bên dưới.</div>
                                </div>
                            )}
                            {workspaceLabels.map(lb => (
                                <div key={lb.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #f0f0f0', background: '#fafafa', transition: 'all .15s' }}>
                                    <ColorPicker
                                        size="small"
                                        value={lb.color}
                                        onChange={async (c) => {
                                            try {
                                                const res = await httpClient.put(`/workspaces/${workspaceId}/labels`, { oldName: lb.name, name: lb.name, color: c.toHexString() });
                                                setWorkspaceLabels(res.data?.data || []);
                                            } catch { message.error('Lỗi khi đổi màu'); }
                                        }}
                                        presets={[{
                                            label: 'Mặc định',
                                            colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'],
                                        }]}
                                    />
                                    <span style={{
                                        flex: 1, fontWeight: 500, fontSize: 13,
                                        padding: '2px 8px', borderRadius: 14,
                                        background: lb.color + '15', color: lb.color,
                                        border: `1px solid ${lb.color}30`,
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: lb.color }} />
                                        {lb.name}
                                    </span>
                                    <Tooltip title="Đổi tên">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<Edit2 size={12} />}
                                            onClick={() => {
                                                const newName = prompt('Nhập tên mới cho nhãn:', lb.name);
                                                if (newName && newName.trim() && newName.trim() !== lb.name) {
                                                    httpClient.put(`/workspaces/${workspaceId}/labels`, { oldName: lb.name, name: newName.trim(), color: lb.color })
                                                        .then(res => {
                                                            setWorkspaceLabels(res.data?.data || []);
                                                            if (filterLabel === lb.name) setFilterLabel(newName.trim());
                                                            message.success('Đã đổi tên nhãn');
                                                        })
                                                        .catch(() => message.error('Lỗi đổi tên'));
                                                }
                                            }}
                                            style={{ color: '#999' }}
                                        />
                                    </Tooltip>
                                    <Tooltip title="Xóa nhãn">
                                        <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<Trash2 size={12} />}
                                            onClick={async () => {
                                                try {
                                                    const res = await httpClient.delete(`/workspaces/${workspaceId}/labels`, { data: { name: lb.name } });
                                                    setWorkspaceLabels(res.data?.data || []);
                                                    if (filterLabel === lb.name) setFilterLabel(null);
                                                    message.success('Đã xóa nhãn');
                                                } catch { message.error('Lỗi'); }
                                            }}
                                        />
                                    </Tooltip>
                                </div>
                            ))}
                            {/* Create new label */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, padding: '8px 10px', borderRadius: 8, border: '1px dashed #d1d5db', background: '#f9fafb' }}>
                                <ColorPicker
                                    size="small"
                                    value={newLabelColor}
                                    onChange={(c) => setNewLabelColor(c.toHexString())}
                                    presets={[{
                                        label: 'Mặc định',
                                        colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'],
                                    }]}
                                />
                                <Input
                                    size="small"
                                    placeholder="Tên nhãn mới..."
                                    value={newLabelName}
                                    onChange={e => setNewLabelName(e.target.value)}
                                    style={{ flex: 1, borderRadius: 6 }}
                                    onPressEnter={async () => {
                                        if (!newLabelName.trim()) return;
                                        try {
                                            const res = await httpClient.post(`/workspaces/${workspaceId}/labels`, { name: newLabelName.trim(), color: newLabelColor });
                                            setWorkspaceLabels(res.data?.data || []);
                                            setNewLabelName('');
                                            message.success('Đã thêm nhãn');
                                        } catch { message.error('Lỗi khi thêm nhãn'); }
                                    }}
                                />
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Plus size={12} />}
                                    style={{ background: newLabelColor, borderColor: newLabelColor, borderRadius: 6 }}
                                    onClick={async () => {
                                        if (!newLabelName.trim()) return;
                                        try {
                                            const res = await httpClient.post(`/workspaces/${workspaceId}/labels`, { name: newLabelName.trim(), color: newLabelColor });
                                            setWorkspaceLabels(res.data?.data || []);
                                            setNewLabelName('');
                                            message.success('Đã thêm nhãn');
                                        } catch { message.error('Lỗi khi thêm nhãn'); }
                                    }}
                                >
                                    Thêm
                                </Button>
                            </div>
                        </div>
                    </Modal>

                    {/* Conversation list */}
                    <div ref={convListRef} style={styles.convList} onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
                            loadMoreConversations();
                        }
                    }}>
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
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setCtxMenu({ x: e.clientX, y: e.clientY, convId: conv._id, showLabels: false });
                                    }}
                                >
                                    <div style={{ ...styles.convAvatar, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setProfileModalConv(conv); }}>
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
                                            <span style={styles.convName}>
                                                {conv.isPinned && <span title="Đã ghim" style={{ marginRight: 4, fontSize: 11 }}>📌</span>}
                                                {(conv as any).channel === 'facebook' && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 2,
                                                        fontSize: 9, fontWeight: 700, color: '#fff',
                                                        background: '#1877F2', borderRadius: 4,
                                                        padding: '1px 5px', marginRight: 5, lineHeight: '14px',
                                                        verticalAlign: 'middle',
                                                    }}>FB</span>
                                                )}
                                                {(conv as any).channel === 'zalo' && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 2,
                                                        fontSize: 9, fontWeight: 700, color: '#fff',
                                                        background: '#0068ff', borderRadius: 4,
                                                        padding: '1px 5px', marginRight: 5, lineHeight: '14px',
                                                        verticalAlign: 'middle',
                                                    }}>Zalo</span>
                                                )}
                                                {(!(conv as any).channel || (conv as any).channel === 'widget') && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 2,
                                                        fontSize: 9, fontWeight: 700, color: '#fff',
                                                        background: '#10b981', borderRadius: 4,
                                                        padding: '1px 5px', marginRight: 5, lineHeight: '14px',
                                                        verticalAlign: 'middle',
                                                    }}>Web</span>
                                                )}
                                                {visitorName(conv)}
                                            </span>
                                            <span style={styles.convTime}>
                                                {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : timeAgo(conv.createdAt)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                            <span style={{ ...styles.convPreview, fontWeight: conv.unreadCount ? 600 : 400, color: conv.unreadCount ? '#111' : '#666' }}>
                                                {searchMatchMap[conv._id]
                                                    ? <><Search size={10} style={{ marginRight: 3, verticalAlign: 'middle', color: '#6366f1' }} />{searchMatchMap[conv._id].snippet}</>
                                                    : (conv.lastMessagePreview || conv.lastMessageSnippet || conv.visitorInfo?.email || 'Cuộc hội thoại mới')}
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
                                        {/* Tags/Labels on conversation item */}
                                        {conv.tags && conv.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {conv.tags.slice(0, 4).map(t => {
                                                    const label = workspaceLabels.find(l => l.name === t);
                                                    return label ? (
                                                        <span key={t} style={{
                                                            fontSize: 9, lineHeight: '16px', padding: '0 6px', borderRadius: 8, margin: 0,
                                                            background: label.color + '18', color: label.color, border: `1px solid ${label.color}40`,
                                                            fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: label.color }} />
                                                            {t}
                                                        </span>
                                                    ) : (
                                                        <Tag key={t} style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', borderRadius: 6, margin: 0 }}>{t}</Tag>
                                                    );
                                                })}
                                                {conv.tags.length > 4 && <span style={{ fontSize: 9, color: '#999' }}>+{conv.tags.length - 4}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        {/* Load more indicator */}
                        {loadingMoreConvs && (
                            <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /><span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>Đang tải thêm...</span></div>
                        )}
                        {!loadingConvs && !loadingMoreConvs && hasMoreConvs && filteredConvs.length > 0 && (
                            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: '#aaa', cursor: 'pointer' }} onClick={loadMoreConversations}>↓ Kéo xuống để tải thêm</div>
                        )}
                    </div>

                    {/* Right-click context menu */}
                    {ctxMenu && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                                onClick={() => setCtxMenu(null)}
                                onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
                            />
                            <div
                                style={{
                                    position: 'fixed',
                                    top: ctxMenu.y,
                                    left: ctxMenu.x,
                                    zIndex: 9999,
                                    background: '#fff',
                                    borderRadius: 10,
                                    boxShadow: '0 6px 24px rgba(0,0,0,.18)',
                                    padding: '6px 0',
                                    minWidth: 200,
                                    border: '1px solid #e5e7eb',
                                    animation: 'fadeIn .12s ease-out',
                                }}
                            >
                                {/* Pin */}
                                <div
                                    style={ctxMenuItemStyle}
                                    onClick={() => handleCtxPin(ctxMenu.convId)}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <Bookmark size={15} style={{ color: '#6366f1' }} />
                                    <span>{conversations.find(c => c._id === ctxMenu.convId)?.isPinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}</span>
                                </div>

                                {/* Labels submenu */}
                                <div
                                    style={{ ...ctxMenuItemStyle, justifyContent: 'space-between' }}
                                    onClick={() => setCtxMenu(m => m ? { ...m, showLabels: !m.showLabels } : null)}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Tag color="purple" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>●</Tag>
                                        <span>Phân loại</span>
                                    </span>
                                    <ChevronDown size={14} style={{ transform: ctxMenu.showLabels ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: '#999' }} />
                                </div>
                                {ctxMenu.showLabels && (
                                    <div style={{ padding: '4px 8px', maxHeight: 260, overflowY: 'auto' }}>
                                        {workspaceLabels.map(label => {
                                            const ctxConvTags = conversations.find(c => c._id === ctxMenu.convId)?.tags || [];
                                            const isChecked = ctxConvTags.includes(label.name);
                                            return (
                                                <div
                                                    key={label.name}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                                        borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#333',
                                                        background: isChecked ? label.color + '10' : 'transparent',
                                                    }}
                                                    onClick={() => handleCtxLabel(ctxMenu.convId, label.name)}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = label.color + '18')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = isChecked ? label.color + '10' : 'transparent')}
                                                >
                                                    <Checkbox checked={isChecked} style={{ pointerEvents: 'none' }} />
                                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: label.color, flexShrink: 0 }} />
                                                    <span>{label.name}</span>
                                                </div>
                                            );
                                        })}
                                        {/* Inline label creation in context menu */}
                                        <div style={{ borderTop: workspaceLabels.length > 0 ? '1px solid #f0f0f0' : 'none', marginTop: workspaceLabels.length > 0 ? 6 : 0, paddingTop: 6 }}>
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <ColorPicker
                                                    size="small"
                                                    value={newLabelColor}
                                                    onChange={(c) => setNewLabelColor(c.toHexString())}
                                                    presets={[{
                                                        label: 'Mặc định',
                                                        colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'],
                                                    }]}
                                                />
                                                <Input
                                                    size="small"
                                                    placeholder="Tạo nhãn mới..."
                                                    value={newLabelName}
                                                    onChange={e => setNewLabelName(e.target.value)}
                                                    style={{ flex: 1, fontSize: 12, borderRadius: 6 }}
                                                    onPressEnter={async (e) => {
                                                        e.stopPropagation();
                                                        if (!newLabelName.trim()) return;
                                                        try {
                                                            const res = await httpClient.post(`/workspaces/${workspaceId}/labels`, { name: newLabelName.trim(), color: newLabelColor });
                                                            setWorkspaceLabels(res.data?.data || []);
                                                            setNewLabelName('');
                                                            message.success('Đã thêm nhãn');
                                                        } catch { message.error('Lỗi khi thêm nhãn'); }
                                                    }}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    icon={<Plus size={10} />}
                                                    style={{ background: newLabelColor, borderColor: newLabelColor, minWidth: 28, padding: '0 4px', height: 24, borderRadius: 6 }}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!newLabelName.trim()) return;
                                                        try {
                                                            const res = await httpClient.post(`/workspaces/${workspaceId}/labels`, { name: newLabelName.trim(), color: newLabelColor });
                                                            setWorkspaceLabels(res.data?.data || []);
                                                            setNewLabelName('');
                                                            message.success('Đã thêm nhãn');
                                                        } catch { message.error('Lỗi khi thêm nhãn'); }
                                                    }}
                                                />
                                            </div>
                                            <Button
                                                type="link"
                                                size="small"
                                                icon={<Settings size={11} />}
                                                onClick={(e) => { e.stopPropagation(); setShowLabelManager(true); setCtxMenu(null); }}
                                                style={{ padding: '4px 0 0 0', fontSize: 11, color: '#999' }}
                                            >
                                                Quản lý nhãn
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />

                                {/* Mark unread */}
                                <div
                                    style={ctxMenuItemStyle}
                                    onClick={() => handleCtxMarkUnread(ctxMenu.convId)}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <MessageSquare size={15} style={{ color: '#f59e0b' }} />
                                    <span>Đánh dấu chưa đọc</span>
                                </div>
                            </div>
                        </>
                    )}

                </div>

                {/* ── Chat Panel ── */}
                <div style={styles.chatPanel}
                    className={`inbox-chat-panel${selectedConvId ? ' conv-selected' : ''}`}
                >
                    {selectedConvId && selectedConv ? (
                        <>
                            {/* Chat header — clean minimal */}
                            <div style={styles.chatHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                                    <Button
                                        type="text"
                                        icon={<ArrowLeft size={18} />}
                                        onClick={() => setSelectedConvId(null)}
                                        className="mobile-back-btn"
                                        style={{ padding: 4, height: 32, width: 32, borderRadius: 10 }}
                                    />
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div
                                            style={{
                                                width: 36, height: 36, borderRadius: 12,
                                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', overflow: 'hidden',
                                            }}
                                            onClick={() => setProfileModalConv(selectedConv)}
                                        >
                                            {selectedConv.visitorInfo?.avatar ? (
                                                <img
                                                    src={selectedConv.visitorInfo.avatar}
                                                    alt=""
                                                    style={{ width: 36, height: 36, borderRadius: 12, objectFit: 'cover' }}
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                                                />
                                            ) : null}
                                            <span style={{
                                                display: selectedConv.visitorInfo?.avatar ? 'none' : 'flex',
                                                width: 36, height: 36, borderRadius: 12,
                                                alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 600, fontSize: 14, letterSpacing: 0.3,
                                            }}>
                                                {visitorName(selectedConv).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span style={{
                                            position: 'absolute', bottom: -1, right: -1,
                                            width: 10, height: 10, borderRadius: '50%',
                                            border: '2px solid #fff',
                                            background: visitorOnlineMap[selectedConv?.visitorId || ''] === 'online' ? '#22c55e'
                                                : visitorOnlineMap[selectedConv?.visitorId || ''] === 'idle' ? '#eab308'
                                                    : '#d1d5db',
                                        }} />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {visitorName(selectedConv)}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedConv.channel === 'zalo' ? 'Zalo' : selectedConv.channel === 'facebook' ? 'Facebook' : selectedConv.metadata?.domain || selectedConv.visitorInfo?.email || ''}
                                            {getAssignedName(selectedConv) && <> · <span style={{ color: '#6366f1' }}>{getAssignedName(selectedConv)}</span></>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    {/* Forward mode controls */}
                                    {forwardMode && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                                            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>{selectedMsgIds.size} đã chọn</span>
                                            {selectedMsgIds.size > 0 && (
                                                <>
                                                    <button
                                                        onClick={async () => {
                                                            setForwardFriendsLoading(true);
                                                            setShowForwardModal(true);
                                                            setSelectedRecipients(new Set());
                                                            setForwardSearch('');
                                                            setForwardTab('friends');
                                                            try {
                                                                const [friendsRes, contactsRes] = await Promise.all([
                                                                    httpClient.get(`/workspaces/${workspaceId}/zalo/friends`, { params: { limit: 500 } }),
                                                                    httpClient.get(`/workspaces/${workspaceId}/zalo/contacts`, { params: { limit: 5000 } }),
                                                                ]);
                                                                setForwardFriends(friendsRes.data?.data?.items || []);
                                                                const contactItems = (contactsRes.data?.data?.items || contactsRes.data?.data || []).map((c: any) => ({
                                                                    threadId: c.zaloUserId || c.threadId || c._id,
                                                                    displayName: c.displayName || c.name || 'Unknown',
                                                                    avatar: c.avatar || '',
                                                                }));
                                                                setForwardContacts(contactItems);
                                                            } catch { setForwardFriends([]); setForwardContacts([]); }
                                                            finally { setForwardFriendsLoading(false); }
                                                        }}
                                                        style={{
                                                            height: 30, padding: '0 12px', borderRadius: 8,
                                                            background: '#6366f1', color: '#fff', border: 'none',
                                                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                        }}
                                                    >
                                                        <Send size={12} /> Gửi
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            const selectedTexts = messages
                                                                .filter(m => selectedMsgIds.has(m._id))
                                                                .map(m => {
                                                                    const time = new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                                                    const name = m.sender?.name || (m.sender?.type === 'agent' ? 'Agent' : 'Khách');
                                                                    return `[${time}] ${name}: ${m.content || '[Đính kèm]'}`;
                                                                })
                                                                .join('\n');
                                                            try {
                                                                await navigator.clipboard.writeText(selectedTexts);
                                                                message.success(`Đã sao chép ${selectedMsgIds.size} tin nhắn`);
                                                            } catch {
                                                                message.error('Không thể sao chép');
                                                            }
                                                        }}
                                                        style={{
                                                            height: 30, padding: '0 10px', borderRadius: 8,
                                                            background: '#fff', color: '#6366f1', border: '1px solid #c7d2fe',
                                                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                        }}
                                                    >
                                                        Sao chép
                                                    </button>
                                                    {messages.some(m => selectedMsgIds.has(m._id) && m.sender?.type === 'agent' && m.sender?.id === me?.user?.id && !m.isDeleted) && (
                                                        <button
                                                            onClick={() => {
                                                                const recallableIds = messages
                                                                    .filter(m => selectedMsgIds.has(m._id) && m.sender?.type === 'agent' && m.sender?.id === me?.user?.id && !m.isDeleted)
                                                                    .map(m => m._id);
                                                                if (recallableIds.length === 0) { message.warning('Không có tin nhắn nào có thể thu hồi'); return; }
                                                                Modal.confirm({
                                                                    title: `Thu hồi ${recallableIds.length} tin nhắn?`,
                                                                    content: `Bạn sẽ thu hồi ${recallableIds.length} tin nhắn đã gửi. Hành động này không thể hoàn tác.`,
                                                                    okText: 'Thu hồi',
                                                                    okType: 'danger',
                                                                    cancelText: 'Hủy',
                                                                    onOk: async () => {
                                                                        let success = 0;
                                                                        for (const id of recallableIds) {
                                                                            try { await handleRecall(id); success++; } catch { /* skip */ }
                                                                        }
                                                                        message.success(`Đã thu hồi ${success}/${recallableIds.length} tin nhắn`);
                                                                        setForwardMode(false);
                                                                        setSelectedMsgIds(new Set());
                                                                    },
                                                                });
                                                            }}
                                                            style={{
                                                                height: 30, padding: '0 10px', borderRadius: 8,
                                                                background: '#fff', color: '#ef4444', border: '1px solid #fca5a5',
                                                                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                                            }}
                                                        >
                                                            Thu hồi
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button
                                                onClick={() => { setForwardMode(false); setSelectedMsgIds(new Set()); }}
                                                style={{
                                                    height: 30, width: 30, borderRadius: 8,
                                                    background: '#f3f4f6', border: 'none', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                <XIcon size={14} color="#6b7280" />
                                            </button>
                                        </div>
                                    )}
                                    {/* Status pill */}
                                    {!forwardMode && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                                            background: selectedConv.status === 'open' ? '#ecfdf5' : selectedConv.status === 'pending' ? '#fffbeb' : '#f3f4f6',
                                            color: selectedConv.status === 'open' ? '#059669' : selectedConv.status === 'pending' ? '#d97706' : '#6b7280',
                                        }}>
                                            {selectedConv.status === 'open' ? 'Đang mở' : selectedConv.status === 'pending' ? 'Chờ xử lý' : 'Đã đóng'}
                                        </span>
                                    )}
                                    {/* Overflow menu */}
                                    {!forwardMode && !isMemberOnly && (
                                        <Dropdown
                                            trigger={['click']}
                                            placement="bottomRight"
                                            menu={{
                                                items: [
                                                    ...(getAssignedId(selectedConv) === me?.user?.id ? [{
                                                        key: 'unassign',
                                                        label: 'Bỏ nhận cuộc hội thoại',
                                                        onClick: () => handleUnassign(selectedConv._id),
                                                    }] : !getAssignedId(selectedConv) ? [{
                                                        key: 'assign',
                                                        label: 'Nhận cuộc hội thoại',
                                                        onClick: () => handleAssign(selectedConv._id),
                                                    }] : [{
                                                        key: 'unassign-other',
                                                        label: 'Trả về hàng đợi',
                                                        onClick: () => handleUnassign(selectedConv._id),
                                                    }]),
                                                    {
                                                        key: 'transfer',
                                                        label: 'Chuyển cho agent khác',
                                                        children: workspaceMembers
                                                            .filter(m => m._id !== getAssignedId(selectedConv))
                                                            .map(m => ({
                                                                key: `transfer-${m._id}`,
                                                                label: m.name,
                                                                onClick: () => handleAssignToAgent(selectedConv._id, m._id, m.name),
                                                            })),
                                                    },
                                                    { type: 'divider' as const },
                                                    {
                                                        key: 'forward',
                                                        label: 'Chuyển tiếp tin nhắn',
                                                        onClick: () => { setForwardMode(true); setSelectedMsgIds(new Set()); },
                                                    },
                                                    { type: 'divider' as const },
                                                    ...(selectedConv.status === 'open' ? [
                                                        { key: 'pending', label: 'Đánh dấu chờ xử lý', onClick: () => handleSetPending(selectedConv._id) },
                                                        { key: 'close', label: 'Đóng cuộc hội thoại', danger: true, onClick: () => handleClose(selectedConv._id) },
                                                    ] : selectedConv.status === 'pending' ? [
                                                        { key: 'reopen', label: 'Mở lại cuộc hội thoại', onClick: () => handleReopen(selectedConv._id) },
                                                        { key: 'close', label: 'Đóng cuộc hội thoại', danger: true, onClick: () => handleClose(selectedConv._id) },
                                                    ] : [
                                                        { key: 'reopen', label: 'Mở lại cuộc hội thoại', onClick: () => handleReopen(selectedConv._id) },
                                                    ]),
                                                    { type: 'divider' as const },
                                                    ...(selectedConv.status !== 'closed' ? [{
                                                        key: 'priority',
                                                        label: 'Độ ưu tiên',
                                                        children: [
                                                            { key: 'p-urgent', label: '🔴 Khẩn cấp', onClick: () => handleSetPriority(selectedConv._id, 'urgent') },
                                                            { key: 'p-high', label: '🟠 Cao', onClick: () => handleSetPriority(selectedConv._id, 'high') },
                                                            { key: 'p-normal', label: '🟢 Bình thường', onClick: () => handleSetPriority(selectedConv._id, 'normal') },
                                                            { key: 'p-low', label: '⚪ Thấp', onClick: () => handleSetPriority(selectedConv._id, 'low') },
                                                        ],
                                                    }] : []),
                                                ],
                                            }}
                                        >
                                            <button
                                                style={{
                                                    width: 34, height: 34, borderRadius: 10,
                                                    border: '1px solid #e5e7eb', background: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                                            >
                                                <MoreHorizontal size={16} color="#6b7280" />
                                            </button>
                                        </Dropdown>
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
                                        {messages.map((msg, msgIdx) => {
                                            const isAgent = msg.sender.type === 'agent';
                                            const isSystem = msg.sender.type === 'system';
                                            const isNote = msg.isInternal === true;

                                            // Date separator header
                                            let showDateHeader = false;
                                            let dateLabel = '';
                                            const msgDate = new Date(msg.createdAt);
                                            const msgDay = msgDate.toDateString();
                                            if (msgIdx === 0) {
                                                showDateHeader = true;
                                            } else {
                                                const prevDate = new Date(messages[msgIdx - 1].createdAt);
                                                if (prevDate.toDateString() !== msgDay) showDateHeader = true;
                                            }
                                            if (showDateHeader) {
                                                const now = new Date();
                                                const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
                                                if (msgDay === now.toDateString()) dateLabel = 'Hôm nay';
                                                else if (msgDay === yesterday.toDateString()) dateLabel = 'Hôm qua';
                                                else dateLabel = msgDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
                                            }

                                            if (isSystem) {
                                                return (
                                                    <Fragment key={msg._id}>
                                                        {showDateHeader && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 16px 8px', userSelect: 'none' }}>
                                                                <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', background: '#f8fafc', padding: '2px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}>{dateLabel}</span>
                                                                <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                            </div>
                                                        )}
                                                        <div id={`msg-${msg._id}`} style={styles.systemMsg}>
                                                            {msg.content}
                                                        </div>
                                                    </Fragment>
                                                );
                                            }

                                            // Internal note — distinct yellow style
                                            if (isNote) {
                                                const dateHeaderNode = showDateHeader ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 16px 8px', userSelect: 'none' }}>
                                                        <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', background: '#f8fafc', padding: '2px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}>{dateLabel}</span>
                                                        <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                    </div>
                                                ) : null;
                                                return (
                                                    <Fragment key={msg._id}>
                                                        {dateHeaderNode}
                                                        <div id={`msg-${msg._id}`} style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
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
                                                    </Fragment>
                                                );
                                            }
                                            const dateHeaderElement = showDateHeader ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 16px 8px', userSelect: 'none' }}>
                                                    <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', background: '#f8fafc', padding: '2px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}>{dateLabel}</span>
                                                    <div style={{ flex: 1, borderTop: '1px solid #e5e7eb' }} />
                                                </div>
                                            ) : null;

                                            return (
                                                <Fragment key={msg._id}>
                                                {dateHeaderElement}
                                                <Dropdown
                                                    trigger={['contextMenu']}
                                                    menu={{
                                                        items: [
                                                            {
                                                                key: 'quick-forward',
                                                                icon: <Forward size={14} />,
                                                                label: 'Chuyển tiếp nhanh',
                                                                onClick: async () => {
                                                                    setSelectedMsgIds(new Set([msg._id]));
                                                                    setForwardFriendsLoading(true);
                                                                    setShowForwardModal(true);
                                                                    setSelectedRecipients(new Set());
                                                                    setForwardSearch('');
                                                                    setForwardTab('friends');
                                                                    try {
                                                                        const [friendsRes, contactsRes] = await Promise.all([
                                                                            httpClient.get(`/workspaces/${workspaceId}/zalo/friends`, { params: { limit: 500 } }),
                                                                            httpClient.get(`/workspaces/${workspaceId}/zalo/contacts`, { params: { limit: 5000 } }),
                                                                        ]);
                                                                        setForwardFriends(friendsRes.data?.data?.items || []);
                                                                        const contactItems = (contactsRes.data?.data?.items || contactsRes.data?.data || []).map((c: any) => ({
                                                                            threadId: c.zaloUserId || c.threadId || c._id,
                                                                            displayName: c.displayName || c.name || 'Unknown',
                                                                            avatar: c.avatar || '',
                                                                        }));
                                                                        setForwardContacts(contactItems);
                                                                    } catch { setForwardFriends([]); setForwardContacts([]); }
                                                                    finally { setForwardFriendsLoading(false); }
                                                                },
                                                            },
                                                            {
                                                                key: 'copy',
                                                                icon: <Copy size={14} />,
                                                                label: 'Copy nội dung',
                                                                onClick: () => {
                                                                    if (msg.content) {
                                                                        navigator.clipboard.writeText(msg.content);
                                                                        message.success('Đã copy nội dung');
                                                                    }
                                                                },
                                                            },
                                                            {
                                                                key: 'reply',
                                                                icon: <Reply size={14} />,
                                                                label: 'Trả lời',
                                                                onClick: () => {
                                                                    setReplyingTo(msg);
                                                                    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
                                                                },
                                                            },
                                                            ...(isAgent && msg.sender.id === me?.user?.id && !msg.isDeleted && !msg._id.startsWith('tmp_') ? [
                                                                { type: 'divider' as const },
                                                                {
                                                                    key: 'edit',
                                                                    icon: <Edit2 size={14} />,
                                                                    label: 'Sửa tin nhắn',
                                                                    onClick: () => {
                                                                        setEditingMessageId(msg._id);
                                                                        setEditingContent(msg.content);
                                                                    },
                                                                },
                                                                {
                                                                    key: 'recall',
                                                                    icon: <Trash2 size={14} />,
                                                                    label: 'Thu hồi',
                                                                    danger: true,
                                                                    onClick: () => handleRecall(msg._id),
                                                                },
                                                            ] : []),
                                                        ],
                                                    }}
                                                >
                                                <div
                                                    id={`msg-${msg._id}`}
                                                    className="msg-row"
                                                    style={{
                                                        ...styles.msgRow,
                                                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                                        position: 'relative',
                                                    }}
                                                >
                                                    {forwardMode && (
                                                        <div style={{
                                                            position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                                                            zIndex: 2,
                                                        }}>
                                                            <Checkbox
                                                                checked={selectedMsgIds.has(msg._id)}
                                                                onChange={(e) => {
                                                                    setSelectedMsgIds(prev => {
                                                                        const next = new Set(prev);
                                                                        if (e.target.checked) next.add(msg._id);
                                                                        else next.delete(msg._id);
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '70%', alignItems: isAgent ? 'flex-end' : 'flex-start' }}>
                                                    {/* Group chat: show sender name above bubble when sender changes */}
                                                    {!isAgent && msg.sender.name && (() => {
                                                        // Detect group: visitorId pattern for Zalo groups or multiple visitor senders
                                                        const isZaloGroup = selectedConv?.metadata?.threadType === 'group';
                                                        const visitorNames = new Set(messages.filter(m => m.sender.type === 'visitor' && m.sender.name).map(m => m.sender.name));
                                                        const isGroupChat = isZaloGroup || visitorNames.size > 1;
                                                        if (!isGroupChat) return null;
                                                        // Show name when sender differs from previous visitor message
                                                        const prevVisitorMsg = messages.slice(0, msgIdx).reverse().find(m => m.sender.type === 'visitor');
                                                        const isDiffSender = !prevVisitorMsg || prevVisitorMsg.sender.name !== msg.sender.name;
                                                        if (!isDiffSender) return null;
                                                        const nameHash = (msg.sender.name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
                                                        const hue = nameHash % 360;
                                                        return (
                                                            <div style={{
                                                                fontSize: 12, fontWeight: 600,
                                                                color: `hsl(${hue}, 65%, 45%)`,
                                                                marginBottom: 2, marginLeft: 4,
                                                                maxWidth: 200, overflow: 'hidden',
                                                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}>
                                                                {msg.sender.name}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div
                                                        style={{
                                                            ...styles.msgBubble,
                                                            ...(isAgent ? styles.msgAgent : styles.msgVisitor),
                                                            ...(msg._id.startsWith('tmp_') ? { opacity: 0.6 } : {}),
                                                            // Image/file-only messages: transparent bubble
                                                            ...(!msg.content && msg.attachments?.length ? {
                                                                background: 'transparent',
                                                                boxShadow: 'none',
                                                                border: 'none',
                                                                padding: '4px 0',
                                                            } : {}),
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
                                                                            onError={(e) => {
                                                                                const target = e.target as HTMLImageElement;
                                                                                target.style.display = 'none';
                                                                                const link = document.createElement('a');
                                                                                link.href = src || '#';
                                                                                link.target = '_blank';
                                                                                link.textContent = `📎 ${att.filename || 'Tải ảnh'}`;
                                                                                link.style.color = isAgent ? '#e0e7ff' : '#6366f1';
                                                                                link.style.fontSize = '13px';
                                                                                link.style.wordBreak = 'break-all';
                                                                                target.parentElement?.appendChild(link);
                                                                            }}
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
                                                                {msg.content && renderMessageContent(msg.content, isAgent, !!(msg.attachments?.length))}
                                                                {msg.editedAt && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>(Đã chỉnh sửa)</div>}
                                                            </div>
                                                        )}
                                                        {/* Time + Status */}
                                                        <div style={styles.msgTime}>
                                                            <Tooltip title={new Date(msg.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}>
                                                                <span style={{ cursor: 'default' }}>
                                                                    {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </Tooltip>
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
                                                    </div>{/* end group sender wrapper */}
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
                                                </Dropdown>
                                                </Fragment>
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
                                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', flexShrink: 0 }}>
                                    {/* Quote Preview */}
                                    {replyingTo && (
                                        <div style={{
                                            padding: '8px 16px', background: '#f9fafb', borderLeft: '3px solid #6366f1',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            borderTop: '1px solid #f3f4f6',
                                        }}>
                                            <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', marginBottom: 1 }}>
                                                    Trả lời {replyingTo.sender.name || (replyingTo.sender.type === 'visitor' ? 'Khách' : 'Agent')}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {replyingTo.content || 'Hình ảnh/File đính kèm'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setReplyingTo(null)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
                                            >
                                                <XIcon size={14} color="#9ca3af" />
                                            </button>
                                        </div>
                                    )}
                                    {/* iMessage-style input bar */}
                                    <div style={{
                                        padding: '10px 12px',
                                        background: '#fff',
                                        borderTop: '1px solid #f3f4f6',
                                        flexShrink: 0,
                                    }}>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            style={{ display: 'none' }}
                                            accept="image/*,.pdf,.doc,.docx,.txt"
                                        />
                                        <div style={{
                                            display: 'flex', alignItems: 'flex-end',
                                            background: '#f3f4f6', borderRadius: 22,
                                            padding: '4px 4px 4px 14px',
                                            transition: 'all 0.2s',
                                            border: '1.5px solid transparent',
                                        }}
                                            onFocusCapture={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#6366f1'; }}
                                            onBlurCapture={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = 'transparent'; }}
                                        >
                                            {/* Attachment button — inside the input bar */}
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    padding: '6px 2px', display: 'flex', alignItems: 'center',
                                                    opacity: 0.5, transition: 'opacity 0.15s', flexShrink: 0,
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                                            >
                                                <Paperclip size={18} color="#6b7280" />
                                            </button>
                                            {/* Macro button — subtle, inside input */}
                                            <Popover
                                                open={showMacroPopover}
                                                onOpenChange={(open) => { setShowMacroPopover(open); if (!open) setMacroSearchText(''); }}
                                                trigger="click"
                                                placement="topLeft"
                                                content={
                                                    <div style={{ width: 320, maxHeight: 380, display: 'flex', flexDirection: 'column' }}>
                                                        <div style={{ fontWeight: 600, padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span>Macro</span>
                                                            <a
                                                                href={`/workspace/${workspaceId}/settings?tab=templates`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ fontSize: 11, color: '#6366f1', fontWeight: 500 }}
                                                            >
                                                                Quản lý
                                                            </a>
                                                        </div>
                                                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5' }}>
                                                            <Input
                                                                size="small"
                                                                placeholder="Tìm macro..."
                                                                prefix={<Search size={14} color="#aaa" />}
                                                                value={macroSearchText}
                                                                onChange={e => setMacroSearchText(e.target.value)}
                                                                allowClear
                                                                style={{ borderRadius: 8 }}
                                                            />
                                                        </div>
                                                        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                                                            {(() => {
                                                                const q = macroSearchText.toLowerCase().trim();
                                                                const filtered = q
                                                                    ? macros.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.shortcut?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q))
                                                                    : macros;
                                                                if (filtered.length === 0) return <Empty description={macros.length === 0 ? 'Chưa có macro' : 'Không tìm thấy'} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '20px 0' }} />;
                                                                return ['team', 'personal'].map(scope => {
                                                                    const scopeMacros = filtered.filter(m => m.scope === scope);
                                                                    if (scopeMacros.length === 0) return null;
                                                                    return (
                                                                        <div key={scope} style={{ marginBottom: 4 }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', padding: '6px 14px 2px', letterSpacing: 0.5 }}>
                                                                                {scope === 'team' ? 'Team' : 'Cá nhân'}
                                                                            </div>
                                                                            {scopeMacros.map(m => (
                                                                                <Tooltip
                                                                                    key={m._id}
                                                                                    placement="right"
                                                                                    title={
                                                                                        <div style={{ maxWidth: 260, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                                                                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.title}</div>
                                                                                            {m.content}
                                                                                        </div>
                                                                                    }
                                                                                    mouseEnterDelay={0.4}
                                                                                >
                                                                                    <div
                                                                                        onClick={() => {
                                                                                            const visitor = selectedConv?.visitorInfo;
                                                                                            const vName = visitor?.name || visitor?.email || 'Khách';
                                                                                            const agentName = me?.user?.name || 'Agent';
                                                                                            const now = new Date();
                                                                                            const channel = selectedConv?.channel || 'widget';
                                                                                            const filled = m.content
                                                                                                .replace(/\{\{customer_name\}\}/g, vName)
                                                                                                .replace(/\{\{agent_name\}\}/g, agentName)
                                                                                                .replace(/\{\{order_id\}\}/g, '[order_id]')
                                                                                                .replace(/\{\{date\}\}/g, now.toLocaleDateString('vi-VN'))
                                                                                                .replace(/\{\{time\}\}/g, now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
                                                                                                .replace(/\{\{channel\}\}/g, channel);
                                                                                            setInputText(prev => prev + filled);
                                                                                            setShowMacroPopover(false);
                                                                                            setMacroSearchText('');
                                                                                            httpClient.post(`/macros/workspace/${workspaceId}/${m._id}/use`).catch(() => {});
                                                                                            chatInputRef.current?.focus();
                                                                                        }}
                                                                                        style={{ padding: '8px 14px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s', margin: '0 4px' }}
                                                                                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                                                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                                                    >
                                                                                        <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                                            {m.title}
                                                                                            {m.shortcut && <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginLeft: 4 }}>{m.shortcut}</Tag>}
                                                                                        </div>
                                                                                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                            {m.content.slice(0, 80)}{m.content.length > 80 ? '…' : ''}
                                                                                        </div>
                                                                                    </div>
                                                                                </Tooltip>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </div>
                                                }
                                            >
                                                <button
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        padding: '6px 4px', display: 'flex', alignItems: 'center',
                                                        opacity: 0.5, transition: 'opacity 0.15s', flexShrink: 0,
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                                                >
                                                    <Zap size={16} color="#6b7280" />
                                                </button>
                                            </Popover>
                                            {/* Textarea — main input */}
                                            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                                {/* Macro shortcut suggestions dropdown */}
                                                {showMacroSuggestions && (() => {
                                                    const slashMatch = inputText.match(/\/([\w]*)$/);
                                                    const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : '';
                                                    const suggestions = macros.filter(m => m.shortcut && m.shortcut.toLowerCase().startsWith('/' + slashQuery));
                                                    if (suggestions.length === 0) return null;
                                                    return (
                                                        <div style={{
                                                            position: 'absolute', bottom: '100%', left: 0, right: 0,
                                                            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                                                            boxShadow: '0 -4px 24px rgba(0,0,0,0.08)', zIndex: 100,
                                                            maxHeight: 200, overflowY: 'auto', marginBottom: 6,
                                                        }}>
                                                            <div style={{ padding: '6px 12px', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #f3f4f6' }}>Macro</div>
                                                            {suggestions.map((m, idx) => (
                                                                <div
                                                                    key={m._id}
                                                                    onClick={() => {
                                                                        const visitor = selectedConv?.visitorInfo;
                                                                        const vName = visitor?.name || visitor?.email || 'Khách';
                                                                        const agentName = me?.user?.name || 'Agent';
                                                                        const now = new Date();
                                                                        const channel = selectedConv?.channel || 'widget';
                                                                        const filled = m.content
                                                                            .replace(/\{\{customer_name\}\}/g, vName)
                                                                            .replace(/\{\{agent_name\}\}/g, agentName)
                                                                            .replace(/\{\{order_id\}\}/g, '[order_id]')
                                                                            .replace(/\{\{date\}\}/g, now.toLocaleDateString('vi-VN'))
                                                                            .replace(/\{\{time\}\}/g, now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
                                                                            .replace(/\{\{channel\}\}/g, channel);
                                                                        const newText = inputText.replace(/\/[\w]*$/, filled);
                                                                        setInputText(newText);
                                                                        setShowMacroSuggestions(false);
                                                                        httpClient.post(`/macros/workspace/${workspaceId}/${m._id}/use`).catch(() => {});
                                                                        chatInputRef.current?.focus();
                                                                    }}
                                                                    style={{
                                                                        padding: '8px 12px', cursor: 'pointer', transition: 'background 0.15s',
                                                                        background: idx === macroSuggestionIndex ? '#f5f3ff' : 'transparent',
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; setMacroSuggestionIndex(idx); }}
                                                                    onMouseLeave={e => { if (idx !== macroSuggestionIndex) e.currentTarget.style.background = 'transparent'; }}
                                                                >
                                                                    <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                        <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{m.shortcut}</Tag>
                                                                        {m.title}
                                                                    </div>
                                                                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {m.content.slice(0, 80)}{m.content.length > 80 ? '…' : ''}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                <textarea
                                                    id="chat-input"
                                                    ref={chatInputRef as any}
                                                    style={{
                                                        width: '100%', border: 'none', outline: 'none',
                                                        background: 'transparent', resize: 'none',
                                                        fontSize: 14, lineHeight: '20px',
                                                        padding: '6px 4px', minHeight: 32, maxHeight: 120,
                                                        overflow: 'hidden',
                                                        fontFamily: "var(--font-sans, 'Inter', -apple-system, sans-serif)",
                                                    }}
                                                    placeholder="Nhập tin nhắn..."
                                                    rows={1}
                                                    value={inputText}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setInputText(val);
                                                        handleTyping();
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                                        const slashMatch = val.match(/\/([\w]*)$/);
                                                        if (slashMatch && macros.some(m => m.shortcut)) {
                                                            setShowMacroSuggestions(true);
                                                            setMacroSuggestionIndex(0);
                                                        } else {
                                                            setShowMacroSuggestions(false);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (showMacroSuggestions) {
                                                            const slashMatch = inputText.match(/\/([\w]*)$/);
                                                            const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : '';
                                                            const suggestions = macros.filter(m => m.shortcut && m.shortcut.toLowerCase().startsWith('/' + slashQuery));
                                                            if (suggestions.length > 0) {
                                                                if (e.key === 'ArrowDown') { e.preventDefault(); setMacroSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1)); return; }
                                                                if (e.key === 'ArrowUp') { e.preventDefault(); setMacroSuggestionIndex(prev => Math.max(prev - 1, 0)); return; }
                                                                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                                                                    e.preventDefault();
                                                                    const m = suggestions[macroSuggestionIndex];
                                                                    if (m) {
                                                                        const visitor = selectedConv?.visitorInfo;
                                                                        const vName = visitor?.name || visitor?.email || 'Khách';
                                                                        const agentName = me?.user?.name || 'Agent';
                                                                        const now = new Date();
                                                                        const channel = selectedConv?.channel || 'widget';
                                                                        const filled = m.content
                                                                            .replace(/\{\{customer_name\}\}/g, vName)
                                                                            .replace(/\{\{agent_name\}\}/g, agentName)
                                                                            .replace(/\{\{order_id\}\}/g, '[order_id]')
                                                                            .replace(/\{\{date\}\}/g, now.toLocaleDateString('vi-VN'))
                                                                            .replace(/\{\{time\}\}/g, now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
                                                                            .replace(/\{\{channel\}\}/g, channel);
                                                                        const newText = inputText.replace(/\/[\w]*$/, filled);
                                                                        setInputText(newText);
                                                                        setShowMacroSuggestions(false);
                                                                        httpClient.post(`/macros/workspace/${workspaceId}/${m._id}/use`).catch(() => {});
                                                                    }
                                                                    return;
                                                                }
                                                                if (e.key === 'Escape') { e.preventDefault(); setShowMacroSuggestions(false); return; }
                                                            }
                                                        }
                                                        if (e.key === 'Enter' && e.altKey) {
                                                            e.preventDefault();
                                                            const target = e.target as HTMLTextAreaElement;
                                                            const start = target.selectionStart;
                                                            const end = target.selectionEnd;
                                                            const newValue = inputText.substring(0, start) + '\n' + inputText.substring(end);
                                                            setInputText(newValue);
                                                            setTimeout(() => {
                                                                target.selectionStart = target.selectionEnd = start + 1;
                                                                target.style.height = 'auto';
                                                                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                                            }, 0);
                                                        } else if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSend();
                                                        }
                                                    }}
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
                                            </div>
                                            {/* Send button — integrated pill */}
                                            <button
                                                onClick={handleSend}
                                                disabled={sending || !inputText.trim()}
                                                style={{
                                                    width: 34, height: 34, borderRadius: 18,
                                                    background: inputText.trim() ? '#6366f1' : '#e5e7eb',
                                                    border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.2s', flexShrink: 0,
                                                }}
                                            >
                                                <Send size={16} color={inputText.trim() ? '#fff' : '#9ca3af'} style={{ marginLeft: 1 }} />
                                            </button>
                                        </div>
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
                    <div className="visitor-profile-sidebar" style={{
                        width: 300,
                        flexShrink: 0,
                        overflowY: 'auto',
                        background: '#fff',
                        borderLeft: '1px solid var(--color-border, #e2e8f0)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {/* Knowledge Base Smart Suggest */}
                        <KnowledgeSuggestPanel
                            workspaceId={workspaceId as string}
                            lastCustomerMessage={(() => {
                                const visitorMsgs = messages.filter(m => m.sender?.type === 'visitor' && !m.isDeleted);
                                return visitorMsgs.length > 0 ? visitorMsgs[visitorMsgs.length - 1].content : undefined;
                            })()}
                            onInsertReply={(text) => setInputText(text)}
                        />
                        <VisitorProfileSidebar
                            workspaceId={workspaceId}
                            visitorId={selectedConv?.visitorId || null}
                            conversationTags={selectedConv?.tags || []}
                            workspaceTags={workspaceTags}
                            workspaceLabels={workspaceLabels}
                            workspaceMembers={workspaceMembers}
                            onAddTag={(tag) => !isMemberOnly && selectedConv && handleAddTag(selectedConv._id, tag)}
                            onRemoveTag={(tag) => !isMemberOnly && selectedConv && handleRemoveTag(selectedConv._id, tag)}
                            onAddNote={(content, mentionedUserIds) => {
                                if (isMemberOnly || !selectedConv) return;
                                addInternalNote.mutateAsync({ workspaceId: workspaceId as string, conversationId: selectedConv._id, content, mentionedUserIds })
                                    .then(() => message.success('Ghi chú nội bộ đã thêm'))
                                    .catch(() => message.error('Lỗi khi thêm ghi chú'));
                            }}
                            messages={messages}
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

                /* Medium screens — hide visitor sidebar to give chat more room */
                @media (max-width: 1400px) {
                    .visitor-profile-sidebar {
                        display: none !important;
                    }
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

            {/* ── Forward/Broadcast Modal ── */}
            <Modal
                title={null}
                open={showForwardModal}
                onCancel={() => { if (!broadcasting) { setShowForwardModal(false); } }}
                footer={null}
                width={520}
                styles={{ body: { padding: 0 } }}
                closable={!broadcasting}
            >
                <div style={{ padding: '20px 24px 0' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#111827' }}>
                        <Forward size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: '#6366f1' }} />
                        Chuyển tiếp tin nhắn
                    </h3>
                    <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 14px' }}>
                        {selectedMsgIds.size} tin nhắn → chọn người nhận
                    </p>

                    {/* Selected messages preview */}
                    <div style={{
                        background: '#f9fafb', borderRadius: 10, padding: '10px 14px',
                        marginBottom: 14, maxHeight: 100, overflow: 'auto',
                        border: '1px solid #e5e7eb', fontSize: 12.5, color: '#374151',
                    }}>
                        {messages.filter(m => selectedMsgIds.has(m._id)).map((m, i) => (
                            <div key={m._id} style={{ marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#9ca3af' }}>{i + 1}.</span> {m.content?.slice(0, 80)}{(m.content?.length || 0) > 80 ? '...' : ''}
                            </div>
                        ))}
                    </div>

                    {/* Tabs: Friends vs Contacts */}
                    <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                        {(['friends', 'contacts'] as const).map(tab => (
                            <div
                                key={tab}
                                onClick={() => { setForwardTab(tab); setSelectedRecipients(new Set()); setForwardSearch(''); }}
                                style={{
                                    flex: 1, padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                                    fontSize: 12.5, fontWeight: 600, transition: 'all 0.2s',
                                    background: forwardTab === tab ? '#6366f1' : '#fff',
                                    color: forwardTab === tab ? '#fff' : '#6b7280',
                                }}
                            >
                                {tab === 'friends' ? `👤 Bạn bè (${forwardFriends.length})` : `💬 Đã nhắn tin (${forwardContacts.length})`}
                            </div>
                        ))}
                    </div>

                    {/* Search */}
                    <Input
                        prefix={<Search size={14} color="#9ca3af" />}
                        placeholder={forwardTab === 'friends' ? 'Tìm bạn bè Zalo...' : 'Tìm người đã nhắn tin...'}
                        value={forwardSearch}
                        onChange={e => setForwardSearch(e.target.value)}
                        allowClear
                        style={{ borderRadius: 8, marginBottom: 10, height: 36 }}
                    />

                    {/* Select all / count */}
                    {!forwardFriendsLoading && (() => {
                        const sourceList = forwardTab === 'friends' ? forwardFriends : forwardContacts;
                        const visibleList = sourceList.filter(f => !forwardSearch || f.displayName.toLowerCase().includes(forwardSearch.toLowerCase()));
                        if (visibleList.length === 0) return null;
                        return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Checkbox
                                    checked={visibleList.length > 0 && visibleList.every(f => selectedRecipients.has(f.threadId))}
                                    indeterminate={visibleList.some(f => selectedRecipients.has(f.threadId)) && !visibleList.every(f => selectedRecipients.has(f.threadId))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedRecipients(prev => {
                                                const next = new Set(prev);
                                                visibleList.forEach(f => next.add(f.threadId));
                                                return next;
                                            });
                                        } else {
                                            setSelectedRecipients(prev => {
                                                const next = new Set(prev);
                                                visibleList.forEach(f => next.delete(f.threadId));
                                                return next;
                                            });
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: 12.5, color: '#6b7280' }}>Chọn tất cả ({visibleList.length})</span>
                                </Checkbox>
                                <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                                    {selectedRecipients.size} đã chọn
                                    {selectedRecipients.size > 50 && (
                                        <span style={{ color: '#f59e0b', fontWeight: 400, marginLeft: 6 }}>→ {Math.ceil(selectedRecipients.size / 50)} đợt</span>
                                    )}
                                </span>
                            </div>
                        );
                    })()}
                </div>

                {/* Recipients list */}
                <div style={{ maxHeight: 300, overflow: 'auto', padding: '0 24px' }}>
                    {forwardFriendsLoading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                    ) : (() => {
                        const sourceList = forwardTab === 'friends' ? forwardFriends : forwardContacts;
                        const filtered = sourceList.filter(f => !forwardSearch || f.displayName.toLowerCase().includes(forwardSearch.toLowerCase()));
                        if (filtered.length === 0) return <Empty description={forwardTab === 'friends' ? 'Không tìm thấy bạn bè' : 'Không có liên hệ nào'} style={{ padding: 30 }} />;
                        return filtered.map(person => (
                            <div
                                key={person.threadId}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 0', borderBottom: '1px solid #f3f4f6',
                                    cursor: 'pointer',
                                }}
                                onClick={() => {
                                    setSelectedRecipients(prev => {
                                        const next = new Set(prev);
                                        if (next.has(person.threadId)) next.delete(person.threadId);
                                        else next.add(person.threadId);
                                        return next;
                                    });
                                }}
                            >
                                <Checkbox checked={selectedRecipients.has(person.threadId)} />
                                {person.avatar ? (
                                    <img src={person.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: `hsl(${(person.displayName.charCodeAt(0) * 37) % 360}, 50%, 55%)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 600, fontSize: 14,
                                    }}>
                                        {person.displayName[0]?.toUpperCase()}
                                    </div>
                                )}
                                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: '#1f2937' }}>
                                    {person.displayName}
                                </div>
                            </div>
                        ));
                    })()}
                </div>

                {/* Broadcast progress */}
                {broadcastProgress && (
                    <div style={{ padding: '14px 24px', background: broadcastProgress.status === 'paused' ? '#fffbeb' : broadcastProgress.status === 'stopped' ? '#fef2f2' : '#f0fdf4', borderTop: '1px solid #e5e7eb', transition: 'background 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: broadcastProgress.status === 'paused' ? '#92400e' : broadcastProgress.status === 'stopped' ? '#991b1b' : '#166534' }}>
                                {broadcastProgress.status === 'paused' ? '⏸ Đã tạm ngưng' : broadcastProgress.status === 'stopped' ? '⬛ Đã dừng' : broadcastProgress.status === 'completed' ? '✅ Hoàn thành' : `⏳ Đang gửi... ${broadcastProgress.current}/${broadcastProgress.total}`}
                                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
                                    ✓{broadcastProgress.successCount} ✗{broadcastProgress.failedCount}
                                </span>
                            </div>
                            {broadcasting && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {broadcastProgress.status !== 'paused' ? (
                                        <button
                                            onClick={() => { broadcastPausedRef.current = true; setBroadcastProgress(p => p ? { ...p, status: 'paused' } : p); }}
                                            style={{
                                                height: 28, padding: '0 12px', borderRadius: 7,
                                                border: '1.5px solid #f59e0b', background: '#fffbeb',
                                                fontSize: 11.5, fontWeight: 600, color: '#d97706',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            ⏸ Tạm ngưng
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { broadcastPausedRef.current = false; setBroadcastProgress(p => p ? { ...p, status: 'sending' } : p); }}
                                            style={{
                                                height: 28, padding: '0 12px', borderRadius: 7,
                                                border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)',
                                                fontSize: 11.5, fontWeight: 600, color: 'white',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            ▶ Tiếp tục
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { broadcastCancelledRef.current = true; broadcastPausedRef.current = false; setBroadcastProgress(p => p ? { ...p, status: 'stopped' } : p); }}
                                        style={{
                                            height: 28, padding: '0 12px', borderRadius: 7,
                                            border: '1.5px solid #ef4444', background: '#fef2f2',
                                            fontSize: 11.5, fontWeight: 600, color: '#dc2626',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        ⬛ Dừng
                                    </button>
                                </div>
                            )}
                        </div>
                        <Progress
                            percent={Math.round((broadcastProgress.current / broadcastProgress.total) * 100)}
                            strokeColor={broadcastProgress.status === 'paused' ? '#f59e0b' : broadcastProgress.status === 'stopped' ? '#ef4444' : '#10b981'}
                            size="small"
                        />
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    padding: '14px 24px', borderTop: '1px solid #e5e7eb',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
                        ⏱ Delay 3s/người · Tự chia 50 người/đợt
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                            onClick={() => { setShowForwardModal(false); setForwardMode(false); setSelectedMsgIds(new Set()); setBroadcastProgress(null); }}
                            disabled={broadcasting}
                            style={{ borderRadius: 8 }}
                        >
                            {!broadcasting && broadcastProgress ? 'Đóng' : 'Hủy'}
                        </Button>
                        {!broadcastProgress && (
                            <Button
                                type="primary"
                                disabled={selectedRecipients.size === 0 || broadcasting}
                                loading={broadcasting}
                                onClick={async () => {
                                if (selectedRecipients.size === 0) return;
                                setBroadcasting(true);
                                broadcastPausedRef.current = false;
                                broadcastCancelledRef.current = false;

                                const recipientList = Array.from(selectedRecipients);
                                const msgContents = messages
                                    .filter(m => selectedMsgIds.has(m._id))
                                    .map(m => m.content || '')
                                    .filter(Boolean);

                                let successCount = 0;
                                let failedCount = 0;
                                setBroadcastProgress({ current: 0, total: recipientList.length, successCount: 0, failedCount: 0, status: 'sending' });

                                const DELAY_MS = 3000;
                                const BATCH_SIZE = 50;
                                const BATCH_COOLDOWN = 30000;

                                for (let i = 0; i < recipientList.length; i++) {
                                    // Check cancel
                                    if (broadcastCancelledRef.current) break;

                                    // Check pause — wait until resumed
                                    while (broadcastPausedRef.current && !broadcastCancelledRef.current) {
                                        await new Promise(r => setTimeout(r, 300));
                                    }
                                    if (broadcastCancelledRef.current) break;

                                    // Batch cooldown
                                    if (i > 0 && i % BATCH_SIZE === 0) {
                                        setBroadcastProgress(p => p ? { ...p, batchInfo: `Nghỉ ${BATCH_COOLDOWN / 1000}s giữa đợt...` } : p);
                                        await new Promise(r => setTimeout(r, BATCH_COOLDOWN));
                                        setBroadcastProgress(p => p ? { ...p, batchInfo: undefined } : p);
                                    }

                                    // Send to this recipient
                                    try {
                                        await httpClient.post(`/workspaces/${workspaceId}/zalo/broadcast`, {
                                            messages: msgContents,
                                            recipientIds: [recipientList[i]],
                                            delayMs: 1000,
                                        });
                                        successCount++;
                                    } catch {
                                        failedCount++;
                                    }

                                    setBroadcastProgress({
                                        current: i + 1,
                                        total: recipientList.length,
                                        successCount,
                                        failedCount,
                                        status: broadcastCancelledRef.current ? 'stopped' : 'sending',
                                    });

                                    // Delay between recipients (anti-spam)
                                    if (i < recipientList.length - 1 && !broadcastCancelledRef.current) {
                                        await new Promise(r => setTimeout(r, DELAY_MS));
                                    }
                                }

                                // Final status
                                const finalStatus = broadcastCancelledRef.current ? 'stopped' : 'completed';
                                setBroadcastProgress(p => p ? { ...p, status: finalStatus } : p);

                                if (finalStatus === 'completed') {
                                    message.success(`Đã gửi thành công ${successCount}/${recipientList.length} người!`);
                                } else {
                                    message.warning(`Đã dừng: gửi ${successCount} thành công, ${failedCount} thất bại`);
                                }

                                setBroadcasting(false);
                                // Auto-close after 2s if completed
                                if (finalStatus === 'completed') {
                                    setTimeout(() => {
                                        setShowForwardModal(false);
                                        setForwardMode(false);
                                        setSelectedMsgIds(new Set());
                                        setBroadcastProgress(null);
                                    }, 2000);
                                }
                            }}
                            style={{ borderRadius: 8, background: '#6366f1', border: 'none', minWidth: 120 }}
                            icon={<Send size={14} />}
                        >
                            Gửi đến {selectedRecipients.size} người
                        </Button>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ── Contact Profile Popup ── */}
            <ContactProfileModal
                open={!!profileModalConv}
                onClose={() => setProfileModalConv(null)}
                workspaceId={workspaceId}
                conversation={profileModalConv}
                onSendMessage={() => {
                    if (profileModalConv) {
                        setSelectedConvId(profileModalConv._id);
                        setProfileModalConv(null);
                        chatInputRef.current?.focus();
                    }
                }}
            />
        </AppLayout>
    );
}

// ── Styles ──
const ctxMenuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
    cursor: 'pointer', fontSize: 13, color: '#333', transition: 'background .1s',
};

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
        width: 300,
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
        maxWidth: 200,
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
        overflow: 'hidden',
    },
    chatHeader: {
        padding: '10px 16px',
        background: '#fff',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative' as const,
        zIndex: 2,
        flexShrink: 0,
        minHeight: 56,
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
        padding: '12px 14px',
        background: 'var(--color-bg, #fff)',
        borderTop: '1px solid var(--color-border, #e2e8f0)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexShrink: 0,
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
