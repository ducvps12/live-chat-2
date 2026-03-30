import { httpClient } from '../lib/http/client';
import { IAuthResponseData, ILoginResponse, ISession, IUser } from '../domains/auth/auth.types';

export const authHttpService = {
    async login(payload: any): Promise<IAuthResponseData<ILoginResponse>> {
        const { data } = await httpClient.post('/auth/login', payload);
        return data;
    },
    
    async me(): Promise<IAuthResponseData<{ user: IUser }>> {
        const { data } = await httpClient.get('/auth/me');
        return data;
    },

    async logout(): Promise<IAuthResponseData> {
        const { data } = await httpClient.post('/auth/logout');
        return data;
    },

    async refreshToken(): Promise<IAuthResponseData<{ accessToken: string }>> {
        const { data } = await httpClient.post('/auth/refresh');
        return data;
    },

    async getSessions(): Promise<IAuthResponseData<ISession[]>> {
        const { data } = await httpClient.get('/auth/sessions');
        return data;
    },

    async revokeOtherSessions(): Promise<IAuthResponseData> {
        const { data } = await httpClient.delete('/auth/sessions');
        return data;
    },

    async forgotPassword(email: string): Promise<IAuthResponseData> {
        const { data } = await httpClient.post('/auth/forgot-password', { email });
        return data;
    },

    async resetPassword(payload: any): Promise<IAuthResponseData> {
        const { data } = await httpClient.post('/auth/reset-password', payload);
        return data;
    },

    async changePassword(payload: any): Promise<IAuthResponseData> {
        const { data } = await httpClient.post('/auth/change-password', payload);
        return data;
    },

    async updateProfile(payload: { name: string; avatarUrl?: string }): Promise<IAuthResponseData<{ user: IUser }>> {
        const { data } = await httpClient.patch('/auth/profile', payload);
        return data;
    }
};
