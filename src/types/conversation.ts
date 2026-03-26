import { ConversationStatus } from './common';

// ── Visitor info embedded in conversation ──
export interface VisitorInfo {
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: any;
}

// ── Conversation (frontend-facing, JSON from API) ──
export interface Conversation {
    _id: string;
    workspaceId: string;
    widgetId: string;
    visitorId: string;
    visitorInfo?: VisitorInfo;
    status: ConversationStatus;
    priority?: 'urgent' | 'high' | 'normal' | 'low';
    slaDeadline?: string;
    tags?: string[];
    assignedTo?: string | { _id: string; name: string; email?: string };
    lastMessageAt?: string;
    lastMessagePreview?: string;   // client-side computed (from socket)
    lastMessageSnippet?: string;   // server-side persisted
    lastSender?: {
        type: 'visitor' | 'agent' | 'system';
        name?: string;
    };
    unreadCount?: number;
    isPinned?: boolean;
    metadata?: Record<string, any>;
    channel?: 'widget' | 'zalo';
    createdAt: string;
    updatedAt?: string;
}
