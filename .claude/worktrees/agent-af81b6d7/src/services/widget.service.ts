import { httpClient } from '../lib/http/client';

export interface IWidgetResponse {
    _id: string;
    workspaceId: string;
    name: string;
    config: {
        primaryColor: string;
        greeting: string;
        placeholder: string;
        position: 'bottom-right' | 'bottom-left';
        language: string;
        avatarUrl?: string;
        showBranding: boolean;
        offlineMessage: string;
        autoReply?: string;
        preChatForm: {
            enabled: boolean;
            title: string;
            fields: Array<{
                key: string;
                label: string;
                type: string;
                required: boolean;
                enabled: boolean;
            }>;
        };
    };
    domainRules: {
        mode: 'allowlist' | 'blocklist';
        domains: string[];
    };
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface IApiRes<T = any> {
    success: boolean;
    data?: T;
    message?: string;
}

export const widgetHttpService = {
    async create(workspaceId: string, payload: any): Promise<IApiRes<IWidgetResponse>> {
        const { data } = await httpClient.post(`/workspaces/${workspaceId}/widgets`, payload);
        return data;
    },

    async getByWorkspace(workspaceId: string): Promise<IApiRes<IWidgetResponse[]>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/widgets`);
        return data;
    },

    async getOne(workspaceId: string, widgetId: string): Promise<IApiRes<IWidgetResponse>> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/widgets/${widgetId}`);
        return data;
    },

    async update(workspaceId: string, widgetId: string, payload: any): Promise<IApiRes<IWidgetResponse>> {
        const { data } = await httpClient.patch(`/workspaces/${workspaceId}/widgets/${widgetId}`, payload);
        return data;
    },

    async deleteWidget(workspaceId: string, widgetId: string): Promise<IApiRes> {
        const { data } = await httpClient.delete(`/workspaces/${workspaceId}/widgets/${widgetId}`);
        return data;
    },
};
