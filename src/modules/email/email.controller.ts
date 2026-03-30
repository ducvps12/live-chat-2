import { Request, Response } from 'express';
import prisma from '../../infra/prisma';
import expressAsyncHandler from 'express-async-handler';

export const emailController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accounts = await prisma.emailAccount.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
        });
        // Mask passwords in smtp/imap JSON
        const masked = accounts.map(a => {
            const result = { ...a } as any;
            if (result.smtp && typeof result.smtp === 'object') result.smtp = { ...result.smtp, password: '***' };
            if (result.imap && typeof result.imap === 'object') result.imap = { ...result.imap, password: '***' };
            return result;
        });
        res.json({ success: true, data: masked });
    }),

    getById: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        const result = { ...account } as any;
        if (result.smtp && typeof result.smtp === 'object') result.smtp = { ...result.smtp, password: '***' };
        if (result.imap && typeof result.imap === 'object') result.imap = { ...result.imap, password: '***' };
        res.json({ success: true, data: result });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const { email, displayName, smtp, imap, allowReceive, allowSend, ticketType } = req.body;

        if (!email?.trim()) { res.status(400).json({ success: false, message: 'Cần nhập email' }); return; }

        const account = await prisma.emailAccount.create({
            data: {
                workspaceId,
                email: email.trim(),
                displayName: displayName || '',
                smtp: smtp || {},
                imap: imap || {},
                allowReceive: allowReceive !== false,
                allowSend: allowSend !== false,
                ticketType: ticketType || 'support',
                createdById: userId,
            },
        });

        const result = { ...account } as any;
        if (result.smtp && typeof result.smtp === 'object') result.smtp = { ...result.smtp, password: '***' };
        if (result.imap && typeof result.imap === 'object') result.imap = { ...result.imap, password: '***' };
        res.status(201).json({ success: true, data: result });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }

        const { displayName, smtp, imap, isActive, allowReceive, allowSend, ticketType } = req.body;
        const data: any = {};
        if (displayName !== undefined) data.displayName = displayName;
        if (smtp !== undefined) {
            const current = (account.smtp as any) || {};
            data.smtp = { ...current, ...smtp };
        }
        if (imap !== undefined) {
            const current = (account.imap as any) || {};
            data.imap = { ...current, ...imap };
        }
        if (isActive !== undefined) data.isActive = isActive;
        if (allowReceive !== undefined) data.allowReceive = allowReceive;
        if (allowSend !== undefined) data.allowSend = allowSend;
        if (ticketType !== undefined) data.ticketType = ticketType;

        const updated = await prisma.emailAccount.update({ where: { id: accountId }, data });
        const result = { ...updated } as any;
        if (result.smtp && typeof result.smtp === 'object') result.smtp = { ...result.smtp, password: '***' };
        if (result.imap && typeof result.imap === 'object') result.imap = { ...result.imap, password: '***' };
        res.json({ success: true, data: result });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        await prisma.emailAccount.delete({ where: { id: accountId } });
        res.json({ success: true, message: 'Đã xóa email account' });
    }),
};
