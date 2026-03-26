import { Request, Response } from 'express';
import { EmailAccountModel } from './repos/emailAccount.model';
import mongoose from 'mongoose';
import expressAsyncHandler from 'express-async-handler';

export const emailController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accounts = await EmailAccountModel
            .find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) })
            .select('-smtp.password -imap.password')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, data: accounts });
    }),

    getById: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await EmailAccountModel.findById(accountId)
            .select('-smtp.password -imap.password')
            .lean();
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId.toString() !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        res.json({ success: true, data: account });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const { email, displayName, smtp, imap, allowReceive, allowSend, ticketType } = req.body;

        if (!email?.trim()) { res.status(400).json({ success: false, message: 'Cần nhập email' }); return; }

        const account = await EmailAccountModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            email: email.trim(),
            displayName: displayName || '',
            smtp: smtp || {},
            imap: imap || {},
            allowReceive: allowReceive !== false,
            allowSend: allowSend !== false,
            ticketType: ticketType || 'support',
            createdBy: new mongoose.Types.ObjectId(userId),
        });

        // Return without passwords
        const result = account.toObject();
        if (result.smtp) result.smtp.password = '***';
        if (result.imap) result.imap.password = '***';
        res.status(201).json({ success: true, data: result });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await EmailAccountModel.findById(accountId);
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId.toString() !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }

        const { displayName, smtp, imap, isActive, allowReceive, allowSend, ticketType } = req.body;
        if (displayName !== undefined) account.displayName = displayName;
        if (smtp !== undefined) account.smtp = { ...account.smtp, ...smtp };
        if (imap !== undefined) account.imap = { ...account.imap, ...imap };
        if (isActive !== undefined) account.isActive = isActive;
        if (allowReceive !== undefined) account.allowReceive = allowReceive;
        if (allowSend !== undefined) account.allowSend = allowSend;
        if (ticketType !== undefined) account.ticketType = ticketType;

        await account.save();

        const result = account.toObject();
        if (result.smtp) result.smtp.password = '***';
        if (result.imap) result.imap.password = '***';
        res.json({ success: true, data: result });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const accountId = req.params.accountId as string;
        const account = await EmailAccountModel.findById(accountId);
        if (!account) { res.status(404).json({ success: false, message: 'Email account không tồn tại' }); return; }
        if (account.workspaceId.toString() !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        await EmailAccountModel.findByIdAndDelete(accountId);
        res.json({ success: true, message: 'Đã xóa email account' });
    }),
};
