import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { widgetHttpService } from '../../services/widget.service';

export const widgetKeys = {
    all: ['widgets'] as const,
    byWorkspace: (wsId: string) => [...widgetKeys.all, 'workspace', wsId] as const,
    detail: (wsId: string, wId: string) => [...widgetKeys.all, 'detail', wsId, wId] as const,
};

export const useWidgetsByWorkspace = (workspaceId: string) => {
    return useQuery({
        queryKey: widgetKeys.byWorkspace(workspaceId),
        queryFn: () => widgetHttpService.getByWorkspace(workspaceId),
        enabled: !!workspaceId,
    });
};

export const useWidget = (workspaceId: string, widgetId: string) => {
    return useQuery({
        queryKey: widgetKeys.detail(workspaceId, widgetId),
        queryFn: () => widgetHttpService.getOne(workspaceId, widgetId),
        enabled: !!workspaceId && !!widgetId,
    });
};

export const useCreateWidget = (workspaceId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: any) => widgetHttpService.create(workspaceId, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: widgetKeys.byWorkspace(workspaceId) });
        },
    });
};

export const useUpdateWidget = (workspaceId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ widgetId, ...payload }: { widgetId: string; [key: string]: any }) =>
            widgetHttpService.update(workspaceId, widgetId, payload),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: widgetKeys.detail(workspaceId, vars.widgetId) });
            qc.invalidateQueries({ queryKey: widgetKeys.byWorkspace(workspaceId) });
        },
    });
};

export const useDeleteWidget = (workspaceId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (widgetId: string) => widgetHttpService.deleteWidget(workspaceId, widgetId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: widgetKeys.byWorkspace(workspaceId) });
        },
    });
};
