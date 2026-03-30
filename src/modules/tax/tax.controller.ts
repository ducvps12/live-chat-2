import { Request, Response } from 'express';
import prisma from '../../infra/prisma';
import expressAsyncHandler from 'express-async-handler';

export const taxController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxes = await prisma.tax.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: taxes });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const { name, rate, locale } = req.body;

        if (!name?.trim()) { res.status(400).json({ success: false, message: 'Cần nhập tên thuế' }); return; }
        if (rate == null || rate < 0 || rate > 100) { res.status(400).json({ success: false, message: 'Thuế suất phải từ 0 đến 100' }); return; }

        const tax = await prisma.tax.create({
            data: {
                workspaceId,
                name: name.trim(),
                rate,
                locale: locale || 'vi-VN',
                createdById: userId,
            },
        });
        res.status(201).json({ success: true, data: tax });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxId = req.params.taxId as string;
        const tax = await prisma.tax.findUnique({ where: { id: taxId } });
        if (!tax) { res.status(404).json({ success: false, message: 'Thuế không tồn tại' }); return; }
        if (tax.workspaceId !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }

        const { name, rate, locale, isActive } = req.body;
        const data: any = {};
        if (name !== undefined) data.name = name.trim();
        if (rate !== undefined) data.rate = rate;
        if (locale !== undefined) data.locale = locale;
        if (isActive !== undefined) data.isActive = isActive;

        const updated = await prisma.tax.update({ where: { id: taxId }, data });
        res.json({ success: true, data: updated });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxId = req.params.taxId as string;
        const tax = await prisma.tax.findUnique({ where: { id: taxId } });
        if (!tax) { res.status(404).json({ success: false, message: 'Thuế không tồn tại' }); return; }
        if (tax.workspaceId !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        await prisma.tax.delete({ where: { id: taxId } });
        res.json({ success: true, message: 'Đã xóa thuế' });
    }),
};
