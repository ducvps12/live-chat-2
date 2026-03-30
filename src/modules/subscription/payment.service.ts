import axios from 'axios';
import { env } from '../../config/env';
import prisma from '../../infra/prisma';
import type { Invoice } from '@prisma/client';
import { PLAN_TIERS } from './subscription.service';

// ── ACB Transaction from sieuthicode API ──
interface ACBTransaction {
    amount: number;
    description: string;
    postingDate: number;
    type: 'IN' | 'OUT';
    accountName?: string;
    senderName?: string;
    receiverName?: string;
}

interface ACBApiResponse {
    messageStatus: string;
    data: ACBTransaction[];
}

// ── Cache ──
let cachedTransactions: ACBTransaction[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000;

export class PaymentService {
    async fetchACBTransactions(): Promise<ACBTransaction[]> {
        const now = Date.now();
        if (cachedTransactions.length > 0 && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return cachedTransactions;
        }
        try {
            const url = `${env.ACB_API_URL}/${env.ACB_API_TOKEN}`;
            const response = await axios.get<ACBApiResponse>(url, { timeout: 10000 });
            if (response.data?.messageStatus === 'success' && Array.isArray(response.data.data)) {
                cachedTransactions = response.data.data;
                cacheTimestamp = now;
                return cachedTransactions;
            }
            console.warn('[PaymentService] API returned unexpected format:', response.data?.messageStatus);
            return cachedTransactions;
        } catch (error: any) {
            console.error('[PaymentService] Failed to fetch ACB transactions:', error.message);
            return cachedTransactions;
        }
    }

    findMatchingTransaction(transactions: ACBTransaction[], transferContent: string, amount: number): ACBTransaction | null {
        const normalizedContent = transferContent.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (const tx of transactions) {
            if (tx.type !== 'IN') continue;
            if (tx.amount !== amount) continue;
            const normalizedDesc = (tx.description || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (normalizedDesc.includes(normalizedContent)) return tx;
        }
        return null;
    }

    generateTransferContent(invoiceNumber: string): string {
        return invoiceNumber.replace(/[^A-Z0-9]/gi, '');
    }

    async getPaymentInfo(invoiceId: string) {
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return null;
        const transferContent = this.generateTransferContent(invoice.invoiceNumber);
        return {
            bankName: 'ACB - Ngân hàng Á Châu',
            accountNumber: env.ACB_ACCOUNT_NUMBER,
            accountName: env.ACB_ACCOUNT_NAME,
            amount: invoice.amount,
            transferContent,
            invoiceNumber: invoice.invoiceNumber,
            currency: invoice.currency || 'VND',
        };
    }

    async checkPayment(invoiceId: string): Promise<{ found: boolean; invoice: Invoice | null; transaction?: ACBTransaction }> {
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return { found: false, invoice: null };
        if (invoice.status === 'paid') return { found: true, invoice };

        const transferContent = this.generateTransferContent(invoice.invoiceNumber);
        const transactions = await this.fetchACBTransactions();
        const match = this.findMatchingTransaction(transactions, transferContent, invoice.amount);

        if (match) {
            const updatedInvoice = await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    status: 'paid',
                    paidAt: new Date(match.postingDate || Date.now()),
                    paymentMethod: 'bank_transfer',
                    paymentReference: `ACB-${match.postingDate}-${match.amount}`,
                },
            });

            await this.activateSubscription(updatedInvoice.workspaceId, updatedInvoice.planId, updatedInvoice.billingCycle as any);
            return { found: true, invoice: updatedInvoice, transaction: match };
        }

        return { found: false, invoice };
    }

    private async activateSubscription(workspaceId: string, planId: string, billingCycle: 'monthly' | 'yearly'): Promise<void> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        if (!plan) return;

        const now = new Date();
        const periodEnd = billingCycle === 'yearly'
            ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await prisma.subscription.upsert({
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

        console.log(`[PaymentService] Subscription activated: workspace=${workspaceId}, plan=${planId}, until=${periodEnd.toISOString()}`);
    }
}

export const paymentService = new PaymentService();
