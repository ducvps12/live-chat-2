import axios from 'axios';
import { env } from '../../config/env';
import { InvoiceModel, IInvoice, SubscriptionModel, PLAN_TIERS } from './subscription.model';
import mongoose from 'mongoose';

// ── ACB Transaction from sieuthicode API ──
interface ACBTransaction {
    amount: number;
    description: string;
    postingDate: number;      // epoch ms
    type: 'IN' | 'OUT';
    accountName?: string;
    senderName?: string;
    receiverName?: string;
}

interface ACBApiResponse {
    messageStatus: string;
    data: ACBTransaction[];
}

// ── Cache to avoid hammering the API ──
let cachedTransactions: ACBTransaction[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

export class PaymentService {

    /**
     * Fetch transaction history from ACB via sieuthicode API
     */
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
            return cachedTransactions; // return stale cache if API returns bad data
        } catch (error: any) {
            console.error('[PaymentService] Failed to fetch ACB transactions:', error.message);
            return cachedTransactions; // return stale cache on error
        }
    }

    /**
     * Find a matching incoming transaction for a specific invoice
     * Match criteria: type=IN, amount matches, description contains transfer content
     */
    findMatchingTransaction(
        transactions: ACBTransaction[],
        transferContent: string,
        amount: number
    ): ACBTransaction | null {
        const normalizedContent = transferContent.toUpperCase().replace(/[^A-Z0-9]/g, '');

        for (const tx of transactions) {
            if (tx.type !== 'IN') continue;
            if (tx.amount !== amount) continue;

            // Normalize the description for comparison
            const normalizedDesc = (tx.description || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

            if (normalizedDesc.includes(normalizedContent)) {
                return tx;
            }
        }

        return null;
    }

    /**
     * Generate transfer content (nội dung chuyển khoản) from invoice number
     * Keep it short and unique for easy matching
     */
    generateTransferContent(invoiceNumber: string): string {
        // Extract the unique part: INV-1711904400000-ABCD → ABCD
        // Use full invoice number but clean it for bank transfer compatibility
        return invoiceNumber.replace(/[^A-Z0-9]/gi, '');
    }

    /**
     * Get payment information for an invoice (bank details + transfer content)
     */
    async getPaymentInfo(invoiceId: string): Promise<{
        bankName: string;
        accountNumber: string;
        accountName: string;
        amount: number;
        transferContent: string;
        invoiceNumber: string;
        currency: string;
    } | null> {
        const invoice = await InvoiceModel.findById(invoiceId).lean().exec();
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

    /**
     * Check if payment has been received for an invoice
     * Returns: { found: boolean, transaction?: ACBTransaction }
     */
    async checkPayment(invoiceId: string): Promise<{
        found: boolean;
        invoice: IInvoice | null;
        transaction?: ACBTransaction;
    }> {
        const invoice = await InvoiceModel.findById(invoiceId).lean().exec() as IInvoice | null;
        if (!invoice) return { found: false, invoice: null };

        // Already paid?
        if (invoice.status === 'paid') {
            return { found: true, invoice };
        }

        const transferContent = this.generateTransferContent(invoice.invoiceNumber);
        const transactions = await this.fetchACBTransactions();
        const match = this.findMatchingTransaction(transactions, transferContent, invoice.amount);

        if (match) {
            // ── Mark invoice as paid ──
            const updatedInvoice = await InvoiceModel.findByIdAndUpdate(
                invoiceId,
                {
                    $set: {
                        status: 'paid',
                        paidAt: new Date(match.postingDate || Date.now()),
                        paymentMethod: 'bank_transfer',
                        paymentReference: `ACB-${match.postingDate}-${match.amount}`,
                    },
                },
                { new: true, lean: true }
            ).exec() as IInvoice | null;

            // ── Extend subscription period ──
            if (updatedInvoice) {
                await this.activateSubscription(
                    updatedInvoice.workspaceId.toString(),
                    updatedInvoice.planId,
                    updatedInvoice.billingCycle
                );
            }

            return { found: true, invoice: updatedInvoice, transaction: match };
        }

        return { found: false, invoice };
    }

    /**
     * After payment confirmed, activate/extend the subscription
     */
    private async activateSubscription(
        workspaceId: string,
        planId: string,
        billingCycle: 'monthly' | 'yearly'
    ): Promise<void> {
        const plan = PLAN_TIERS.find(p => p.id === planId);
        if (!plan) return;

        const now = new Date();
        const periodEnd = billingCycle === 'yearly'
            ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await SubscriptionModel.findOneAndUpdate(
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
            { upsert: true }
        ).exec();

        console.log(`[PaymentService] Subscription activated: workspace=${workspaceId}, plan=${planId}, until=${periodEnd.toISOString()}`);
    }
}

export const paymentService = new PaymentService();
