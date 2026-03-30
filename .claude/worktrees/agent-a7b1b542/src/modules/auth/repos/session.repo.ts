import { SessionModel, ISession } from './session.model';

export const sessionRepo = {
    async createSession(data: Partial<ISession>): Promise<ISession> {
        return SessionModel.create(data);
    },

    async findByToken(refreshToken: string): Promise<ISession | null> {
        return SessionModel.findOne({ refreshToken }).exec();
    },

    async revokeToken(refreshToken: string): Promise<void> {
        await SessionModel.updateOne(
            { refreshToken },
            { $set: { revokedAt: new Date() } }
        ).exec();
    },

    async revokeAllOtherSessions(userId: string, currentRefreshToken: string): Promise<void> {
        await SessionModel.updateMany(
            { 
                userId, 
                refreshToken: { $ne: currentRefreshToken },
                revokedAt: { $exists: false }
            },
            { $set: { revokedAt: new Date() } }
        ).exec();
    },
    
    async getActiveSessions(userId: string): Promise<ISession[]> {
        return SessionModel.find({
            userId,
            revokedAt: { $exists: false },
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 }).select('-refreshToken').exec();
    }
};
