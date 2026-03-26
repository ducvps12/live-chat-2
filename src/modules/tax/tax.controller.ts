import { Request, Response } from 'express';
import { TaxModel } from './repos/tax.model';
import mongoose from 'mongoose';
import expressAsyncHandler from 'express-async-handler';

export const taxController = {
    list: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxes = await TaxModel
            .find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, data: taxes });
    }),

    create: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const userId = (req as any).user?.id;
        const { name, rate, locale } = req.body;

        if (!name?.trim()) { res.status(400).json({ success: false, message: 'Cần nhập tên thuế' }); return; }
        if (rate == null || rate < 0 || rate > 100) { res.status(400).json({ success: false, message: 'Thuế suất phải từ 0 đến 100' }); return; }

        const tax = await TaxModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            name: name.trim(),
            rate,
            locale: locale || 'vi-VN',
            createdBy: new mongoose.Types.ObjectId(userId),
        });
        res.status(201).json({ success: true, data: tax });
    }),

    update: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxId = req.params.taxId as string;
        const tax = await TaxModel.findById(taxId);
        if (!tax) { res.status(404).json({ success: false, message: 'Thuế không tồn tại' }); return; }
        if (tax.workspaceId.toString() !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }

        const { name, rate, locale, isActive } = req.body;
        if (name !== undefined) tax.name = name.trim();
        if (rate !== undefined) tax.rate = rate;
        if (locale !== undefined) tax.locale = locale;
        if (isActive !== undefined) tax.isActive = isActive;
        await tax.save();
        res.json({ success: true, data: tax });
    }),

    remove: expressAsyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const taxId = req.params.taxId as string;
        const tax = await TaxModel.findById(taxId);
        if (!tax) { res.status(404).json({ success: false, message: 'Thuế không tồn tại' }); return; }
        if (tax.workspaceId.toString() !== workspaceId) { res.status(403).json({ success: false, message: 'Không có quyền' }); return; }
        await TaxModel.findByIdAndDelete(taxId);
        res.json({ success: true, message: 'Đã xóa thuế' });
    }),
};
