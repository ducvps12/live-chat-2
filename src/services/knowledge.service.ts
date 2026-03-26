import { httpClient } from '../lib/http/client';

export const knowledgeService = {
    syncFromSheet: async (workspaceId: string, sheetUrl: string) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/knowledge/sync`, { sheetUrl });
        return res.data;
    },
    getAll: async (workspaceId: string, product?: string) => {
        const params: any = {};
        if (product) params.product = product;
        const res = await httpClient.get(`/workspaces/${workspaceId}/knowledge`, { params });
        return res.data;
    },
    search: async (workspaceId: string, query: string, limit = 5) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/knowledge/search`, {
            params: { q: query, limit },
        });
        return res.data;
    },
    suggest: async (workspaceId: string, message: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/knowledge/suggest`, {
            params: { message },
        });
        return res.data;
    },
    getProducts: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/knowledge/products`);
        return res.data;
    },
    getStats: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/knowledge/stats`);
        return res.data;
    },
    create: async (workspaceId: string, data: { product: string; question: string; answer: string; upsaleText?: string }) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/knowledge`, data);
        return res.data;
    },
    update: async (workspaceId: string, id: string, data: any) => {
        const res = await httpClient.put(`/workspaces/${workspaceId}/knowledge/${id}`, data);
        return res.data;
    },
    remove: async (workspaceId: string, id: string) => {
        const res = await httpClient.delete(`/workspaces/${workspaceId}/knowledge/${id}`);
        return res.data;
    },
};
