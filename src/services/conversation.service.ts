import { httpClient } from '../lib/http/client';
import { Visitor } from '../types/visitor';
import { ApiResponse } from '../types';

export const conversationService = {
    getVisitor: async (workspaceId: string, visitorId: string): Promise<Visitor> => {
        const res = await httpClient.get<ApiResponse<Visitor>>(`/conversations/workspace/${workspaceId}/visitors/${visitorId}`);
        return res.data.data;
    },
    updateVisitor: async (
        workspaceId: string,
        visitorId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ): Promise<Visitor> => {
        const res = await httpClient.patch<ApiResponse<Visitor>>(`/conversations/workspace/${workspaceId}/visitors/${visitorId}`, data);
        return res.data.data;
    },
    getUnreadCount: async (workspaceId: string): Promise<{ totalUnread: number; zaloUnread: number; inboxUnread: number }> => {
        const res = await httpClient.get<ApiResponse<{ totalUnread: number; zaloUnread: number; inboxUnread: number }>>(`/conversations/workspace/${workspaceId}/unread-count`);
        return res.data.data;
    },
    addInternalNote: async (workspaceId: string, conversationId: string, payload: { content: string, mentionedUserIds?: string[] }) => {
        const res = await httpClient.post<ApiResponse<any>>(`/conversations/workspace/${workspaceId}/${conversationId}/notes`, payload);
        return res.data;
    }
};
