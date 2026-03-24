import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Spin, message, Tag, Table } from 'antd';
import AppLayout from '../../../components/layout/AppLayout';
import { httpClient } from '../../../lib/http/client';
import { Check, Crown, Zap, Star, Shield, CreditCard, Clock, FileText, ArrowRight, Sparkles, ChevronRight, Receipt } from 'lucide-react';

interface PlanTier {
    id: string;
    name: string;
    nameVi: string;
    price: number;
    priceYearly: number;
    maxAgents: number;
    features: string[];
    popular?: boolean;
}

interface Subscription {
    planId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt?: string;
    billingCycle: string;
}

interface Invoice {
    _id: string;
    invoiceNumber: string;
    planId: string;
    amount: number;
    currency: string;
    status: string;
    billingCycle: string;
    paidAt?: string;
    description: string;
    createdAt: string;
}

const planIcons: Record<string, any> = {
    trial: <Clock size={22} />,
    starter: <Zap size={22} />,
    pro: <Crown size={22} />,
    enterprise: <Shield size={22} />,
};

const planColors: Record<string, { bg: string; accent: string; gradient: string; ring: string; text: string; iconBg: string }> = {
    trial: {
        bg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        accent: '#64748b',
        gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
        ring: 'rgba(100, 116, 139, 0.15)',
        text: '#475569',
        iconBg: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
    },
    starter: {
        bg: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)',
        accent: '#7c3aed',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
        ring: 'rgba(139, 92, 246, 0.12)',
        text: '#6d28d9',
        iconBg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    },
    pro: {
        bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        accent: '#d97706',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        ring: 'rgba(245, 158, 11, 0.12)',
        text: '#b45309',
        iconBg: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    },
    enterprise: {
        bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        accent: '#0284c7',
        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
        ring: 'rgba(14, 165, 233, 0.12)',
        text: '#0369a1',
        iconBg: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    },
};

function formatVND(amount: number) {
    if (amount <= 0) return 'Liên hệ';
    return amount.toLocaleString('vi-VN') + 'đ';
}

