// ── Common API types ──

export interface ApiResponse<T = any> {
    success: boolean;
    data: T;
    error?: string;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page?: number;
    limit?: number;
}

export type SenderType = 'visitor' | 'agent' | 'system';
export type MessageType = 'text' | 'image' | 'file' | 'system';
export type ConversationStatus = 'open' | 'pending' | 'closed' | 'resolved';
export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'side-right' | 'side-left';
export type WorkspacePlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type MemberRole = 'owner' | 'admin' | 'agent' | 'member';
