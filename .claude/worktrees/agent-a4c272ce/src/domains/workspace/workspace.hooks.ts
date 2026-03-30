import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspaceHttpService } from '../../services/workspace.service';

export const workspaceKeys = {
    all: ['workspaces'] as const,
    list: () => [...workspaceKeys.all, 'list'] as const,
    detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
    dashboard: (id: string) => [...workspaceKeys.all, 'dashboard', id] as const,
    agentPerformance: (id: string) => [...workspaceKeys.all, 'agent-performance', id] as const,
};

export const useMyWorkspaces = () => {
    return useQuery({
        queryKey: workspaceKeys.list(),
        queryFn: () => workspaceHttpService.getMyWorkspaces(),
    });
};

export const useWorkspace = (id: string, enabled = true) => {
    return useQuery({
        queryKey: workspaceKeys.detail(id),
        queryFn: () => workspaceHttpService.getOne(id),
        enabled: !!id && enabled,
    });
};

export const useWorkspaceDashboard = (id: string, enabled = true) => {
    return useQuery({
        queryKey: workspaceKeys.dashboard(id),
        queryFn: () => workspaceHttpService.getDashboardStats(id),
        enabled: !!id && enabled,
    });
};

export const useAgentPerformance = (id: string, enabled = true) => {
    return useQuery({
        queryKey: workspaceKeys.agentPerformance(id),
        queryFn: () => workspaceHttpService.getAgentPerformance(id),
        enabled: !!id && enabled,
    });
};

export const useCreateWorkspace = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { name: string; slug: string }) => workspaceHttpService.create(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: workspaceKeys.list() });
        },
    });
};

export const useUpdateWorkspace = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...payload }: { id: string; [key: string]: any }) =>
            workspaceHttpService.update(id, payload),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: workspaceKeys.detail(variables.id) });
            qc.invalidateQueries({ queryKey: workspaceKeys.list() });
        },
    });
};

export const useDeleteWorkspace = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => workspaceHttpService.deleteWorkspace(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: workspaceKeys.list() });
        },
    });
};

export const useWorkspaceMembers = (workspaceId: string) => {
    return useQuery({
        queryKey: [...workspaceKeys.detail(workspaceId), 'members'],
        queryFn: () => workspaceHttpService.getMembers(workspaceId),
        enabled: !!workspaceId,
    });
};

export const useAddWorkspaceMember = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ workspaceId, email, role }: { workspaceId: string; email: string; role: string }) =>
            workspaceHttpService.addMember(workspaceId, { email, role }),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: [...workspaceKeys.detail(variables.workspaceId), 'members'] });
            qc.invalidateQueries({ queryKey: workspaceKeys.detail(variables.workspaceId) });
        },
    });
};

export const useRemoveWorkspaceMember = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ workspaceId, userId }: { workspaceId: string; userId: string }) =>
            workspaceHttpService.removeMember(workspaceId, userId),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: [...workspaceKeys.detail(variables.workspaceId), 'members'] });
            qc.invalidateQueries({ queryKey: workspaceKeys.detail(variables.workspaceId) });
        },
    });
};

export const useWorkspaceTags = (workspaceId: string) => {
    return useQuery({
        queryKey: [...workspaceKeys.detail(workspaceId), 'tags'],
        queryFn: () => workspaceHttpService.getTags(workspaceId),
        enabled: !!workspaceId,
    });
};

export const useAddWorkspaceTag = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ workspaceId, tag }: { workspaceId: string; tag: string }) =>
            workspaceHttpService.addTag(workspaceId, tag),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: [...workspaceKeys.detail(variables.workspaceId), 'tags'] });
        },
    });
};

export const useRemoveWorkspaceTag = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ workspaceId, tag }: { workspaceId: string; tag: string }) =>
            workspaceHttpService.removeTag(workspaceId, tag),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: [...workspaceKeys.detail(variables.workspaceId), 'tags'] });
        },
    });
};
