import { authHttpService } from '../../services/auth.service';

/**
 * Domain Adapter
 */
export const authApi = {
    login: async (payload: any) => authHttpService.login(payload),
    getMe: async () => authHttpService.me(),
    logout: async () => authHttpService.logout(),
    forgotPassword: async (email: string) => authHttpService.forgotPassword(email),
    resetPassword: async (payload: any) => authHttpService.resetPassword(payload),
    changePassword: async (payload: any) => authHttpService.changePassword(payload),
    updateProfile: async (payload: { name: string; avatarUrl?: string }) => authHttpService.updateProfile(payload),
    getSessions: async () => authHttpService.getSessions(),
    revokeOtherSessions: async () => authHttpService.revokeOtherSessions()
};
