import mongoose, { Schema, Document } from 'mongoose';

// ── Plan tiers (hardcoded, no DB needed) ──
export interface PlanTier {
    id: string;
    name: string;
    nameVi: string;
    price: number;               // VND per month (0 = free)
    priceYearly: number;         // VND per year (discount)
    maxAgents: number;
    features: string[];
    popular?: boolean;
}

export const PLAN_TIERS: PlanTier[] = [
    {
        id: 'trial',
        name: 'Trial',
        nameVi: 'Dùng thử',
        price: 0,
        priceYearly: 0,
        maxAgents: 1,
        features: [
            'Live chat widget',
            '1 agent',
            '30 ngày dùng thử',
            'Lịch sử chat 30 ngày',
        ],
    },
    {
        id: 'starter',
        name: 'Starter',
        nameVi: 'Khởi đầu',
        price: 199_000,
        priceYearly: 1_990_000,
        maxAgents: 3,
        features: [
            'Tất cả tính năng Trial',
            '3 agents',
            'Tích hợp Zalo cá nhân',
            'Tags phân loại',
            'Macros / trả lời nhanh',
            'Lịch sử chat không giới hạn',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        nameVi: 'Chuyên nghiệp',
        price: 499_000,
        priceYearly: 4_990_000,
        maxAgents: 10,
        popular: true,
        features: [
            'Tất cả tính năng Starter',
            '10 agents',
            'AI Chatbot',
            'SLA & Priority',
            'Báo cáo & thống kê',
            'Đồng bộ lịch sử Zalo',
            'Export data CSV',
        ],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        nameVi: 'Doanh nghiệp',
        price: -1,   // Contact sales
        priceYearly: -1,
        maxAgents: 999,
        features: [
            'Tất cả tính năng Pro',
            'Unlimited agents',
            'Multi-workspace',
            'API access',
            'Dedicated support',
            'Custom integrations',
            'On-premise option',
        ],
    },
];

// ── Workspace subscription (persisted to MongoDB) ──
export interface ISubscription extends Document {
    workspaceId: mongoose.Types.ObjectId;
    planId: string;
    status: 'active' | 'expired' | 'cancelled' | 'past_due';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEndsAt?: Date;
    cancelledAt?: Date;
    billingCycle: 'monthly' | 'yearly';
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
        planId: { type: String, required: true, default: 'trial' },
        status: { type: String, enum: ['active', 'expired', 'cancelled', 'past_due'], default: 'active' },
        currentPeriodStart: { type: Date, default: Date.now },
        currentPeriodEnd: { type: Date, required: true },
        trialEndsAt: { type: Date },
        cancelledAt: { type: Date },
        billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

SubscriptionSchema.index({ workspaceId: 1 }, { unique: true });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const SubscriptionModel = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

// ── Invoice model ──
export interface IInvoice extends Document {
    workspaceId: mongoose.Types.ObjectId;
    invoiceNumber: string;
    planId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    billingCycle: 'monthly' | 'yearly';
    paidAt?: Date;
    paymentMethod?: string;
    paymentReference?: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
        invoiceNumber: { type: String, required: true, unique: true },
        planId: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'VND' },
        status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
        billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
        paidAt: { type: Date },
        paymentMethod: { type: String },
        paymentReference: { type: String },
        description: { type: String, default: '' },
    },
    { timestamps: true }
);

InvoiceSchema.index({ workspaceId: 1, createdAt: -1 });
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

export const InvoiceModel = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
