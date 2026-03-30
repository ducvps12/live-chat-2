import { httpClient } from '../lib/http/client';

export interface IWorkspaceResponse {
    _id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    ownerId: string;
    plan: string;
    settings: {
        timezone: string;
        language: string;
        businessHours?: {
            enabled: boolean;
            schedule: Array<{ day: number; start: string; end: string }>;
        };
    };
    members: Array<{
        userId: string;
        role: string;
        joinedAt: string;
    }>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IApiRes<T = any> {
    success: boolean;
    data?: T;
    message?: string;
}

export const workspaceHttpService = {
    async create(payload: { name: string; slug: string }): Promise<IApiRes<IWorkspaceResponse>> {
        const { data } = await httpClient.post('/workspaces', payload);
        return data;
    },

    async getMyWorkspaces(): Promise<IApiRes<IWorkspaceResponse[]>> {
        const { data } = await httpClient.get('/workspaces');
        return data;
    },

    async getOne(workspaceId: string): Promise<IApiRes<IWorkspaceResponse>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}`);
        return data;
    },

    async getDashboardStats(workspaceId: string): Promise<IApiRes<any>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/dashboard`);
        return data;
    },

    async update(workspaceId: string, payload: any): Promise<IApiRes<IWorkspaceResponse>> {
        const { data } = await httpClient.patch(`/workspaces/${workspaceId}`, payload);
        return data;
    },

    async deleteWorkspace(workspaceId: string): Promise<IApiRes> {
        const { data } = await httpClient.delete(`/workspaces/${workspaceId}`);
        return data;
    },

    async addMember(workspaceId: string, payload: { email: string; role: string }): Promise<IApiRes<IWorkspaceResponse>> {
        const { data } = await httpClient.post(`/workspaces/${workspaceId}/members`, payload);
        return data;
    },

    async removeMember(workspaceId: string, userId: string): Promise<IApiRes<IWorkspaceResponse>> {
        const { data } = await httpClient.delete(`/workspaces/${workspaceId}/members/${userId}`);
        return data;
    },

    async getMembers(workspaceId: string): Promise<IApiRes<any[]>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/members`);
        return data;
    },

    async getTags(workspaceId: string): Promise<IApiRes<string[]>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/tags`);
        return data;
    },

    async addTag(workspaceId: string, tag: string): Promise<IApiRes<any>> {
        const { data } = await httpClient.post(`/workspaces/${workspaceId}/tags`, { tag });
        return data;
    },

    async removeTag(workspaceId: string, tag: string): Promise<IApiRes<any>> {
        const { data } = await httpClient.delete(`/workspaces/${workspaceId}/tags`, { data: { tag } });
        return data;
    },

    async getAgentPerformance(workspaceId: string): Promise<IApiRes<any[]>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/agent-performance`);
        return data;
    },
};
