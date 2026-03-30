import crypto from 'crypto';
import { userRepo } from './repos/user.repo';
import { sessionRepo } from './repos/session.repo';
import { security } from '../../infra/security';
import { AppError } from '../../middlewares/errorHandler';

export const authService = {
    async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
        const user = await userRepo.findByEmail(email);
        if (!user) throw new AppError('Email hoặc mật khẩu không chính xác', 400, 'INVALID_CREDENTIALS');
        if (!user.isActive) throw new AppError('Tài khoản đã bị vô hiệu hoá', 403, 'ACCOUNT_DISABLED');

        const isMatch = await security.comparePassword(password, user.passwordHash);
        if (!isMatch) throw new AppError('Email hoặc mật khẩu không chính xác', 400, 'INVALID_CREDENTIALS');

        // Generate Access Token (Short-lived, e.g. 15m or 1h)
        const accessToken = security.generateToken({
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
        });

        // Generate Refresh Token (Long-lived, e.g. 7d)
        const refreshToken = crypto.randomBytes(40).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await sessionRepo.createSession({
            userId: user._id as any,
            refreshToken,
            ipAddress,
            userAgent,
            expiresAt
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatarUrl: user.avatarUrl,
            }
        };
    },

    async refreshToken(token: string, ipAddress?: string, userAgent?: string) {
        const session = await sessionRepo.findByToken(token);
        if (!session) throw new AppError('Refresh token không hợp lệ', 401, 'INVALID_TOKEN');
        if (session.revokedAt) throw new AppError('Phiên đăng nhập đã bị thu hồi', 401, 'TOKEN_REVOKED');
        if (session.expiresAt < new Date()) throw new AppError('Phiên đăng nhập đã hết hạn', 401, 'TOKEN_EXPIRED');

        const user = await userRepo.findById(session.userId.toString());
        if (!user || !user.isActive) throw new AppError('Tài khoản không hợp lệ', 401, 'INVALID_USER');

        // Revoke old refresh token (Rotation)
        await sessionRepo.revokeToken(token);

        // Generate new tokens
        const newAccessToken = security.generateToken({
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
        });

        const newRefreshToken = crypto.randomBytes(40).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await sessionRepo.createSession({
            userId: user._id as any,
            refreshToken: newRefreshToken,
            ipAddress,
            userAgent,
            expiresAt
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };
    },

    async logout(refreshToken: string) {
        await sessionRepo.revokeToken(refreshToken);
        return true;
    },

    async changePassword(userId: string, oldPass: string, newPass: string) {
        const user = await userRepo.findById(userId);
        if (!user) throw new AppError('Tài khoản không hợp lệ', 401, 'INVALID_USER');

        const isMatch = await security.comparePassword(oldPass, user.passwordHash);
        if (!isMatch) throw new AppError('Mật khẩu cũ không chính xác', 400, 'INVALID_PASSWORD');

        const passwordHash = await security.hashPassword(newPass);
        await userRepo.updateUser(userId, { passwordHash });
        
        return true;
    },

    async forgotPassword(email: string) {
        const user = await userRepo.findByEmail(email);
        if (!user) return true; // Do not reveal if email exists or not

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        const resetPasswordExpires = new Date();
        resetPasswordExpires.setMinutes(resetPasswordExpires.getMinutes() + 15); // 15 mins

        await userRepo.updateUser(user._id.toString(), {
            resetPasswordToken: tokenHash,
            resetPasswordExpires
        });

        // Mock sending email
        console.log(`[Email Mock] Reset password link sent to ${email}`);
        console.log(`[Email Mock] Link: http://localhost:3000/auth/reset-password?token=${resetToken}`);
        
        return true;
    },

    async resetPassword(token: string, newPass: string) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Find user manually for now because repo doesn't have a specific method
        const { UserModel } = require('./repos/user.model');
        const user = await UserModel.findOne({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) throw new AppError('Token không hợp lệ hoặc đã hết hạn', 400, 'INVALID_TOKEN');

        const passwordHash = await security.hashPassword(newPass);
        
        user.passwordHash = passwordHash;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return true;
    },

    async setupInitialAdmin(email: string, password: string, name: string) {
        const existing = await userRepo.findByEmail(email);
        if (existing) throw new AppError('Tài khoản đã tồn tại', 400, 'ALREADY_EXISTS');
        
        const passwordHash = await security.hashPassword(password);
        const admin = await userRepo.createUser({
            email, passwordHash, name, role: 'admin',
        });
        
        return { id: admin._id, email: admin.email, name: admin.name, role: admin.role };
    },

    async updateProfile(userId: string, data: { name: string; avatarUrl?: string }) {
        const user = await userRepo.findById(userId);
        if (!user) {
            throw new AppError('Người dùng không tồn tại', 404, 'NOT_FOUND');
        }

        const updateData: any = { name: data.name };
        if (data.avatarUrl !== undefined) {
            updateData.avatarUrl = data.avatarUrl;
        }

        const updatedUser = await userRepo.updateUser(userId, updateData);
        return {
            id: updatedUser?._id,
            email: updatedUser?.email,
            name: updatedUser?.name,
            avatarUrl: updatedUser?.avatarUrl,
            role: updatedUser?.role
        };
    }
};
