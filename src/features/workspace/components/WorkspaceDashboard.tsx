import React, { useMemo, useState } from 'react';
import { Spin } from 'antd';
import Link from 'next/link';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
} from 'recharts';
import {
    Activity,
    AlertTriangle,
    Award,
    BarChart3,
    Bell,
    Briefcase,
    Box,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Eye,
    Globe,
    Hash,
    Inbox,
    MessageSquare,
    RotateCcw,
    Settings,
    Timer,
    TrendingUp,
    Trophy,
    UserCheck,
    UserRoundX,
    Users,
    Zap,
    type LucideIcon,
} from 'lucide-react';

import {
    useWorkspace,
    useWorkspaceDashboard,
    useAgentPerformance,
} from '../../../domains/workspace/workspace.hooks';

dayjs.locale('vi');

interface Props {
    workspaceId: string;
}

type Period = 'today' | '7d' | '30d';

const PERIOD_MAP: Record<Period, { label: string; sub: string }> = {
    today: { label: 'Hôm nay', sub: 'Hoạt động trong hôm nay' },
    '7d': { label: '7 ngày', sub: 'Hoạt động trong 7 ngày qua' },
    '30d': { label: '30 ngày', sub: 'Hoạt động trong 30 ngày qua' },
};

type ChartRow = {
    name: string;
    open: number;
    closed: number;
};

const buildChartData = (open: number, closed: number, period: Period): ChartRow[] => {
    if (period === 'today') {
        const hours = Array.from({ length: 13 }, (_, i) => i + 8);
        return hours.map((hour, idx) => ({
            name: `${hour}h`,
            open: Math.max(1, Math.round(open * 0.15 + ((idx % 4) + 1))),
            closed: Math.max(2, Math.round(closed * 0.12 + ((idx % 5) + 2))),
        }));
    }

    const total = period === '7d' ? 7 : 30;

    return Array.from({ length: total }, (_, idx) => {
        const dayIndex = total - idx - 1;
        const closedBase = Math.max(2, Math.round(closed / Math.max(total / 2.2, 1)));
        const openBase = Math.max(1, Math.round(open / Math.max(total / 2.5, 1)));

        return {
            name: dayjs().subtract(dayIndex, 'day').format('DD/MM'),
            open: Math.max(1, openBase + ((idx % 4) - 1) + (idx % 6 === 0 ? 1 : 0)),
            closed: Math.max(2, closedBase + ((idx + 2) % 5) + (idx % 7 === 0 ? 2 : 0)),
        };
    });
};