export default function BillingPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [plans, setPlans] = useState<PlanTier[]>([]);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [changingPlan, setChangingPlan] = useState<string | null>(null);
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    useEffect(() => {
        if (!workspaceId) return;
        fetchData();
    }, [workspaceId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [subRes, invoiceRes] = await Promise.all([
                httpClient.get(`/workspaces/${workspaceId}/subscription`),
                httpClient.get(`/workspaces/${workspaceId}/subscription/invoices`),
            ]);
            if (subRes.data?.data) {
                setSubscription(subRes.data.data.subscription);
                setPlans(subRes.data.data.plan ? [subRes.data.data.plan] : []);
            }
            const plansRes = await httpClient.get(`/workspaces/${workspaceId}/subscription/plans`);
            if (plansRes.data?.data) setPlans(plansRes.data.data);
            if (invoiceRes.data?.data) setInvoices(invoiceRes.data.data.items || []);
        } catch (err) {
            console.error('Failed to fetch billing data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePlan = async (planId: string) => {
        if (!workspaceId) return;
        setChangingPlan(planId);
        try {
            await httpClient.post(`/workspaces/${workspaceId}/subscription/change`, {
                planId,
                billingCycle,
            });
            message.success('Đã nâng cấp gói thành công!');
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Lỗi khi đổi gói');
        } finally {
            setChangingPlan(null);
        }
    };

    const handlePayInvoice = async (invoiceId: string) => {
        try {
            await httpClient.post(`/workspaces/${workspaceId}/subscription/invoices/${invoiceId}/pay`);
            message.success('Thanh toán thành công!');
            fetchData();
        } catch {
            message.error('Lỗi khi thanh toán');
        }
    };

    if (!ready || !workspaceId) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <Spin size="large" />
            </div>
        );
    }

    const daysLeft = subscription?.currentPeriodEnd
        ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

    const invoiceColumns = [
        {
            title: 'Hoá đơn',
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
            render: (v: string) => <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#6366f1' }}>{v}</span>,
        },
        {
            title: 'Ngày lập',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (v: string) => <span style={{ color: '#64748b' }}>{new Date(v).toLocaleDateString('vi-VN')}</span>,
        },
        {
            title: 'Nội dung',
            dataIndex: 'description',
            key: 'description',
            render: (v: string) => <span style={{ color: '#334155' }}>{v}</span>,
        },
        {
            title: 'Tổng tiền',
            dataIndex: 'amount',
            key: 'amount',
            render: (v: number) => <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{formatVND(v)}</span>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => (
                <Tag
                    color={s === 'paid' ? 'green' : s === 'pending' ? 'orange' : 'red'}
                    style={{ borderRadius: 20, padding: '2px 12px', fontWeight: 600, fontSize: 12 }}
                >
                    {s === 'paid' ? '✓ Đã thanh toán' : s === 'pending' ? '◷ Chờ thanh toán' : '✕ Thất bại'}
                </Tag>
            ),
        },
        {
            title: '',
            key: 'action',
            render: (_: any, record: Invoice) =>
                record.status === 'pending' ? (
                    <button
                        onClick={() => handlePayInvoice(record._id)}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 20px',
                            borderRadius: 10,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                        }}
                    >
                        Thanh toán ngay
                    </button>
                ) : null,
        },
    ];

    return (
        <AppLayout headerTitle="Thanh toán">
            <Head><title>Thanh toán | NemarChat</title></Head>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

                .billing-page {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 32px 24px 60px;
                }

                .billing-banner {
                    border-radius: 24px;
                    padding: 36px 44px;
                    color: #fff;
                    margin-bottom: 48px;
                    position: relative;
                    overflow: hidden;
                }
                .billing-banner::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
                }
                .billing-banner::after {
                    content: '';
                    position: absolute;
                    right: -60px;
                    top: -60px;
                    width: 280px;
                    height: 280px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.06);
                }

                .billing-toggle {
                    display: inline-flex;
                    background: rgba(255, 255, 255, 0.12);
                    backdrop-filter: blur(8px);
                    border-radius: 14px;
                    padding: 4px;
                    gap: 2px;
                }
                .billing-toggle button {
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.7);
                    padding: 8px 20px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .billing-toggle button.active {
                    background: rgba(255, 255, 255, 0.25);
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .plan-card {
                    background: #fff;
                    border-radius: 24px;
                    padding: 32px 28px;
                    border: 1.5px solid #e2e8f0;
                    position: relative;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: default;
                    display: flex;
                    flex-direction: column;
                }
                .plan-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
                }
                .plan-card.popular {
                    border-color: #6366f1;
                    box-shadow: 0 8px 30px rgba(99, 102, 241, 0.12);
                }
                .plan-card.popular:hover {
                    box-shadow: 0 20px 50px rgba(99, 102, 241, 0.18);
                }

                .plan-popular-badge {
                    position: absolute;
                    top: -1px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-50%);
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: #fff;
                    padding: 5px 18px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }

                .plan-icon-wrap {
                    width: 52px;
                    height: 52px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .plan-features {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 24px;
                    flex: 1;
                }
                .plan-features li {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    font-size: 13px;
                    color: #475569;
                    margin-bottom: 10px;
                    line-height: 1.5;
                }
                .plan-features li .check-icon {
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-top: 1px;
                }

                .plan-cta {
                    width: 100%;
                    padding: 14px;
                    border-radius: 14px;
                    border: none;
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    letter-spacing: 0.01em;
                }
                .plan-cta:not(:disabled):hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
                }
                .plan-cta:disabled {
                    cursor: default;
                    opacity: 0.7;
                }

                .section-heading {
                    font-size: 20px;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 24px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .section-heading .icon-wrap {
                    width: 36px;
                    height: 36px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .invoice-table-wrap {
                    background: #fff;
                    border-radius: 20px;
                    overflow: hidden;
                    border: 1.5px solid #e2e8f0;
                    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
                }
                .invoice-table-wrap .ant-table {
                    border-radius: 0 !important;
                }
                .invoice-table-wrap .ant-table-thead > tr > th {
                    background: #f8fafc !important;
                    font-weight: 700 !important;
                    font-size: 12px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.06em !important;
                    color: #64748b !important;
                    border-bottom: 1.5px solid #e2e8f0 !important;
                    padding: 14px 16px !important;
                }
                .invoice-table-wrap .ant-table-tbody > tr > td {
                    padding: 14px 16px !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                }
                .invoice-table-wrap .ant-table-tbody > tr:hover > td {
                    background: #fafbfc !important;
                }

                @media (max-width: 768px) {
                    .billing-page { padding: 16px 12px 40px; }
                    .billing-banner { padding: 24px 20px; border-radius: 18px; }
                    .plans-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>

            <main className="billing-page">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 100 }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: '#94a3b8', fontSize: 14 }}>Đang tải thông tin thanh toán...</div>
                    </div>
                ) : (
                    <>
                        {/* ── Current Plan Banner ── */}
                        {subscription && (
                            <div
                                className="billing-banner"
                                style={{
                                    background: planColors[subscription.planId]?.gradient || planColors.trial.gradient,
                                }}
                            >
                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 10,
                                                    background: 'rgba(255,255,255,0.2)',
                                                    backdropFilter: 'blur(8px)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {planIcons[subscription.planId]}
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                                                    Gói hiện tại
                                                </span>
                                            </div>

                                            <h2 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                                                {plans.find(p => p.id === subscription.planId)?.nameVi || subscription.planId}
                                            </h2>

                                            <div style={{ display: 'flex', gap: 20, fontSize: 14, opacity: 0.9, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <Clock size={14} />
                                                    {daysLeft > 0 ? `Còn ${daysLeft} ngày` : 'Đã hết hạn'}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <CreditCard size={14} />
                                                    {subscription.billingCycle === 'yearly' ? 'Thanh toán theo năm' : 'Thanh toán theo tháng'}
                                                </span>
                                                <Tag
                                                    style={{
                                                        margin: 0,
                                                        fontWeight: 700,
                                                        borderRadius: 20,
                                                        padding: '2px 14px',
                                                        fontSize: 12,
                                                        border: 'none',
                                                        background: subscription.status === 'active' ? 'rgba(255,255,255,0.25)' : 'rgba(255,70,70,0.3)',
                                                        color: '#fff',
                                                        backdropFilter: 'blur(4px)',
                                                    }}
                                                >
                                                    {subscription.status === 'active' ? '● Đang hoạt động' : subscription.status === 'expired' ? '○ Hết hạn' : subscription.status}
                                                </Tag>
                                            </div>
                                        </div>

                                        {/* Billing cycle toggle */}
                                        <div className="billing-toggle">
                                            <button
                                                className={billingCycle === 'monthly' ? 'active' : ''}
                                                onClick={() => setBillingCycle('monthly')}
                                            >
                                                Hàng tháng
                                            </button>
                                            <button
                                                className={billingCycle === 'yearly' ? 'active' : ''}
                                                onClick={() => setBillingCycle('yearly')}
                                            >
                                                Hàng năm <span style={{ fontSize: 11, opacity: 0.8 }}>(-20%)</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Plan Cards ── */}
                        <div className="section-heading">
                            <div className="icon-wrap" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', color: '#d97706' }}>
                                <Sparkles size={18} />
                            </div>
                            Chọn gói phù hợp
                        </div>

                        <div
                            className="plans-grid"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`,
                                gap: 20,
                                marginBottom: 56,
                            }}
                        >
                            {plans.map(plan => {
                                const isCurrentPlan = subscription?.planId === plan.id;
                                const colors = planColors[plan.id] || planColors.trial;
                                const isHovered = hoveredPlan === plan.id;
                                const displayPrice = billingCycle === 'yearly' && plan.priceYearly > 0
                                    ? Math.round(plan.priceYearly / 12)
                                    : plan.price;

                                return (
                                    <div
                                        key={plan.id}
                                        className={`plan-card ${plan.popular ? 'popular' : ''}`}
                                        onMouseEnter={() => setHoveredPlan(plan.id)}
                                        onMouseLeave={() => setHoveredPlan(null)}
                                        style={{
                                            borderColor: isCurrentPlan ? colors.accent : undefined,
                                            background: isHovered ? colors.bg : '#fff',
                                        }}
                                    >
                                        {plan.popular && (
                                            <div className="plan-popular-badge">
                                                <Star size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                                Phổ biến nhất
                                            </div>
                                        )}

                                        <div className="plan-icon-wrap" style={{ background: colors.iconBg }}>
                                            {planIcons[plan.id]}
                                        </div>

                                        <h4 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                                            {plan.nameVi}
                                        </h4>

                                        <div style={{ margin: '12px 0 4px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                            <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                                {displayPrice === 0 ? 'Miễn phí' : displayPrice < 0 ? 'Liên hệ' : formatVND(displayPrice)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, fontWeight: 500 }}>
                                            {plan.price > 0 && (
                                                <span>/{billingCycle === 'yearly' ? 'tháng' : 'tháng'} · Tối đa {plan.maxAgents} agents</span>
                                            )}
                                            {plan.price === 0 && <span>30 ngày · {plan.maxAgents} agent</span>}
                                            {plan.price < 0 && <span>Unlimited agents · Hỗ trợ 24/7</span>}
                                        </div>

                                        {/* Divider */}
                                        <div style={{ height: 1, background: '#f1f5f9', margin: '0 -4px 20px' }} />

                                        <ul className="plan-features">
                                            {plan.features.map((f, i) => (
                                                <li key={i}>
                                                    <span className="check-icon" style={{ background: `${colors.accent}14`, color: colors.accent }}>
                                                        <Check size={12} strokeWidth={3} />
                                                    </span>
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>

                                        <button
                                            className="plan-cta"
                                            disabled={isCurrentPlan || changingPlan === plan.id || plan.price < 0}
                                            onClick={() => plan.price >= 0 && handleChangePlan(plan.id)}
                                            style={{
                                                background: isCurrentPlan
                                                    ? '#f1f5f9'
                                                    : plan.popular
                                                        ? colors.gradient
                                                        : colors.bg,
                                                color: isCurrentPlan
                                                    ? '#94a3b8'
                                                    : plan.popular
                                                        ? '#fff'
                                                        : colors.text,
                                                boxShadow: plan.popular && !isCurrentPlan
                                                    ? `0 4px 16px ${colors.ring}`
                                                    : 'none',
                                            }}
                                        >
                                            {changingPlan === plan.id ? (
                                                <Spin size="small" />
                                            ) : isCurrentPlan ? (
                                                <>
                                                    <Check size={16} />
                                                    Gói hiện tại
                                                </>
                                            ) : plan.price < 0 ? (
                                                'Liên hệ Sales'
                                            ) : (
                                                <>
                                                    Nâng cấp ngay
                                                    <ChevronRight size={16} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Invoice History ── */}
                        <div className="section-heading">
                            <div className="icon-wrap" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', color: '#6366f1' }}>
                                <Receipt size={18} />
                            </div>
                            Lịch sử hoá đơn
                        </div>

                        <div className="invoice-table-wrap">
                            <Table
                                dataSource={invoices}
                                columns={invoiceColumns}
                                rowKey="_id"
                                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                locale={{
                                    emptyText: (
                                        <div style={{ padding: '48px 0', textAlign: 'center' }}>
                                            <div style={{
                                                width: 64, height: 64, borderRadius: 20,
                                                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                marginBottom: 16,
                                            }}>
                                                <FileText size={28} color="#22c55e" />
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                                                Chưa có hoá đơn nào
                                            </div>
                                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                                Hoá đơn sẽ xuất hiện khi bạn nâng cấp gói dịch vụ
                                            </div>
                                        </div>
                                    ),
                                }}
                            />
                        </div>
                    </>
                )}
            </main>
        </AppLayout>
    );
}
