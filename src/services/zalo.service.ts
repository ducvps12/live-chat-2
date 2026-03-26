import { httpClient } from '../lib/http/client';

export const zaloService = {
    getStatus: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/status`);
        return res.data;
    },
    generateQR: async (workspaceId: string) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/zalo/qr`);
        return res.data;
    },
    disconnect: async (workspaceId: string, accountId?: string) => {
        const res = await httpClient.delete(`/workspaces/${workspaceId}/zalo/disconnect`, {
            data: accountId ? { accountId } : undefined,
        });
        return res.data;
    },
    startSync: async (workspaceId: string) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/zalo/sync`);
        return res.data;
    },
    getSyncStatus: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/sync/status`);
        return res.data;
    },
    getGroups: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/groups`);
        return res.data;
    },
    getGroupMembers: async (workspaceId: string, groupId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/groups/${groupId}/members`);
        return res.data;
    },
    autoFriendGroup: async (workspaceId: string, groupId: string, data?: { message?: string; delayMs?: number; selectedUserIds?: string[] }) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/zalo/groups/${groupId}/auto-friend`, data || {});
        return res.data;
    },
    getAutoFriendStatus: async (workspaceId: string, groupId?: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/auto-friend/status`, {
            params: groupId ? { groupId } : undefined,
        });
        return res.data;
    },
    analyzeMember: async (workspaceId: string, userId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/zalo/analyze/${userId}`);
        return res.data;
    },
    batchAnalyzeMembers: async (workspaceId: string, userIds: string[]) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/zalo/analyze/batch`, { userIds });
        return res.data;
    },
    syncAllGroupsToLeads: async (workspaceId: string) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/zalo/groups/sync-all-to-leads`);
        return res.data;
    },
    kickMember: async (workspaceId: string, groupId: string, userId: string) => {
        const res = await httpClient.delete(`/workspaces/${workspaceId}/zalo/groups/${groupId}/members/${userId}`);
        return res.data;
    },
};