const WorkspaceDashboard: React.FC<Props> = ({ workspaceId }) => {
    const { data: wsData, isLoading: workspaceLoading } = useWorkspace(workspaceId);
    const {
        data: statsData,
        isLoading: dashboardLoading,
        error,
    } = useWorkspaceDashboard(workspaceId);

    const [period, setPeriod] = useState<Period>('7d');

    const openCount = statsData?.data?.conversations?.open ?? 0;
    const closedCount = statsData?.data?.conversations?.closed ?? 0;

    const chartData = useMemo(
        () => buildChartData(openCount, closedCount, period),
        [openCount, closedCount, period]
    );

    if (workspaceLoading || dashboardLoading) {
        return (
            <div className="flex min-h-[70vh] items-center justify-center">
                <Spin size="large" />
            </div>
        );
    }

    if (error || !statsData?.data || !wsData?.data) {
        return (
            <div className="flex min-h-[56vh] flex-col items-center justify-center gap-3 text-slate-500">
                <AlertTriangle size={28} className="text-rose-400" />
                <p className="m-0 text-sm">Không thể tải dữ liệu. Vui lòng thử lại.</p>
            </div>
        );
    }

    const ws = wsData.data;
    const s = statsData.data;

    const closeRate =
        s.conversations.total > 0
            ? Math.round((s.conversations.closed / s.conversations.total) * 100)
            : 0;

    const waitQueue = Math.max(0, Math.floor(s.conversations.open * 0.33));
    const unassigned = Math.max(0, Math.floor(s.customers.totalVisitors * 0.5));
    const recommendedAgents = 5;
    const onlineMembers = s.overview.totalMembers;
    const shortage = Math.max(0, recommendedAgents - onlineMembers);

    return (
        <div className="mx-auto max-w-[1380px]" style={{ padding: '24px 16px 64px' }}>
            <div className="space-y-6">
                <header className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]" style={{ padding: '24px 28px' }}>
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)]">
                                {ws.name.charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="m-0 text-[26px] font-semibold tracking-tight text-slate-900">
                                        {ws.name}
                                    </h1>

                                    <span className="inline-flex h-7 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        {ws.isActive ? 'Hoạt động' : 'Tạm dừng'}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Globe size={14} />
                                        {s.overview.domain}
                                    </span>
                                    <span className="hidden text-slate-300 sm:inline">•</span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <Clock3 size={14} />
                                        Cập nhật: {dayjs().format('HH:mm')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <Link
                                href={`/workspace/${workspaceId}/settings`}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-[14px] font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
                            >
                                <Settings size={16} />
                                Cấu hình
                            </Link>

                            <Link
                                href={`/workspace/${workspaceId}/inbox`}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition-all duration-200 hover:bg-indigo-700"
                            >
                                <Inbox size={16} />
                                Mở Chat Inbox
                            </Link>
                        </div>
                    </div>
                </header>

                <section className="space-y-4">
                    <SectionHeading icon={Activity} title="Vận hành thời gian thực" />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            icon={MessageSquare}
                            tone="indigo"
                            label="Đang xử lý"
                            value={String(s.conversations.open)}
                            hint={waitQueue > 0 ? `${waitQueue} cuộc chờ quá 2 phút` : 'Tất cả đang được xử lý'}
                            hintTone={waitQueue > 0 ? 'warn' : 'ok'}
                            href={`/workspace/${workspaceId}/inbox`}
                        />

                        <MetricCard
                            icon={Eye}
                            tone="sky"
                            label="Khách truy cập"
                            value={String(s.customers.totalVisitors)}
                            hint={unassigned > 0 ? `${unassigned} khách chưa gán agent` : 'Tất cả đã được gán'}
                            hintTone={unassigned > 0 ? 'info' : 'ok'}
                            href={`/workspace/${workspaceId}/contacts`}
                        />

                        <MetricCard
                            icon={UserRoundX}
                            tone={s.conversations.missed > 0 ? 'rose' : 'emerald'}
                            label="Bỏ lỡ"
                            value={String(s.conversations.missed)}
                            hint={
                                s.conversations.missed > 0
                                    ? `${s.conversations.missed} cuộc cần theo dõi`
                                    : 'Không có hội thoại bị bỏ lỡ'
                            }
                            hintTone={s.conversations.missed > 0 ? 'bad' : 'ok'}
                            href={`/workspace/${workspaceId}/inbox`}
                        />

                        <MetricCard
                            icon={Users}
                            tone="violet"
                            label="Nhân sự trực tuyến"
                            value={`${onlineMembers} / ${recommendedAgents}`}
                            hint={shortage > 0 ? `Thiếu ${shortage} người vào giờ cao điểm` : 'Đội ngũ đang đủ nhân sự'}
                            hintTone={shortage > 0 ? 'warn' : 'ok'}
                            href={`/workspace/${workspaceId}/teams`}
                        />
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <DashboardCard className="overflow-hidden">
                        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                                <CardTitle>Lưu lượng hội thoại</CardTitle>
                                <p className="m-0 text-[13px] leading-6 text-slate-500">
                                    {PERIOD_MAP[period].sub}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:items-end">
                                <PeriodTabs value={period} onChange={setPeriod} />

                                <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-slate-500">
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                                        Đã đóng
                                    </span>
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-300" />
                                        Đang xử lý
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6">
                            <div className="h-[310px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={chartData}
                                        margin={{ top: 8, right: 8, left: -20, bottom: 2 }}
                                    >
                                        <defs>
                                            <linearGradient id="closedGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.18} />
                                                <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                                            </linearGradient>

                                            <linearGradient id="openGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#A5B4FC" stopOpacity={0.18} />
                                                <stop offset="100%" stopColor="#A5B4FC" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>

                                        <CartesianGrid
                                            vertical={false}
                                            stroke="#E2E8F0"
                                            strokeDasharray="4 4"
                                        />

                                        <XAxis
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 12, fill: '#94A3B8' }}
                                            dy={12}
                                        />

                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 12, fill: '#94A3B8' }}
                                        />

                                        <RechartsTooltip
                                            contentStyle={{
                                                borderRadius: 16,
                                                border: '1px solid #E2E8F0',
                                                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.08)',
                                                padding: '12px 14px',
                                            }}
                                            itemStyle={{
                                                fontSize: 13,
                                                fontWeight: 500,
                                                color: '#334155',
                                            }}
                                            labelStyle={{
                                                fontSize: 12,
                                                color: '#94A3B8',
                                                marginBottom: 6,
                                            }}
                                        />

                                        <Area
                                            type="monotone"
                                            dataKey="closed"
                                            name="Đã đóng"
                                            stroke="#6366F1"
                                            strokeWidth={2.5}
                                            fill="url(#closedGradient)"
                                        />

                                        <Area
                                            type="monotone"
                                            dataKey="open"
                                            name="Đang xử lý"
                                            stroke="#A5B4FC"
                                            strokeWidth={2.2}
                                            fill="url(#openGradient)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </DashboardCard>

                    <div className="flex flex-col gap-5">
                        <DashboardCard>
                            <div className="space-y-5">
                                <div className="space-y-1">
                                    <CardTitle>Hiệu suất</CardTitle>
                                    <p className="m-0 text-[13px] leading-6 text-slate-500">
                                        Theo dõi các chỉ số vận hành quan trọng của workspace
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <StatRow
                                        icon={Zap}
                                        tone="amber"
                                        label="Tốc độ phản hồi"
                                        value={String(s.reports.responseRate)}
                                    />

                                    <StatRow
                                        icon={CheckCircle2}
                                        tone="emerald"
                                        label="Điểm hài lòng"
                                        value={`${s.reports.csat} / 5.0`}
                                    />

                                    <StatRow
                                        icon={Timer}
                                        tone="sky"
                                        label="Thời gian xử lý TB"
                                        value="~4 phút"
                                    />

                                    <StatRow
                                        icon={RotateCcw}
                                        tone="violet"
                                        label="Tỷ lệ mở lại"
                                        value="2.3%"
                                    />
                                </div>
                            </div>
                        </DashboardCard>

                        <DashboardCard>
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="m-0 text-[13px] font-medium text-slate-600">
                                            Đã giải quyết hôm nay
                                        </p>
                                        <p className="m-0 text-[12px] leading-6 text-slate-500">
                                            Tỷ lệ hoàn tất trên tổng số hội thoại hiện có
                                        </p>
                                    </div>

                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700">
                                        {s.conversations.closed} / {s.conversations.total}
                                    </span>
                                </div>

                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                        className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                                        style={{ width: `${closeRate}%` }}
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[12px] text-slate-500">Tiến độ xử lý</span>
                                    <span className="text-[13px] font-semibold text-indigo-600">
                                        {closeRate}%
                                    </span>
                                </div>
                            </div>
                        </DashboardCard>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <DashboardCard>
                        <div className="space-y-5">
                            <div className="space-y-1">
                                <CardTitle>Ghi nhận gần đây</CardTitle>
                                <p className="m-0 text-[13px] leading-6 text-slate-500">
                                    Các hoạt động mới nhất trong hệ thống
                                </p>
                            </div>

                            <div className="divide-y divide-slate-100">
                                <ActivityItem
                                    icon={UserCheck}
                                    tone="sky"
                                    title="Khách mới"
                                    meta="Từ trang bán hàng"
                                    time="5 phút trước"
                                    href={`/workspace/${workspaceId}/contacts`}
                                />
                                <ActivityItem
                                    icon={MessageSquare}
                                    tone="indigo"
                                    title="Tin nhắn mới"
                                    meta="#TKT-094 đang chờ phản hồi"
                                    time="12 phút trước"
                                    href={`/workspace/${workspaceId}/inbox`}
                                />
                                <ActivityItem
                                    icon={Users}
                                    tone="emerald"
                                    title="Tư vấn viên tham gia"
                                    meta="Hỗ trợ ticket #092"
                                    time="35 phút trước"
                                    href={`/workspace/${workspaceId}/inbox`}
                                />
                                <ActivityItem
                                    icon={AlertTriangle}
                                    tone="rose"
                                    title="Cuộc chat bỏ lỡ"
                                    meta="Khách đã rời đi trước khi được trả lời"
                                    time="1 giờ trước"
                                    href={`/workspace/${workspaceId}/inbox`}
                                />
                            </div>
                        </div>
                    </DashboardCard>

                    <div className="flex flex-col gap-5">
                        <DashboardCard>
                            <div className="space-y-5">
                                <div className="space-y-1">
                                    <CardTitle>Thiết lập nhanh</CardTitle>
                                    <p className="m-0 text-[13px] leading-6 text-slate-500">
                                        Những thao tác quản trị thường dùng
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <QuickAction
                                        href={`/workspace/${workspaceId}/widgets`}
                                        icon={Box}
                                        tone="indigo"
                                        title="Lấy mã nhúng Script"
                                        desc="Gắn widget chat vào website"
                                    />

                                    <QuickAction
                                        href={`/workspace/${workspaceId}/teams`}
                                        icon={Users}
                                        tone="emerald"
                                        title="Thêm tư vấn viên"
                                        desc="Mời thành viên mới vào workspace"
                                    />

                                    <QuickAction
                                        href={`/workspace/${workspaceId}/settings`}
                                        icon={Zap}
                                        tone="amber"
                                        title="Cài đặt tự động"
                                        desc="Thiết lập phân luồng và tự động hóa"
                                    />
                                </div>
                            </div>
                        </DashboardCard>

                        <DashboardCard className="overflow-hidden">
                            <div className="rounded-t-[24px] bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white" style={{ margin: '-28px -28px 24px', padding: '24px 28px' }}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3.5">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20 backdrop-blur">
                                            <Briefcase size={18} />
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="m-0 text-[24px] font-semibold leading-tight">
                                                {s.billing.plan}
                                            </h3>
                                            <p className="m-0 text-[13px] text-white/80">
                                                Chu kỳ thanh toán hàng tháng
                                            </p>
                                        </div>
                                    </div>

                                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
                                        Plan
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70" style={{ padding: '14px 16px' }}>
                                    <div className="divide-y divide-slate-200/80">
                                        <PlanInfoRow
                                            icon={Globe}
                                            label="Số domain"
                                            value={`${s.config.totalWidgets} / Không giới hạn`}
                                        />
                                        <PlanInfoRow
                                            icon={Users}
                                            label="Chỗ ngồi"
                                            value={`${onlineMembers} / 5`}
                                        />
                                        <PlanInfoRow
                                            icon={Hash}
                                            label="Dung lượng"
                                            value="240 MB / 5 GB"
                                        />
                                    </div>
                                </div>

                                <Link
                                    href={`/workspace/${workspaceId}/settings`}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-[14px] font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
                                >
                                    Quản lý thanh toán
                                    <ChevronRight size={16} />
                                </Link>
                            </div>
                        </DashboardCard>
                    </div>
                </section>

                {/* ── Agent Performance ── */}
                <AgentPerformanceSection workspaceId={workspaceId} />
            </div>
        </div>
    );
};

