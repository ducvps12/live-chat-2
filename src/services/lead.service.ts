import { httpClient } from '../lib/http/client';

export const leadService = {
    list: async (workspaceId: string, params?: Record<string, any>) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/leads`, { params });
        return res.data;
    },
    getById: async (workspaceId: string, leadId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/leads/${leadId}`);
        return res.data;
    },
    create: async (workspaceId: string, data: any) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads`, data);
        return res.data;
    },
    update: async (workspaceId: string, leadId: string, data: any) => {
        const res = await httpClient.patch(`/workspaces/${workspaceId}/leads/${leadId}`, data);
        return res.data;
    },
    updateStage: async (workspaceId: string, leadId: string, stage: string) => {
        const res = await httpClient.patch(`/workspaces/${workspaceId}/leads/${leadId}/stage`, { stage });
        return res.data;
    },
    addNote: async (workspaceId: string, leadId: string, text: string) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads/${leadId}/notes`, { text });
        return res.data;
    },
    delete: async (workspaceId: string, leadId: string) => {
        const res = await httpClient.delete(`/workspaces/${workspaceId}/leads/${leadId}`);
        return res.data;
    },
    getStats: async (workspaceId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/leads/stats`);
        return res.data;
    },
    convertFromContact: async (workspaceId: string, data: any) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads/convert`, data);
        return res.data;
    },
    bulkConvertFromGroup: async (workspaceId: string, data: any) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads/convert-group`, data);
        return res.data;
    },

    // ── AI Analysis ──
    aiAnalyze: async (workspaceId: string, conversationId: string, forceReanalyze = false) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads/ai-analyze/${conversationId}`, { forceReanalyze });
        return res.data;
    },
    aiAnalyzeBulk: async (workspaceId: string, limit = 30, forceReanalyze = false) => {
        const res = await httpClient.post(`/workspaces/${workspaceId}/leads/ai-analyze-bulk`, { limit, forceReanalyze });
        return res.data;
    },
    getAIAnalysis: async (workspaceId: string, conversationId: string) => {
        const res = await httpClient.get(`/workspaces/${workspaceId}/leads/ai-analysis/${conversationId}`);
        return res.data;
    },
};
