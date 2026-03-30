import { externalSessionRepo } from './repos/externalSession.repo';
import { browserPool } from '../../infra/browserPool';
import { detectLoginState } from '../../infra/sessionStream';
import { AppError } from '../../middlewares/errorHandler';

export const externalSessionService = {
    /**
     * Create a new remote browser session.
     */
    createSession: async (workspaceId: string, userId: string, label: string) => {
        // Check pool capacity
        if (browserPool.size >= browserPool.maxSize) {
            throw new AppError(
                `Đã đạt giới hạn ${browserPool.maxSize} phiên đồng thời. Hãy đóng phiên cũ.`,
                429, 'POOL_FULL'
            );
        }

        const browserProfileId = `${workspaceId}_${Date.now()}`;

        // Create DB record
        const session = await externalSessionRepo.create({
            workspaceId: workspaceId as any,
            provider: 'zalo',
            label,
            status: 'pending_login',
            createdBy: userId as any,
            browserProfileId,
        });

        // Launch browser
        try {
            await browserPool.create(session._id.toString());
        } catch (err: any) {
            // Cleanup DB if browser launch fails
            await externalSessionRepo.updateStatus(session._id.toString(), 'disconnected');
            throw new AppError('Không thể khởi chạy trình duyệt: ' + err.message, 500, 'BROWSER_LAUNCH_FAILED');
        }

        // Audit log
        await externalSessionRepo.logAudit({
            sessionId: session._id.toString(),
            workspaceId,
            userId,
            action: 'session_created',
        });

        return session;
    },

    /**
     * Get all sessions for a workspace.
     */
    getSessionsForWorkspace: async (workspaceId: string) => {
        const sessions = await externalSessionRepo.findByWorkspace(workspaceId);

        // Enrich with browser alive status
        return sessions.map(s => {
            const doc = s.toObject();
            return {
                ...doc,
                browserAlive: browserPool.isAlive(s._id.toString()),
            };
        });
    },

    /**
     * Get session detail.
     */
    getSession: async (sessionId: string) => {
        const session = await externalSessionRepo.findById(sessionId);
        if (!session) throw new AppError('Phiên không tồn tại', 404, 'SESSION_NOT_FOUND');
        return {
            ...session.toObject(),
            browserAlive: browserPool.isAlive(sessionId),
        };
    },

    /**
     * Take control of a session.
     */
    takeControl: async (sessionId: string, userId: string, workspaceId: string) => {
        const session = await externalSessionRepo.findActive(sessionId);
        if (!session) throw new AppError('Phiên không tồn tại hoặc đã bị thu hồi', 404, 'SESSION_NOT_FOUND');

        await externalSessionRepo.setController(sessionId, userId);
        await externalSessionRepo.logAudit({
            sessionId,
            workspaceId,
            userId,
            action: 'control_taken',
        });

        return externalSessionRepo.findById(sessionId);
    },

    /**
     * Release control.
     */
    releaseControl: async (sessionId: string, userId: string, workspaceId: string) => {
        const session = await externalSessionRepo.findById(sessionId);
        if (!session) throw new AppError('Phiên không tồn tại', 404, 'SESSION_NOT_FOUND');

        // Only current controller or admin can release
        if (session.controlledBy?.toString() !== userId) {
            throw new AppError('Bạn không phải người đang điều khiển', 403, 'NOT_CONTROLLER');
        }

        await externalSessionRepo.setController(sessionId, null);
        await externalSessionRepo.logAudit({
            sessionId,
            workspaceId,
            userId,
            action: 'control_released',
        });

        return externalSessionRepo.findById(sessionId);
    },

    /**
     * Check login state of a session's browser.
     */
    checkLoginState: async (sessionId: string) => {
        const instance = browserPool.get(sessionId);
        if (!instance) return 'unknown';
        return detectLoginState(instance.page);
    },

    /**
     * Mark session as connected (after QR login detected).
     */
    markConnected: async (sessionId: string, userId: string, workspaceId: string) => {
        await externalSessionRepo.updateStatus(sessionId, 'connected', {
            connectedAt: new Date(),
        });
        await externalSessionRepo.logAudit({
            sessionId,
            workspaceId,
            userId,
            action: 'login_success',
        });
        return externalSessionRepo.findById(sessionId);
    },

    /**
     * Reconnect a disconnected/expired session (reuse profile).
     */
    reconnectSession: async (sessionId: string, userId: string, workspaceId: string) => {
        const session = await externalSessionRepo.findById(sessionId);
        if (!session) throw new AppError('Phiên không tồn tại', 404, 'SESSION_NOT_FOUND');

        // Skip destroy+create if browser is already alive and running
        if (browserPool.isAlive(sessionId)) {
            console.log(`[Reconnect] Browser already alive for ${sessionId}, skipping relaunch`);
            await externalSessionRepo.updateStatus(sessionId, 'pending_login');
            return externalSessionRepo.findById(sessionId);
        }

        // Destroy existing browser if any (crashed/stopped)
        await browserPool.destroy(sessionId);

        // Relaunch with same profile
        try {
            await browserPool.create(sessionId);
        } catch (err: any) {
            throw new AppError('Không thể kết nối lại: ' + err.message, 500, 'RECONNECT_FAILED');
        }

        await externalSessionRepo.updateStatus(sessionId, 'pending_login');
        await externalSessionRepo.logAudit({
            sessionId,
            workspaceId,
            userId,
            action: 'session_reconnected',
        });

        return externalSessionRepo.findById(sessionId);
    },

    /**
     * Revoke/delete a session permanently.
     */
    revokeSession: async (sessionId: string, userId: string, workspaceId: string) => {
        // Kill browser
        await browserPool.destroy(sessionId);

        // Update DB
        await externalSessionRepo.updateStatus(sessionId, 'revoked');
        await externalSessionRepo.clearViewers(sessionId);
        await externalSessionRepo.setController(sessionId, null);

        await externalSessionRepo.logAudit({
            sessionId,
            workspaceId,
            userId,
            action: 'session_revoked',
        });

        // Optionally delete profile
        browserPool.deleteProfile(sessionId);

        return externalSessionRepo.findById(sessionId);
    },

    /**
     * Get audit log for a session.
     */
    getAuditLog: async (sessionId: string) => {
        return externalSessionRepo.getAuditLog(sessionId);
    },
};