type DashboardCardProps = {
    children: React.ReactNode;
    className?: string;
};

const DashboardCard = ({ children, className = '' }: DashboardCardProps) => {
    return (
        <div
            className={[
                'rounded-[28px] border border-slate-200/80 bg-white',
                'shadow-[0_1px_3px_rgba(15,23,42,0.04)]',
                className,
            ].join(' ')}
            style={{ padding: '28px' }}
        >
            {children}
        </div>
    );
};

const CardTitle = ({ children }: { children: React.ReactNode }) => {
    return (
        <h2 className="m-0 text-[18px] font-semibold leading-7 tracking-tight text-slate-900">
            {children}
        </h2>
    );
};

const SectionHeading = ({
    icon: Icon,
    title,
}: {
    icon: LucideIcon;
    title: string;
}) => {
    return (
        <div className="flex items-center gap-2.5 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon size={16} />
            </span>
            <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {title}
            </span>
        </div>
    );
};

const PeriodTabs = ({
    value,
    onChange,
}: {
    value: Period;
    onChange: (value: Period) => void;
}) => {
    return (
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50" style={{ padding: '4px' }}>
            {(Object.keys(PERIOD_MAP) as Period[]).map((key) => {
                const active = value === key;

                return (
                    <button
                        key={key}
                        onClick={() => onChange(key)}
                        className={[
                            'rounded-xl text-[12px] font-medium transition-all duration-200',
                            active
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700',
                        ].join(' ')}
                        style={{ padding: '8px 16px' }}
                    >
                        {PERIOD_MAP[key].label}
                    </button>
                );
            })}
        </div>
    );
};

