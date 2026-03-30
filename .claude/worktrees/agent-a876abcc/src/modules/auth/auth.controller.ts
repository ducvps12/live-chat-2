import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { authService } from './auth.service';
import { sessionRepo } from './repos/session.repo';
import { userRepo } from './repos/user.repo';

export const authController = {
    login: asyncHandler(async (req: Request, res: Response) => {
        const { email, password } = (req as any).validated?.body || req.body;
        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const result = await authService.login(email, password, ipAddress, userAgent);
        
        // Set HTTP-only Cookie for Refresh Token
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(200).json({
            success: true,
            data: { accessToken: result.accessToken, user: result.user },
        });
    }),

    refreshToken: asyncHandler(async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            res.status(401);
            throw new Error('Không tìm thấy Refresh Token');
        }

        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const result = await authService.refreshToken(refreshToken, ipAddress, userAgent);

        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            success: true,
            data: { accessToken: result.accessToken },
        });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await authService.logout(refreshToken);
        }
        res.clearCookie('refreshToken');
        res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
    }),

    changePassword: asyncHandler(async (req: Request, res: Response) => {
        const { oldPassword, newPassword } = (req as any).validated.body;
        const userId = (req as any).user.id;
        
        await authService.changePassword(userId, oldPassword, newPassword);
        
        res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });
    }),

    forgotPassword: asyncHandler(async (req: Request, res: Response) => {
        const { email } = (req as any).validated.body;
        await authService.forgotPassword(email);
        res.status(200).json({ success: true, message: 'Nếu email tồn tại, một liên kết khôi phục sẽ được gửi.' });
    }),

    resetPassword: asyncHandler(async (req: Request, res: Response) => {
        const { token, newPassword } = (req as any).validated.body;
        await authService.resetPassword(token, newPassword);
        res.status(200).json({ success: true, message: 'Khôi phục mật khẩu thành công' });
    }),

    getSessions: asyncHandler(async (req: Request, res: Response) => {
        const userId = (req as any).user.id;
        const sessions = await sessionRepo.getActiveSessions(userId);
        res.status(200).json({ success: true, data: sessions });
    }),

    revokeOtherSessions: asyncHandler(async (req: Request, res: Response) => {
        const userId = (req as any).user.id;
        const currentRefreshToken = req.cookies?.refreshToken || '';
        await sessionRepo.revokeAllOtherSessions(userId, currentRefreshToken);
        res.status(200).json({ success: true, message: 'Đã thu hồi tất cả phiên làm việc khác' });
    }),

    setup: asyncHandler(async (req: Request, res: Response) => {
        const { email, password, name } = req.body;
        const result = await authService.setupInitialAdmin(email, password, name);
        res.status(201).json({ success: true, message: 'Admin account created', data: result });
    }),
    
    me: asyncHandler(async (req: Request, res: Response) => {
        const userId = (req as any).user.id;
        const user = await userRepo.findById(userId);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }
        res.status(200).json({ 
            success: true, 
            data: { 
                user: { 
                    id: user._id, 
                    email: user.email, 
                    name: user.name, 
                    role: user.role, 
                    avatarUrl: user.avatarUrl 
                } 
            } 
        });
    }),

    updateProfile: asyncHandler(async (req: Request, res: Response) => {
        const userId = (req as any).user.id;
        const data = (req as any).validated.body;
        const updatedUser = await authService.updateProfile(userId, data);
        res.status(200).json({ success: true, data: { user: updatedUser }, message: 'Cập nhật hồ sơ thành công' });
    })
};
