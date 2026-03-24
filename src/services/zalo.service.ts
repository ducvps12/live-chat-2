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
    }
};