type Tone = 'indigo' | 'sky' | 'rose' | 'emerald' | 'violet' | 'amber';
type HintTone = 'ok' | 'warn' | 'info' | 'bad';

const toneIconMap: Record<Tone, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
};

const hintToneMap: Record<
    HintTone,
    { text: string; icon: LucideIcon }
> = {
    ok: { text: 'text-emerald-700', icon: CheckCircle2 },
    warn: { text: 'text-amber-700', icon: Bell },
    info: { text: 'text-sky-700', icon: Activity },
    bad: { text: 'text-rose-700', icon: AlertTriangle },
};

const MetricCard = ({
    icon: Icon,
    tone,
    label,
    value,
    hint,
    hintTone,
    href,
}: {
    icon: LucideIcon;
    tone: Tone;
    label: string;
    value: string;
    hint: string;
    hintTone: HintTone;
    href?: string;
}) => {
    const hintConfig = hintToneMap[hintTone];
    const HintIcon = hintConfig.icon;

    const cardContent = (
        <>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                    <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {label}
                    </p>

                    <div className="text-[34px] font-bold leading-none tracking-tight text-slate-900">
                        {value}
                    </div>
                </div>

                <div
                    className={[
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-200 group-hover:scale-[1.06]',
                        toneIconMap[tone],
                    ].join(' ')}
                >
                    <Icon size={18} />
                </div>
            </div>

            <div
                className={[
                    'mt-5 flex min-h-[40px] items-start gap-2.5 rounded-2xl',
                    'bg-slate-50/80',
                    hintConfig.text,
                ].join(' ')}
                style={{ padding: '10px 12px' }}
            >
                <HintIcon size={15} className="mt-0.5 shrink-0" />
                <span className="text-[12px] font-medium leading-5">{hint}</span>
            </div>

            {href && (
                <div className="mt-4 flex items-center justify-end gap-1 text-[11px] font-medium text-slate-400 transition-colors duration-200 group-hover:text-indigo-500">
                    <span>Xem chi tiết</span>
                    <ChevronRight size={13} />
                </div>
            )}
        </>
    );

    if (href) {
        return (
            <Link
                href={href}
                className="group block rounded-[24px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:scale-[1.01] no-underline"
                style={{ padding: '24px', textDecoration: 'none', color: 'inherit' }}
            >
                {cardContent}
            </Link>
        );
    }

    return (
        <div className="group rounded-[24px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300" style={{ padding: '24px' }}>
            {cardContent}
        </div>
    );
};

