import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { externalSessionService } from './externalSession.service';

export const externalSessionController = {
    // POST /:workspaceId/sessions
    create: asyncHandler(async (req: Request, res: Response) => {
        const { label } = req.body;
        const session = await externalSessionService.createSession(
            req.params.workspaceId as string,
            (req as any).user.id,
            label || 'Zalo cá nhân'
        );
        res.status(201).json({ success: true, data: session });
    }),

    // GET /:workspaceId/sessions
    list: asyncHandler(async (req: Request, res: Response) => {
        const sessions = await externalSessionService.getSessionsForWorkspace(
            req.params.workspaceId as string
        );
        res.status(200).json({ success: true, data: sessions });
    }),

    // GET /:workspaceId/sessions/:sessionId
    getOne: asyncHandler(async (req: Request, res: Response) => {
        const session = await externalSessionService.getSession(
            req.params.sessionId as string
        );
        res.status(200).json({ success: true, data: session });
    }),

    // POST /:workspaceId/sessions/:sessionId/reconnect
    reconnect: asyncHandler(async (req: Request, res: Response) => {
        const session = await externalSessionService.reconnectSession(
            req.params.sessionId as string,
            (req as any).user.id,
            req.params.workspaceId as string
        );
        res.status(200).json({ success: true, data: session });
    }),

    // POST /:workspaceId/sessions/:sessionId/control/take
    takeControl: asyncHandler(async (req: Request, res: Response) => {
        const session = await externalSessionService.takeControl(
            req.params.sessionId as string,
            (req as any).user.id,
            req.params.workspaceId as string
        );
        res.status(200).json({ success: true, data: session });
    }),

    // POST /:workspaceId/sessions/:sessionId/control/release
    releaseControl: asyncHandler(async (req: Request, res: Response) => {
        const session = await externalSessionService.releaseControl(
            req.params.sessionId as string,
            (req as any).user.id,
            req.params.workspaceId as string
        );
        res.status(200).json({ success: true, data: session });
    }),

    // DELETE /:workspaceId/sessions/:sessionId
    revoke: asyncHandler(async (req: Request, res: Response) => {
        const session = await externalSessionService.revokeSession(
            req.params.sessionId as string,
            (req as any).user.id,
            req.params.workspaceId as string
        );
        res.status(200).json({ success: true, data: session });
    }),

    // GET /:workspaceId/sessions/:sessionId/audit
    getAuditLog: asyncHandler(async (req: Request, res: Response) => {
        const logs = await externalSessionService.getAuditLog(
            req.params.sessionId as string
        );
        res.status(200).json({ success: true, data: logs });
    }),

    // GET /:workspaceId/sessions/:sessionId/login-state
    checkLoginState: asyncHandler(async (req: Request, res: Response) => {
        const state = await externalSessionService.checkLoginState(
            req.params.sessionId as string
        );
        res.status(200).json({ success: true, data: { state } });
    }),
};
