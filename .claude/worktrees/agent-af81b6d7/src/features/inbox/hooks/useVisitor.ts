import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationService } from '../../../services/conversation.service';
import { Visitor } from '../../../types/visitor';

export const useGetVisitor = (workspaceId?: string, visitorId?: string) => {
    return useQuery<Visitor, Error>({
        queryKey: ['visitor', workspaceId, visitorId],
        queryFn: () => conversationService.getVisitor(workspaceId!, visitorId!),
        enabled: !!workspaceId && !!visitorId,
        staleTime: 1000 * 60 * 5, // 5 mins
    });
};

export const useUpdateVisitor = () => {
    const queryClient = useQueryClient();

    return useMutation<Visitor, Error, { workspaceId: string, visitorId: string, data: Partial<Visitor> }>({
        mutationFn: ({ workspaceId, visitorId, data }) =>
            conversationService.updateVisitor(workspaceId, visitorId, data),
        onSuccess: (data, variables) => {
            queryClient.setQueryData(['visitor', variables.workspaceId, variables.visitorId], data);
            
            // Invalidate conversation list or individual conversation if they exist
            // (Assuming they might hold some visitorInfo snippet)
            queryClient.invalidateQueries({ queryKey: ['conversations', variables.workspaceId] });
        },
    });
};