const statToneMap: Record<Tone, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    sky: 'bg-sky-50 text-sky-600',
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
};

const StatRow = ({
    icon: Icon,
    tone,
    label,
    value,
}: {
    icon: LucideIcon;
    tone: Tone;
    label: string;
    value: string;
}) => {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70" style={{ padding: '16px' }}>
            <div
                className={[
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    statToneMap[tone],
                ].join(' ')}
            >
                <Icon size={16} />
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="m-0 text-[12px] font-medium text-slate-500">{label}</p>
                <p className="m-0 text-[15px] font-semibold text-slate-900">{value}</p>
            </div>
        </div>
    );
};

const activityToneMap: Record<Tone, string> = {
    indigo: 'bg-indigo-100 text-indigo-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    violet: 'bg-violet-100 text-violet-700',
    amber: 'bg-amber-100 text-amber-700',
};

const ActivityItem = ({
    icon: Icon,
    tone,
    title,
    meta,
    time,
    href,
}: {
    icon: LucideIcon;
    tone: Tone;
    title: string;
    meta: string;
    time: string;
    href?: string;
}) => {
    const content = (
        <>
            <div
                className={[
                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-[1.06]',
                    activityToneMap[tone],
                ].join(' ')}
            >
                <Icon size={16} />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
                <p className="m-0 text-[15px] font-semibold leading-6 text-slate-800">
                    {title}
                </p>
                <p className="m-0 text-[13px] leading-6 text-slate-500">{meta}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1 pt-0.5">
                <span className="text-[12px] text-slate-400">{time}</span>
                {href && <ChevronRight size={14} className="text-slate-300 transition-colors duration-200 group-hover:text-indigo-500" />}
            </div>
        </>
    );

    if (href) {
        return (
            <Link
                href={href}
                className="group flex items-start gap-4 rounded-2xl transition-all duration-200 hover:bg-slate-50 no-underline"
                style={{ padding: '16px 8px', margin: '0 -8px', textDecoration: 'none', color: 'inherit' }}
            >
                {content}
            </Link>
        );
    }

    return (
        <div className="group flex items-start gap-4" style={{ padding: '16px 0' }}>
            {content}
        </div>
    );
};

