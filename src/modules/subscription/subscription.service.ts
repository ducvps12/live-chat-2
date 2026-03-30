import prisma from '../../infra/prisma';
import type { Subscription, Invoice } from '@prisma/client';
import { paymentService } from './payment.service';

export interface PlanTier {
    id: string;
    name: string;
    nameVi: string;
    price: number;
    priceYearly: number;
    features: string[];
}

export const PLAN_TIERS: PlanTier[] = [
    { id: 'trial', name: 'Trial', nameVi: 'Dùng thử', price: 0, priceYearly: 0, features: ['30 ngày dùng thử', '1 agent', '100 conversations/tháng'] },
    { id: 'starter', name: 'Starter', nameVi: 'Khởi đầu', price: 299000, priceYearly: 2990000, features: ['3 agents', '500 conversations/tháng', 'Widget tùy chỉnh'] },
    { id: 'pro', name: 'Professional', nameVi: 'Chuyên nghiệp', price: 799000, priceYearly: 7990000, features: ['10 agents', 'Unlimited conversations', 'Chatbot AI', 'Analytics'] },
    { id: 'enterprise', name: 'Enterprise', nameVi: 'Doanh nghiệp', price: -1, priceYearly: -1, features: ['Unlimited agents', 'Custom integrations', 'SLA support', 'On-premise option'] },
];

export class SubscriptionService {
    getPlans(): PlanTier[] {
        return PLAN_TIERS;
    }

    async getSubscription(workspaceId: string): Promise<Subscription> {
        let sub = await prisma.subscription.findUnique({ where: { workspaceId } });

        if (!sub) {
            const now = new Date();
            const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            sub = await prisma.subscription.create({
                data: {
                    workspaceId,
                    planId: 'trial',
                    status: 'active',
                    currentPeriodStart: now,
                    currentPeriodEnd: trialEnd,
                    trialEndsAt: trialEnd,
                    billingCycle: 'monthly',
                },
            });
        }

        if (sub.status === 'active' && new Date(sub.currentPeriodEnd) < new Date()) {
            await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'expired' } });
            sub.status = 'expired';
        }

        return sub;
    }

    async changePlan(workspaceId: string, planId: string, billingCycle: 'monthly' | 'yearly' = 'monthly'): Promise<{ subscription: Subscription; invoice?: Invoice }> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        if (!plan) throw new Error('Plan không tồn tại');
        if (plan.price < 0) throw new Error('Vui lòng liên hệ sales cho gói Enterprise');

        if (plan.price === 0) {
            const now = new Date();
            const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const sub = await prisma.subscription.upsert({
                where: { workspaceId },
                create: {
                    workspaceId, planId, status: 'active',
                    currentPeriodStart: now, currentPeriodEnd: periodEnd, billingCycle,
                },
                update: {
                    planId, status: 'active',
                    currentPeriodStart: now, currentPeriodEnd: periodEnd, billingCycle, cancelledAt: null,
                },
            });
            return { subscription: sub };
        }

        const amount = billingCycle === 'yearly' ? plan.priceYearly : plan.price;
        const invoice = await this.createInvoice(workspaceId, planId, amount, billingCycle);
        const currentSub = await this.getSubscription(workspaceId);
        return { subscription: currentSub, invoice };
    }

    async cancelSubscription(workspaceId: string): Promise<Subscription> {
        const sub = await prisma.subscription.update({
            where: { workspaceId },
            data: { status: 'cancelled', cancelledAt: new Date() },
        });
        if (!sub) throw new Error('Subscription không tồn tại');
        return sub;
    }

    async createInvoice(
        workspaceId: string, planId: string, amount: number, billingCycle: 'monthly' | 'yearly'
    ): Promise<Invoice> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        const invoiceNumber = `INV-${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        return prisma.invoice.create({
            data: {
                workspaceId, invoiceNumber, planId, amount,
                currency: 'VND', status: 'pending', billingCycle,
                description: `Gói ${plan?.nameVi || planId} — ${billingCycle === 'yearly' ? 'Năm' : 'Tháng'}`,
            },
        });
    }

    async getInvoices(workspaceId: string, page = 1, limit = 20): Promise<{ items: Invoice[]; total: number }> {
        const [items, total] = await Promise.all([
            prisma.invoice.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.invoice.count({ where: { workspaceId } }),
        ]);
        return { items, total };
    }

    async verifyPayment(invoiceId: string): Promise<Invoice> {
        const result = await paymentService.checkPayment(invoiceId);
        if (!result.invoice) throw new Error('Invoice không tồn tại');
        return result.invoice;
    }

    async getPaymentInfo(invoiceId: string) {
        return paymentService.getPaymentInfo(invoiceId);
    }

    async checkPaymentStatus(invoiceId: string) {
        return paymentService.checkPayment(invoiceId);
    }
}

export const subscriptionService = new SubscriptionService();
