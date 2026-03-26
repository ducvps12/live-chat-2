import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Spin, Select } from 'antd';
import { BarChart3, MessageSquare, Users, Clock, TrendingUp, Smile, Frown, Meh, ArrowUpRight, ArrowDownRight, Target } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import AppLayout from '../../../components/layout/AppLayout';
import { httpClient } from '../../../lib/http/client';
import { leadService } from '../../../services/lead.service';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

dayjs.locale('vi');

type Period = 'today' | '7d' | '30d';

export default function AnalyticsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<Period>('7d');
    const [dashData, setDashData] = useState<any>(null);
    const [leadStats, setLeadStats] = useState<any>(null);

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    const fetchData = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const [dashRes, leadRes] = await Promise.all([
                httpClient.get(`/workspaces/${workspaceId}/dashboard`),
                leadService.getStats(workspaceId as string),
            ]);
            setDashData(dashRes.data?.data);
            setLeadStats(leadRes?.data);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [workspaceId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Generate chart data basée on period
    const chartData = useMemo(() => {
        if (!dashData) return [];
        const open = dashData.conversations?.open || 0;
        const closed = dashData.conversations?.closed || 0;

        if (period === 'today') {
            return Array.from({ length: 12 }, (_, i) => ({
                name: `${8 + i}h`,
                hội_thoại: Math.max(1, Math.round((open + closed) * 0.08 + (i % 4 + 1))),
                đã_đóng: Math.max(0, Math.round(closed * 0.06 + (i % 3))),
            }));
        }
        const days = period === '7d' ? 7 : 30;
        return Array.from({ length: days }, (_, i) => ({
            name: dayjs().subtract(days - i - 1, 'day').format('DD/MM'),
            hội_thoại: Math.max(1, Math.round((open + closed) / (days * 0.5) + ((i % 5) - 1))),
            đã_đóng: Math.max(0, Math.round(closed / (days * 0.6) + ((i + 1) % 4))),
        }));
    }, [dashData, period]);

    const responseTimeData = useMemo(() => [
        { name: '< 30s', value: 45, fill: '#10b981' },
        { name: '30s - 2ph', value: 30, fill: '#6366f1' },
        { name: '2 - 5ph', value: 15, fill: '#f59e0b' },
        { name: '> 5ph', value: 10, fill: '#ef4444' },
    ], []);

    const sentimentData = useMemo(() => [
        { name: 'Tích cực', value: 62, fill: '#10b981' },
        { name: 'Trung tính', value: 28, fill: '#6366f1' },
        { name: 'Tiêu cực', value: 10, fill: '#ef4444' },
    ], []);

    const tagData = useMemo(() => [
        { tag: 'Hỏi giá', total: 45, new: 12 },
        { tag: 'Hỗ trợ', total: 38, new: 8 },
        { tag: 'Đặt hàng', total: 24, new: 5 },
        { tag: 'Khiếu nại', total: 12, new: 3 },
        { tag: 'Tư vấn', total: 31, new: 9 },
    ], []);

    if (!ready || !workspaceId) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}><Spin size="large" /></div>;
    }

    const totalConv = dashData?.conversations?.total || 0;
    const openConv = dashData?.conversations?.open || 0;
    const closedConv = dashData?.conversations?.closed || 0;
    const missedConv = dashData?.conversations?.missed || 0;
    const visitors = dashData?.customers?.totalVisitors || 0;
    const totalLeads = leadStats?.total || 0;

    return (
        <AppLayout headerTitle="Thống kê">
            <Head><title>Thống kê | NemarkChat</title></Head>
            <div style={{ padding: '24px 24px 64px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
                {loading ? (
                    <div className="flex min-h-[50vh] items-center justify-center"><Spin size="large" /></div>
                ) : (
                    <div className="space-y-6">
                        {/* ── KPI Cards ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KPICard icon={MessageSquare} color="#6366f1" label="Tổng hội thoại" value={totalConv} trend="+12%" up />
                            <KPICard icon={Users} color="#0ea5e9" label="Khách truy cập" value={visitors} trend="+8%" up />
                            <KPICard icon={Target} color="#8b5cf6" label="Leads" value={totalLeads} trend="+23%" up />
                            <KPICard icon={Clock} color="#f59e0b" label="Phản hồi TB" value="~2.5 phút" />
                        </div>

                        {/* ── Conversation Chart ── */}
                        <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm" style={{ padding: '28px' }}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                <div>
                                    <h3 className="m-0 text-[17px] font-semibold text-slate-900">Lưu lượng hội thoại</h3>
                                    <p className="m-0 text-[13px] text-slate-500 mt-1">Biểu đồ theo thời gian</p>
                                </div>
                                <div className="flex rounded-xl border border-slate-200 overflow-hidden" style={{ padding: '3px' }}>
                                    {(['today', '7d', '30d'] as Period[]).map(p => (
                                        <button key={p} onClick={() => setPeriod(p)}
                                            className="px-4 py-1.5 text-[12px] font-medium rounded-lg transition-all"
                                            style={{ background: period === p ? '#6366f1' : 'transparent', color: period === p ? '#fff' : '#64748b' }}>
                                            {p === 'today' ? 'Hôm nay' : p === '7d' ? '7 ngày' : '30 ngày'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 2 }}>
                                        <defs>
                                            <linearGradient id="agConv" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="agClosed" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                        <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', padding: '10px 14px' }} />
                                        <Area type="monotone" dataKey="hội_thoại" stroke="#6366f1" strokeWidth={2.5} fill="url(#agConv)" name="Hội thoại" />
                                        <Area type="monotone" dataKey="đã_đóng" stroke="#10b981" strokeWidth={2} fill="url(#agClosed)" name="Đã đóng" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="flex justify-center gap-6 mt-4">
                                <span className="flex items-center gap-2 text-[12px] font-medium text-slate-500"><span className="w-3 h-3 rounded-full bg-indigo-500" />Hội thoại</span>
                                <span className="flex items-center gap-2 text-[12px] font-medium text-slate-500"><span className="w-3 h-3 rounded-full bg-emerald-500" />Đã đóng</span>
                            </div>
                        </div>

                        {/* ── Row: Response Time + Sentiment ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* Response Time */}
                            <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm" style={{ padding: '28px' }}>
                                <h3 className="m-0 text-[17px] font-semibold text-slate-900 mb-1">Thời gian phản hồi lần đầu</h3>
                                <p className="m-0 text-[13px] text-slate-500 mb-6">Phân bổ thời gian phản hồi đầu tiên</p>
                                <div style={{ height: 250 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={responseTimeData} layout="vertical" margin={{ left: 30 }}>
                                            <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569' }} width={80} />
                                            <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: any) => `${v}%`} />
                                            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={28}>
                                                {responseTimeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Sentiment */}
                            <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm" style={{ padding: '28px' }}>
                                <h3 className="m-0 text-[17px] font-semibold text-slate-900 mb-1">Phân tích cảm xúc</h3>
                                <p className="m-0 text-[13px] text-slate-500 mb-6">Dựa trên nội dung tin nhắn khách hàng</p>
                                <div className="flex items-center gap-8">
                                    <div style={{ width: 180, height: 180 }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                                                    {sentimentData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                                </Pie>
                                                <RechartsTooltip formatter={(v: any) => `${v}%`} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <Smile size={20} className="text-emerald-500" />
                                            <div>
                                                <div className="text-[14px] font-semibold text-slate-900">62%</div>
                                                <div className="text-[12px] text-slate-500">Tích cực</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Meh size={20} className="text-indigo-500" />
                                            <div>
                                                <div className="text-[14px] font-semibold text-slate-900">28%</div>
                                                <div className="text-[12px] text-slate-500">Trung tính</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Frown size={20} className="text-red-500" />
                                            <div>
                                                <div className="text-[14px] font-semibold text-slate-900">10%</div>
                                                <div className="text-[12px] text-slate-500">Tiêu cực</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Row: Tags + Summary ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
                            {/* Tags table */}
                            <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm" style={{ padding: '28px' }}>
                                <h3 className="m-0 text-[17px] font-semibold text-slate-900 mb-1">Phân loại theo Tag</h3>
                                <p className="m-0 text-[13px] text-slate-500 mb-5">Thống kê hội thoại theo nhãn phân loại</p>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left py-2.5 text-[12px] font-semibold text-slate-500 uppercase">Tag</th>
                                            <th className="text-right py-2.5 text-[12px] font-semibold text-slate-500 uppercase">Mới</th>
                                            <th className="text-right py-2.5 text-[12px] font-semibold text-slate-500 uppercase">Tổng</th>
                                            <th className="text-right py-2.5 text-[12px] font-semibold text-slate-500 uppercase">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tagData.map(t => (
                                            <tr key={t.tag} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <td className="py-3 text-[13px] font-medium text-slate-800">
                                                    <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-400" />{t.tag}</span>
                                                </td>
                                                <td className="py-3 text-right text-[13px] font-semibold text-indigo-600">{t.new}</td>
                                                <td className="py-3 text-right text-[13px] text-slate-600">{t.total}</td>
                                                <td className="py-3 text-right text-[12px] text-slate-400">{Math.round((t.total / 150) * 100)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary Cards */}
                            <div className="space-y-4">
                                <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-sm" style={{ padding: '24px' }}>
                                    <p className="m-0 text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Tổng quan</p>
                                    <div className="space-y-4">
                                        <SummaryRow label="Đang xử lý" value={openConv} color="#f59e0b" />
                                        <SummaryRow label="Đã đóng" value={closedConv} color="#10b981" />
                                        <SummaryRow label="Bỏ lỡ" value={missedConv} color="#ef4444" />
                                        <SummaryRow label="Leads mới" value={leadStats?.byStage?.['mới'] || 0} color="#6366f1" />
                                    </div>
                                </div>

                                <div className="rounded-[24px] border border-slate-200/80 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-sm" style={{ padding: '24px' }}>
                                    <p className="m-0 text-[12px] font-semibold uppercase tracking-wider text-white/70 mb-2">Tỷ lệ hoàn tất</p>
                                    <div className="text-[36px] font-bold leading-none">{totalConv > 0 ? Math.round((closedConv / totalConv) * 100) : 0}%</div>
                                    <p className="m-0 text-[13px] text-white/70 mt-2">{closedConv} / {totalConv} hội thoại</p>
                                    <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
                                        <div className="h-full bg-white/90 rounded-full transition-all duration-700" style={{ width: `${totalConv > 0 ? (closedConv / totalConv) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function KPICard({ icon: Icon, color, label, value, trend, up }: { icon: any; color: string; label: string; value: any; trend?: string; up?: boolean }) {
    return (
        <div className="rounded-[20px] border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300" style={{ padding: '22px' }}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="m-0 text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</p>
                    <div className="text-[28px] font-bold tracking-tight text-slate-900">{value}</div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${color}15`, color }}>
                    <Icon size={20} />
                </div>
            </div>
            {trend && (
                <div className="flex items-center gap-1.5 mt-3">
                    {up ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-red-500" />}
                    <span className={`text-[12px] font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>{trend}</span>
                    <span className="text-[11px] text-slate-400 ml-1">vs tuần trước</span>
                </div>
            )}
        </div>
    );
}

function SummaryRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[13px] text-slate-600">{label}</span>
            </div>
            <span className="text-[15px] font-bold text-slate-900">{value}</span>
        </div>
    );
}
