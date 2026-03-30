import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './auth.api';

export const authKeys = {
    all: ['auth'] as const,
    me: () => [...authKeys.all, 'me'] as const,
    sessions: () => [...authKeys.all, 'sessions'] as const,
};

export const useLogin = () => {
    return useMutation({
        mutationFn: (payload: any) => authApi.login(payload),
        onSuccess: (data) => {
            if (data.data?.accessToken) {
                localStorage.setItem('nemark_token', data.data.accessToken);
            }
        }
    });
};

export const useGetMe = (enabled = true) => {
    return useQuery({
        queryKey: authKeys.me(),
        queryFn: () => authApi.getMe(),
        enabled,
        retry: 1,
    });
};

export const useLogout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => authApi.logout(),
        onSuccess: () => {
            localStorage.removeItem('nemark_token');
            queryClient.removeQueries({ queryKey: authKeys.all });
        }
    });
};

export const useForgotPassword = () => {
    return useMutation({
        mutationFn: (email: string) => authApi.forgotPassword(email)
    });
};

export const useResetPassword = () => {
    return useMutation({
        mutationFn: (payload: any) => authApi.resetPassword(payload)
    });
};

export const useChangePassword = () => {
    return useMutation({
        mutationFn: (payload: any) => authApi.changePassword(payload)
    });
};

export const useGetSessions = () => {
    return useQuery({
        queryKey: authKeys.sessions(),
        queryFn: () => authApi.getSessions(),
    });
};

export const useRevokeOtherSessions = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => authApi.revokeOtherSessions(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
        }
    });
};

export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { name: string; avatarUrl?: string }) => authApi.updateProfile(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: authKeys.me() });
        }
    });
};
