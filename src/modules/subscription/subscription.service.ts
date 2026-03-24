import mongoose from 'mongoose';
import { SubscriptionModel, InvoiceModel, ISubscription, IInvoice, PLAN_TIERS, PlanTier } from './subscription.model';

export class SubscriptionService {

    /**
     * Lấy tất cả plan tiers
     */
    getPlans(): PlanTier[] {
        return PLAN_TIERS;
    }

    /**
     * Lấy subscription hiện tại của workspace (auto-create trial nếu chưa có)
     */
    async getSubscription(workspaceId: string): Promise<ISubscription> {
        let sub = await SubscriptionModel.findOne({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
        }).lean().exec();

        if (!sub) {
            // Auto-create trial subscription (30 ngày)
            const now = new Date();
            const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            sub = await SubscriptionModel.create({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                planId: 'trial',
                status: 'active',
                currentPeriodStart: now,
                currentPeriodEnd: trialEnd,
                trialEndsAt: trialEnd,
                billingCycle: 'monthly',
            });
            sub = sub.toObject();
        }

        // Auto-expire if past period end
        if (sub && sub.status === 'active' && new Date(sub.currentPeriodEnd) < new Date()) {
            await SubscriptionModel.updateOne(
                { _id: sub._id },
                { $set: { status: 'expired' } }
            );
            sub.status = 'expired';
        }

        return sub as ISubscription;
    }

    /**
     * Nâng cấp/thay đổi plan
     */
    async changePlan(workspaceId: string, planId: string, billingCycle: 'monthly' | 'yearly' = 'monthly'): Promise<ISubscription> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        if (!plan) throw new Error('Plan không tồn tại');
        if (plan.price < 0) throw new Error('Vui lòng liên hệ sales cho gói Enterprise');

        const now = new Date();
        const periodEnd = billingCycle === 'yearly'
            ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const sub = await SubscriptionModel.findOneAndUpdate(
            { workspaceId: new mongoose.Types.ObjectId(workspaceId) },
            {
                $set: {
                    planId,
                    status: 'active',
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    billingCycle,
                    cancelledAt: null,
                },
            },
            { upsert: true, new: true, lean: true }
        ).exec();

        // Create invoice
        const amount = billingCycle === 'yearly' ? plan.priceYearly : plan.price;
        if (amount > 0) {
            await this.createInvoice(workspaceId, planId, amount, billingCycle);
        }

        return sub as ISubscription;
    }

    /**
     * Huỷ subscription
     */
    async cancelSubscription(workspaceId: string): Promise<ISubscription> {
        const sub = await SubscriptionModel.findOneAndUpdate(
            { workspaceId: new mongoose.Types.ObjectId(workspaceId) },
            { $set: { status: 'cancelled', cancelledAt: new Date() } },
            { new: true, lean: true }
        ).exec();

        if (!sub) throw new Error('Subscription không tồn tại');
        return sub as ISubscription;
    }

    /**
     * Tạo hoá đơn
     */
    private async createInvoice(
        workspaceId: string,
        planId: string,
        amount: number,
        billingCycle: 'monthly' | 'yearly'
    ): Promise<IInvoice> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        return InvoiceModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            invoiceNumber,
            planId,
            amount,
            currency: 'VND',
            status: 'pending',
            billingCycle,
            description: `Gói ${plan?.nameVi || planId} — ${billingCycle === 'yearly' ? 'Năm' : 'Tháng'}`,
        });
    }

    /**
     * Lấy danh sách hoá đơn
     */
    async getInvoices(workspaceId: string, page = 1, limit = 20): Promise<{ items: IInvoice[]; total: number }> {
        const wsId = new mongoose.Types.ObjectId(workspaceId);
        const [items, total] = await Promise.all([
            InvoiceModel.find({ workspaceId: wsId })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
                .exec(),
            InvoiceModel.countDocuments({ workspaceId: wsId }).exec(),
        ]);

        return { items: items as IInvoice[], total };
    }

    /**
     * Simulate payment (for demo — replace with real gateway later)
     */
    async simulatePayment(invoiceId: string): Promise<IInvoice> {
        const invoice = await InvoiceModel.findByIdAndUpdate(
            invoiceId,
            {
                $set: {
                    status: 'paid',
                    paidAt: new Date(),
                    paymentMethod: 'demo',
                    paymentReference: `PAY-${Date.now()}`,
                },
            },
            { new: true, lean: true }
        ).exec();

        if (!invoice) throw new Error('Invoice không tồn tại');
        return invoice as IInvoice;
    }
}

export const subscriptionService = new SubscriptionService();
