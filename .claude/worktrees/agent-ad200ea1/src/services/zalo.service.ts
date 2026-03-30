import { httpClient } from '../lib/http/client';

export const zaloService = {
    getStatus: async (workspaceId: string) => {
        const res = await httpClient.get(`/api/v1/workspaces/${workspaceId}/zalo/status`);
        return res.data;
    },
    generateQR: async (workspaceId: string) => {
        const res = await httpClient.post(`/api/v1/workspaces/${workspaceId}/zalo/qr`);
        return res.data;
    },
    disconnect: async (workspaceId: string) => {
        const res = await httpClient.post(`/api/v1/workspaces/${workspaceId}/zalo/disconnect`);
        return res.data;
    }
};