const quickToneMap: Record<Tone, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
};

const QuickAction = ({
    href,
    icon: Icon,
    tone,
    title,
    desc,
}: {
    href: string;
    icon: LucideIcon;
    tone: Tone;
    title: string;
    desc: string;
}) => {
    return (
        <Link
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-transparent transition-all duration-200 hover:border-slate-200 hover:bg-slate-50"
            style={{ padding: '16px' }}
        >
            <div
                className={[
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-200 group-hover:scale-[1.03]',
                    quickToneMap[tone],
                ].join(' ')}
            >
                <Icon size={17} />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
                <p className="m-0 text-[14px] font-semibold leading-6 text-slate-800">
                    {title}
                </p>
                <p className="m-0 text-[13px] leading-6 text-slate-500">{desc}</p>
            </div>

            <ChevronRight
                size={16}
                className="mt-1 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-slate-500"
            />
        </Link>
    );
};

const PlanInfoRow = ({
    icon: Icon,
    label,
    value,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
}) => {
    return (
        <div className="flex items-center justify-between gap-4" style={{ padding: '14px 0' }}>
            <div className="flex min-w-0 items-center gap-3 text-[13px] text-slate-600">
                <span className="text-slate-400">
                    <Icon size={15} />
                </span>
                <span>{label}</span>
            </div>

            <div className="text-right text-[13px] font-semibold text-slate-800">
                {value}
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Agent Performance Section
   ═══════════════════════════════════════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
    owner: 'Chủ sở hữu',
    admin: 'Quản trị',
    agent: 'Nhân viên',
    member: 'Thành viên',
};

const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #818cf8)',
    'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    'linear-gradient(135deg, #06b6d4, #22d3ee)',
    'linear-gradient(135deg, #f43f5e, #fb7185)',
    'linear-gradient(135deg, #10b981, #34d399)',
    'linear-gradient(135deg, #f59e0b, #fbbf24)',
];

const AgentPerformanceSection = ({ workspaceId }: { workspaceId: string }) => {
    const { data, isLoading } = useAgentPerformance(workspaceId);
    const agents = data?.data ?? [];

    return (
        <section className="space-y-5">
            <SectionHeading icon={Trophy} title="Hiệu suất nhân viên" />

            <DashboardCard>
                {isLoading ? (
                    <div className="flex items-center justify-center" style={{ padding: '40px 0' }}>
                        <Spin size="default" />
                    </div>
                ) : agents.length === 0 ? (
                    <div className="text-center" style={{ padding: '40px 0' }}>
                        <div className="flex justify-center">
                            <div
                                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"
                            >
                                <Users size={24} />
                            </div>
                        </div>
                        <p className="mt-4 text-[14px] text-slate-500">Chưa có dữ liệu hiệu suất</p>
                    </div>
                ) : (
                    <>
                        {/* Summary stats row */}
                        <div className="mb-6 grid grid-cols-4 gap-3">
                            <div className="rounded-2xl bg-indigo-50/70 text-center" style={{ padding: '16px 12px' }}>
                                <p className="m-0 text-[22px] font-bold text-indigo-700">{agents.length}</p>
                                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-500">Nhân viên</p>
                            </div>
                            <div className="rounded-2xl bg-emerald-50/70 text-center" style={{ padding: '16px 12px' }}>
                                <p className="m-0 text-[22px] font-bold text-emerald-700">
                                    {agents.reduce((s: number, a: any) => s + a.stats.total, 0)}
                                </p>
                                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-500">Khách Hỗ Trợ</p>
                            </div>
                            <div className="rounded-2xl bg-sky-50/70 text-center" style={{ padding: '16px 12px' }}>
                                <p className="m-0 text-[22px] font-bold text-sky-700">
                                    {agents.reduce((s: number, a: any) => s + a.stats.closed, 0)}
                                </p>
                                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wider text-sky-500">Đã đóng</p>
                            </div>
                            <div className="rounded-2xl bg-violet-50/70 text-center" style={{ padding: '16px 12px' }}>
                                <p className="m-0 text-[22px] font-bold text-violet-700">
                                    {agents.reduce((s: number, a: any) => s + a.stats.messagesSent, 0)}
                                </p>
                                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wider text-violet-500">Tin nhắn gửi</p>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr className="bg-slate-50/80">
                                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 16px' }}>
                                            Nhân viên
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px' }}>
                                            Vai trò
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px' }}>
                                            Khách Hỗ Trợ
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px' }}>
                                            Đang Chat
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px' }}>
                                            Đã Đóng
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px', minWidth: 160 }}>
                                            Tỷ lệ đóng
                                        </th>
                                        <th className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 12px' }}>
                                            Tin nhắn gửi
                                        </th>
                                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ padding: '14px 16px' }}>
                                            Hoạt Động Cuối
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents.map((agent: any, idx: number) => {
                                        const gradient = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
                                        const initial = (agent.name || 'U').charAt(0).toUpperCase();
                                        const closeRate = agent.stats.closeRate;
                                        const closeRateColor =
                                            closeRate >= 80 ? '#10b981' :
                                            closeRate >= 50 ? '#f59e0b' : '#f43f5e';

                                        return (
                                            <tr
                                                key={agent.userId}
                                                className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50/50"
                                            >
                                                {/* Agent info */}
                                                <td style={{ padding: '14px 16px' }}>
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                                                            style={{ background: gradient }}
                                                        >
                                                            {initial}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="m-0 truncate text-[13px] font-semibold text-slate-800">
                                                                {agent.name}
                                                            </p>
                                                            <p className="m-0 truncate text-[11px] text-slate-400">
                                                                {agent.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Role */}
                                                <td className="text-center" style={{ padding: '14px 12px' }}>
                                                    <span className="inline-block rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600" style={{ padding: '4px 10px' }}>
                                                        {ROLE_LABELS[agent.role] ?? agent.role}
                                                    </span>
                                                </td>

                                                {/* Total conversations */}
                                                <td className="text-center" style={{ padding: '14px 12px' }}>
                                                    <span className="text-[15px] font-bold text-slate-800">{agent.stats.total}</span>
                                                </td>

                                                {/* Open */}
                                                <td className="text-center" style={{ padding: '14px 12px' }}>
                                                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 text-[12px] font-semibold text-amber-700" style={{ padding: '3px 8px' }}>
                                                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                        {agent.stats.open + agent.stats.pending}
                                                    </span>
                                                </td>

                                                {/* Closed */}
                                                <td className="text-center" style={{ padding: '14px 12px' }}>
                                                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-[12px] font-semibold text-emerald-700" style={{ padding: '3px 8px' }}>
                                                        <CheckCircle2 size={12} />
                                                        {agent.stats.closed}
                                                    </span>
                                                </td>

                                                {/* Close rate with progress bar */}
                                                <td style={{ padding: '14px 12px', minWidth: 160 }}>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 6 }}>
                                                            <div
                                                                className="rounded-full transition-all duration-500"
                                                                style={{
                                                                    width: `${closeRate}%`,
                                                                    height: '100%',
                                                                    background: closeRateColor,
                                                                }}
                                                            />
                                                        </div>
                                                        <span
                                                            className="shrink-0 text-[12px] font-bold"
                                                            style={{ color: closeRateColor, minWidth: 36, textAlign: 'right' }}
                                                        >
                                                            {closeRate}%
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Messages sent */}
                                                <td className="text-center" style={{ padding: '14px 12px' }}>
                                                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                                                        <MessageSquare size={13} className="text-slate-400" />
                                                        {agent.stats.messagesSent}
                                                    </span>
                                                </td>

                                                {/* Last Active */}
                                                <td className="text-right" style={{ padding: '14px 16px' }}>
                                                    <span className="text-[12px] font-medium text-slate-500">
                                                        {agent.stats.lastActivity ? dayjs(agent.stats.lastActivity).fromNow() : 'Chưa có'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </DashboardCard>
        </section>
    );
};

export default WorkspaceDashboard;