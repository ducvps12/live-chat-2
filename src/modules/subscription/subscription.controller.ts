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
     * Nâng cấp / thay đổi plan
     */
    changePlan: asyncHandler(async (req: Request, res: Response) => {
        const workspaceId = req.params.workspaceId as string;
        const { planId, billingCycle } = req.body;

        if (!planId) {
            res.status(400).json({ success: false, error: 'Thiếu planId' });
            return;
        }

        const sub = await subscriptionService.changePlan(workspaceId, planId, billingCycle);
        res.json({ success: true, data: sub, message: `Đã nâng cấp lên gói ${planId}` });
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
     * Simulate payment (demo)
     */
    payInvoice: asyncHandler(async (req: Request, res: Response) => {
        const invoiceId = req.params.invoiceId as string;
        const invoice = await subscriptionService.simulatePayment(invoiceId);
        res.json({ success: true, data: invoice, message: 'Thanh toán thành công' });
    }),
};
