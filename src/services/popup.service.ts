import { httpClient } from '../lib/http/client';

interface IApiRes<T = any> {
    success: boolean;
    data?: T;
    message?: string;
}

export const popupHttpService = {
    async create(workspaceId: string, payload: any): Promise<IApiRes> {
        const { data } = await httpClient.post(`/workspaces/${workspaceId}/popups`, payload);
        return data;
    },

    async getByWorkspace(workspaceId: string): Promise<IApiRes> {
        const { data } = await httpClient.get(`/workspaces/${workspaceId}/popups`);
        return data;
    },

    async update(workspaceId: string, popupId: string, payload: any): Promise<IApiRes> {
        const { data } = await httpClient.patch(`/workspaces/${workspaceId}/popups/${popupId}`, payload);
        return data;
    },

    async deletePopup(workspaceId: string, popupId: string): Promise<IApiRes> {
        const { data } = await httpClient.delete(`/workspaces/${workspaceId}/popups/${popupId}`);
        return data;
    },
};
