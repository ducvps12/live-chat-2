import { useQuery, useMutation } from '@tanstack/react-query';
import { conversationApi } from './conversation.api';
import { conversationService } from '../../services/conversation.service';

export const conversationKeys = {
    all: ['conversations'] as const,
    unreadCount: (workspaceId: string) => [...conversationKeys.all, workspaceId, 'unread-count'] as const,
};

export function useTotalUnreadCount(workspaceId: string, enabled = true) {
    return useQuery({
        queryKey: conversationKeys.unreadCount(workspaceId),
        queryFn: () => conversationApi.getUnreadCount(workspaceId),
        enabled: !!workspaceId && enabled,
    });
}

export function useAddInternalNote() {
    return useMutation({
        mutationFn: ({ workspaceId, conversationId, content, mentionedUserIds }: { workspaceId: string, conversationId: string, content: string, mentionedUserIds?: string[] }) =>
            conversationService.addInternalNote(workspaceId, conversationId, { content, mentionedUserIds }),
    });
}
