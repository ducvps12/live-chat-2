import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { subscriptionService } from './subscription.service';

export const subscriptionController = {
    /**
     * Lấy tất cả plan tiers (public, không cần auth)
     */
    getPlans: asyncHandler(async (_req: Request, res: Response) => {
        const plans = subscriptionService.getPlans();
        res.json({ success: true, data: plans });
    }),

    /**
     * Lấy subscription hiện tại của workspace
     */
    getSubscription: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const sub = await subscriptionService.getSubscription(workspaceId);
        const plans = subscriptionService.getPlans();
        const currentPlan = plans.find(p => p.id === sub.planId);

        res.json({
            success: true,
            data: { subscription: sub, plan: currentPlan }
        });
    }),

    /**
     * Nâng cấp / thay đổi plan — tạo invoice pending
     */
    changePlan: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { planId, billingCycle } = req.body;

        if (!planId) {
            res.status(400).json({ success: false, error: 'Thiếu planId' });
            return;
        }

        const result = await subscriptionService.changePlan(workspaceId, planId, billingCycle);
        res.json({
            success: true,
            data: result,
            message: result.invoice
                ? `Đã tạo hoá đơn cho gói ${planId}. Vui lòng thanh toán.`
                : `Đã chuyển sang gói ${planId}`,
        });
    }),

    /**
     * Huỷ subscription
     */
    cancelSubscription: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const sub = await subscriptionService.cancelSubscription(workspaceId);
        res.json({ success: true, data: sub, message: 'Đã huỷ subscription' });
    }),

    /**
     * Lấy danh sách hoá đơn
     */
    getInvoices: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await subscriptionService.getInvoices(workspaceId, page, limit);
        res.json({ success: true, data: result });
    }),

    /**
     * Lấy thông tin thanh toán (bank account, nội dung CK) cho 1 invoice
     */
    getPaymentInfo: asyncHandler(async (req: Request, res: Response) => {
        const invoiceId = req.params.invoiceId as string;
        const info = await subscriptionService.getPaymentInfo(invoiceId);

        if (!info) {
            res.status(404).json({ success: false, error: 'Invoice không tồn tại' });
            return;
        }

        res.json({ success: true, data: info });
    }),

    /**
     * Kiểm tra trạng thái thanh toán (polling endpoint)
     */
    checkPaymentStatus: asyncHandler(async (req: Request, res: Response) => {
        const invoiceId = req.params.invoiceId as string;
        const result = await subscriptionService.checkPaymentStatus(invoiceId);

        res.json({
            success: true,
            data: {
                found: result.found,
                invoice: result.invoice,
                message: result.found
                    ? 'Thanh toán đã được xác nhận!'
                    : 'Chưa nhận được thanh toán. Vui lòng chờ...',
            },
        });
    }),

    /**
     * [Legacy] Pay invoice — now delegates to real verification
     */
    payInvoice: asyncHandler(async (req: Request, res: Response) => {
        const invoiceId = req.params.invoiceId as string;
        const invoice = await subscriptionService.verifyPayment(invoiceId);
        res.json({ success: true, data: invoice, message: 'Thanh toán thành công' });
    }),
};
