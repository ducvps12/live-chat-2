// ── Visitor profile (frontend-facing) ──
export interface Visitor {
    _id: string;
    visitorId: string;
    widgetId: string;
    workspaceId: string;
    name: string;
    email: string;
    phone: string;
    firstSeenAt: string;
    lastSeenAt: string;
    totalConversations: number;
    attributes: Record<string, any>;
    createdAt: string;
    updatedAt?: string;
}
