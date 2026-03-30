import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const security = {
    async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    },

    async comparePassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    },

    generateToken(payload: object): string {
        return jwt.sign(payload, env.JWT_SECRET, {
            expiresIn: env.JWT_EXPIRES_IN as any,
        });
    },

    verifyToken(token: string): any {
        return jwt.verify(token, env.JWT_SECRET);
    },

    /**
     * Visitor token — lightweight, 30-day expiry.
     * Payload: { visitorId, widgetId, type: 'visitor' }
     */
    generateVisitorToken(visitorId: string, widgetId: string): string {
        return jwt.sign(
            { visitorId, widgetId, type: 'visitor' },
            env.JWT_SECRET,
            { expiresIn: '30d' }
        );
    },

    verifyVisitorToken(token: string): { visitorId: string; widgetId: string; type: 'visitor' } | null {
        try {
            const decoded = jwt.verify(token, env.JWT_SECRET) as any;
            if (decoded.type !== 'visitor') return null;
            return decoded;
        } catch {
            return null;
        }
    },
};
