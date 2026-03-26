import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Spin, message } from 'antd';
import {
    Activity, AlertTriangle, Bot, Brain, CheckCircle2,
    Cpu, Database, Globe, HardDrive, Inbox, Layers, MessageSquare,
    Monitor, RefreshCw, Server, Shield, Users, Zap, Clock,
    BarChart3, Box, Hash, ToggleLeft, ToggleRight, Eye, Settings,
    type LucideIcon,
} from 'lucide-react';
import { httpClient } from '../lib/http/client';
import { useGetMe } from '../domains/auth/auth.hooks';
import AppLayout from '../components/layout/AppLayout';

/* ────────────────────────── Types ────────────────────────── */
interface Overview {
    collections: Record<string, number>;
    conversationStats: { open: number; closed: number; pending: number; total: number };
    botStats: { total: number; active: number };
    recentActivity: { messagesToday: number; conversationsToday: number; visitorsToday: number };
    server: {
        uptime: number; uptimeFormatted: string; memoryUsed: number; memoryTotal: number;
        platform: string; hostname: string; nodeVersion: string; cpus: number; totalRAM: number; freeRAM: number;
    };
    database: { name: string; collections: number; dataSize: number; storageSize: number; indexes: number };
    ai: { apiUrl: string; model: string };
}

interface AIHealth {
    status: 'online' | 'offline';
    latency: number;
    models: Array<{ id: string; owned_by: string }>;
    modelCount: number;
}

interface CollectionInfo { name: string; count: number }
interface BotInfo { _id: string; name: string; isActive: boolean; isDraft: boolean; aiModel?: string; createdAt: string }

type Tab = 'overview' | 'database' | 'ai' | 'bots';
type Tone = 'indigo' | 'sky' | 'violet' | 'emerald' | 'amber' | 'rose';

/* ────────────────────────── Helpers ────────────────────────── */
const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

const toneClasses: Record<Tone, { bg: string; text: string; ring: string; iconBg: string }> = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', ring: 'ring-indigo-100', iconBg: 'bg-indigo-600' },
    sky: { bg: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-100', iconBg: 'bg-sky-600' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100', iconBg: 'bg-violet-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100', iconBg: 'bg-emerald-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100', iconBg: 'bg-amber-600' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-100', iconBg: 'bg-rose-600' },
};

/* ────────────────────────── Page ────────────────────────── */
const AdminPanel: React.FC = () => {
    const router = useRouter();
    const { data: meData, isLoading: meLoading } = useGetMe(true);
    const user = meData?.data?.user;

    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [aiHealth, setAIHealth] = useState<AIHealth | null>(null);
    const [collections, setCollections] = useState<CollectionInfo[]>([]);
    const [bots, setBots] = useState<BotInfo[]>([]);
    const [tab, setTab] = useState<Tab>('overview');

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, ai, colls, botList] = await Promise.all([
                httpClient.get('/admin/overview').then(r => r.data?.data),
                httpClient.get('/admin/ai/health').then(r => r.data?.data).catch(() => ({ status: 'offline', latency: -1, models: [], modelCount: 0 })),
                httpClient.get('/admin/collections').then(r => r.data?.data || []),
                httpClient.get('/admin/bots').then(r => r.data?.data || []),
            ]);
            setOverview(ov); setAIHealth(ai); setCollections(colls); setBots(botList);
        } catch {
            message.error('Không thể tải dữ liệu admin');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!meLoading && user) {
            if (user.role !== 'admin') {
                message.error('Bạn không có quyền truy cập trang này');
                router.push('/');
                return;
            }
            fetchAll();
        }
    }, [meLoading, user, fetchAll, router]);

    const toggleBot = async (botId: string, active: boolean) => {
        try {
            await httpClient.patch(`/admin/bots/${botId}/toggle`, { isActive: active });
            message.success(active ? 'Bot đã kích hoạt' : 'Bot đã tắt');
            setBots(prev => prev.map(b => b._id === botId ? { ...b, isActive: active, isDraft: !active } : b));
        } catch {
            message.error('Lỗi cập nhật bot');
        }
    };

    if (meLoading || !user) {
        return <div className="flex min-h-[70vh] items-center justify-center"><Spin size="large" /></div>;
    }

    if (user.role !== 'admin') return null;

    if (loading || !overview) {
        return (
            <AppLayout>
                <div className="flex min-h-[70vh] items-center justify-center"><Spin size="large" /></div>
            </AppLayout>
        );
    }

    const o = overview;
    const s = o.server;
    const db = o.database;
    const memPct = s.memoryTotal > 0 ? Math.round((s.memoryUsed / s.memoryTotal) * 100) : 0;

    const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
        { key: 'overview', label: 'Tổng quan', icon: BarChart3 },
        { key: 'database', label: 'Database', icon: Database },
        { key: 'ai', label: 'AI Engine', icon: Brain },
        { key: 'bots', label: 'Bots', icon: Bot },
    ];

    return (
        <AppLayout>
            <Head><title>Admin Panel — NemarkChat</title></Head>

            <div className="mx-auto max-w-[1380px]" style={{ padding: '24px 16px 64px' }}>
                <div className="space-y-6">
                    {/* ── Header ── */}
                    <header className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]" style={{ padding: '24px 28px' }}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)]">
                                    <Shield size={22} />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <h1 className="m-0 text-[26px] font-semibold tracking-tight text-slate-900">
                                        Super Admin Panel
                                    </h1>
                                    <p className="m-0 text-[13px] text-slate-500">
                                        Quản trị toàn hệ thống NemarkChat • {user.email}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={fetchAll}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition-all duration-200 hover:bg-indigo-700"
                                style={{ border: 'none', cursor: 'pointer' }}
                            >
                                <RefreshCw size={16} /> Làm mới
                            </button>
                        </div>
                    </header>

                    {/* ── Tab Nav ── */}
                    <div className="flex items-center gap-2 px-1">
                        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50" style={{ padding: '4px' }}>
                            {tabs.map(t => {
                                const active = tab === t.key;
                                return (
                                    <button
                                        key={t.key}
                                        onClick={() => setTab(t.key)}
                                        className={[
                                            'inline-flex items-center gap-2 rounded-xl text-[13px] font-medium transition-all duration-200',
                                            active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                                        ].join(' ')}
                                        style={{ padding: '8px 18px', border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent' }}
                                    >
                                        <t.icon size={15} /> {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Overview Tab ── */}
                    {tab === 'overview' && (
                        <>
                            <SectionHeading icon={Activity} title="Vận hành thời gian thực" />

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <KPICard icon={MessageSquare} tone="indigo" label="Tổng hội thoại" value={fmt(o.collections.conversations)} hint={`${o.conversationStats.open} đang mở`} />
                                <KPICard icon={Inbox} tone="sky" label="Tổng tin nhắn" value={fmt(o.collections.messages)} hint={`${fmt(o.recentActivity.messagesToday)} tin hôm nay`} />
                                <KPICard icon={Users} tone="violet" label="Visitors" value={fmt(o.collections.visitors)} hint={`${fmt(o.recentActivity.visitorsToday)} mới hôm nay`} />
                                <KPICard icon={Bot} tone="emerald" label="AI Bots" value={`${o.botStats.active}/${o.botStats.total}`} hint={`${o.botStats.active} bot đang hoạt động`} />
                            </div>

                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                                {/* Activity */}
                                <DashboardCard>
                                    <CardTitle>Hoạt động 24h qua</CardTitle>
                                    <p className="m-0 mb-4 text-[13px] text-slate-500">Tổng hợp dữ liệu trong 24 giờ gần nhất</p>
                                    <div className="space-y-3">
                                        <StatRow icon={MessageSquare} tone="indigo" label="Tin nhắn mới" value={fmt(o.recentActivity.messagesToday)} />
                                        <StatRow icon={Inbox} tone="sky" label="Hội thoại mới" value={fmt(o.recentActivity.conversationsToday)} />
                                        <StatRow icon={Eye} tone="violet" label="Khách mới" value={fmt(o.recentActivity.visitorsToday)} />
                                        <StatRow icon={CheckCircle2} tone="emerald" label="Đã đóng" value={fmt(o.conversationStats.closed)} />
                                    </div>
                                </DashboardCard>

                                {/* Server */}
                                <DashboardCard>
                                    <CardTitle>Máy chủ</CardTitle>
                                    <p className="m-0 mb-4 text-[13px] text-slate-500">Thông tin hệ thống runtime</p>
                                    <div className="space-y-3">
                                        <StatRow icon={Clock} tone="sky" label="Uptime" value={s.uptimeFormatted} />
                                        <StatRow icon={Cpu} tone="amber" label="CPU Cores" value={String(s.cpus)} />
                                        <StatRow icon={HardDrive} tone="violet" label="RAM" value={`${s.freeRAM}GB free / ${s.totalRAM}GB`} />
                                        <StatRow icon={Monitor} tone="indigo" label="Heap" value={`${s.memoryUsed}MB / ${s.memoryTotal}MB (${memPct}%)`} />
                                        <StatRow icon={Server} tone="emerald" label="Node.js" value={s.nodeVersion} />
                                        <StatRow icon={Globe} tone="sky" label="Host" value={`${s.hostname} (${s.platform})`} />
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* Data Summary */}
                            <DashboardCard>
                                <CardTitle>Tổng dữ liệu hệ thống</CardTitle>
                                <p className="m-0 mb-4 text-[13px] text-slate-500">Số lượng documents trong các collection chính</p>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                                    {Object.entries(o.collections).map(([key, val]) => (
                                        <div key={key} className="rounded-2xl border border-slate-200/70 bg-slate-50/70" style={{ padding: '14px 16px' }}>
                                            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{key}</p>
                                            <p className="m-0 mt-1 text-[22px] font-bold leading-none text-slate-900">{fmt(val)}</p>
                                        </div>
                                    ))}
                                </div>
                            </DashboardCard>
                        </>
                    )}

                    {/* ── Database Tab ── */}
                    {tab === 'database' && (
                        <>
                            <SectionHeading icon={Database} title="MongoDB" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                                <KPICard icon={Database} tone="indigo" label="Database" value={db.name} hint="MongoDB instance" />
                                <KPICard icon={Layers} tone="sky" label="Collections" value={String(db.collections)} hint={`${collections.length} tracked`} />
                                <KPICard icon={HardDrive} tone="violet" label="Data Size" value={`${db.dataSize} MB`} hint="Data footprint" />
                                <KPICard icon={Box} tone="emerald" label="Storage" value={`${db.storageSize} MB`} hint="Disk allocated" />
                                <KPICard icon={Hash} tone="amber" label="Indexes" value={String(db.indexes)} hint="Total indexes" />
                            </div>

                            <DashboardCard className="overflow-hidden">
                                <CardTitle>Tất cả Collections</CardTitle>
                                <p className="m-0 mb-4 text-[13px] text-slate-500">Danh sách collections sắp xếp theo số documents</p>
                                <div className="overflow-auto">
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr className="border-b border-slate-100">
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">#</th>
                                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Collection</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Documents</th>
                                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Tỷ trọng</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {collections.map((c, i) => {
                                                const totalDocs = collections.reduce((sum, x) => sum + x.count, 0);
                                                const pct = totalDocs > 0 ? ((c.count / totalDocs) * 100).toFixed(1) : '0';
                                                return (
                                                    <tr key={c.name} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                                                        <td className="px-4 py-3 text-[13px] text-slate-400">{i + 1}</td>
                                                        <td className="px-4 py-3 text-[14px] font-semibold text-slate-800">{c.name}</td>
                                                        <td className="px-4 py-3 text-right text-[14px] font-bold text-indigo-600">{fmt(c.count)}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                                                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, parseFloat(pct))}%` }} />
                                                                </div>
                                                                <span className="text-[12px] text-slate-500" style={{ minWidth: 40 }}>{pct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </DashboardCard>
                        </>
                    )}

                    {/* ── AI Engine Tab ── */}
                    {tab === 'ai' && (
                        <>
                            <SectionHeading icon={Brain} title="AI Engine" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <KPICard
                                    icon={aiHealth?.status === 'online' ? CheckCircle2 : AlertTriangle}
                                    tone={aiHealth?.status === 'online' ? 'emerald' : 'rose'}
                                    label="API Status"
                                    value={aiHealth?.status === 'online' ? 'Online' : 'Offline'}
                                    hint={aiHealth?.status === 'online' ? 'Kết nối thành công' : 'Không thể kết nối'}
                                />
                                <KPICard icon={Zap} tone="amber" label="Latency" value={aiHealth?.latency != null && aiHealth.latency >= 0 ? `${aiHealth.latency}ms` : 'N/A'} hint="Thời gian phản hồi" />
                                <KPICard icon={Brain} tone="violet" label="Models" value={String(aiHealth?.modelCount || 0)} hint="Số model khả dụng" />
                                <KPICard icon={Settings} tone="indigo" label="Default Model" value={o.ai.model} hint="Model mặc định" />
                            </div>

                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                                {/* Models Grid */}
                                {aiHealth?.models && aiHealth.models.length > 0 && (
                                    <DashboardCard>
                                        <CardTitle>Models khả dụng ({aiHealth.models.length})</CardTitle>
                                        <p className="m-0 mb-4 text-[13px] text-slate-500">Danh sách models từ AI API</p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {aiHealth.models.map(m => {
                                                const isActive = m.id === o.ai.model;
                                                return (
                                                    <div key={m.id} className={[
                                                        'flex items-center justify-between rounded-2xl border transition-all',
                                                        isActive ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200/70 bg-slate-50/50',
                                                    ].join(' ')} style={{ padding: '12px 16px' }}>
                                                        <div>
                                                            <p className="m-0 text-[14px] font-semibold text-slate-800">{m.id}</p>
                                                            <p className="m-0 text-[11px] text-slate-400">{m.owned_by}</p>
                                                        </div>
                                                        {isActive && (
                                                            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-700">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </DashboardCard>
                                )}

                                {/* API Config */}
                                <DashboardCard>
                                    <CardTitle>Cấu hình API</CardTitle>
                                    <p className="m-0 mb-4 text-[13px] text-slate-500">Thông tin kết nối AI Engine</p>
                                    <div className="space-y-3">
                                        <StatRow icon={Globe} tone="indigo" label="API URL" value={o.ai.apiUrl} />
                                        <StatRow icon={Brain} tone="violet" label="Model" value={o.ai.model} />
                                        <StatRow icon={Activity} tone={aiHealth?.status === 'online' ? 'emerald' : 'rose'} label="Status" value={aiHealth?.status === 'online' ? '✅ Connected' : '❌ Disconnected'} />
                                        {aiHealth?.latency != null && aiHealth.latency >= 0 && (
                                            <StatRow icon={Zap} tone="amber" label="Ping" value={`${aiHealth.latency}ms`} />
                                        )}
                                    </div>
                                </DashboardCard>
                            </div>
                        </>
                    )}

                    {/* ── Bots Tab ── */}
                    {tab === 'bots' && (
                        <>
                            <SectionHeading icon={Bot} title="Quản lý Bots" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <KPICard icon={Bot} tone="indigo" label="Tổng bots" value={String(bots.length)} hint="Tất cả bots trong hệ thống" />
                                <KPICard icon={CheckCircle2} tone="emerald" label="Đang hoạt động" value={String(bots.filter(b => b.isActive).length)} hint="Bots đang auto-reply" />
                                <KPICard icon={AlertTriangle} tone="amber" label="Draft / Tắt" value={String(bots.filter(b => !b.isActive).length)} hint="Bots chưa kích hoạt" />
                            </div>

                            <DashboardCard>
                                <CardTitle>Danh sách Bots</CardTitle>
                                {bots.length === 0 ? (
                                    <p className="m-0 text-[14px] text-slate-500">Chưa có bot nào. Tạo bot từ menu "Nhân viên AI".</p>
                                ) : (
                                    <div className="space-y-3 mt-4">
                                        {bots.map(bot => (
                                            <div key={bot._id} className={[
                                                'flex items-center justify-between rounded-2xl border transition-all',
                                                bot.isActive ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200/70 bg-slate-50/50',
                                            ].join(' ')} style={{ padding: '18px 20px' }}>
                                                <div className="flex items-center gap-3.5">
                                                    <div className={[
                                                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white',
                                                        bot.isActive ? 'bg-emerald-500 shadow-[0_8px_20px_rgba(34,197,94,0.25)]' : 'bg-slate-300',
                                                    ].join(' ')}>
                                                        <Bot size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="m-0 text-[15px] font-semibold text-slate-800">{bot.name}</p>
                                                        <p className="m-0 text-[12px] text-slate-400">
                                                            Model: {bot.aiModel || 'default'} • {new Date(bot.createdAt).toLocaleDateString('vi-VN')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={[
                                                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
                                                        bot.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500',
                                                    ].join(' ')}>
                                                        <span className={`h-2 w-2 rounded-full ${bot.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                        {bot.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                    <button
                                                        onClick={() => toggleBot(bot._id, !bot.isActive)}
                                                        className={[
                                                            'inline-flex h-9 items-center gap-1.5 rounded-xl border px-4 text-[12px] font-semibold transition-all duration-200',
                                                            bot.isActive
                                                                ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                                                                : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
                                                        ].join(' ')}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {bot.isActive ? <><ToggleRight size={14} /> Tắt</> : <><ToggleLeft size={14} /> Bật</>}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </DashboardCard>
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};

/* ────────────────────────── Sub Components ────────────────────────── */

const DashboardCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div
        className={['rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]', className].join(' ')}
        style={{ padding: '28px' }}
    >
        {children}
    </div>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="m-0 text-[18px] font-semibold leading-7 tracking-tight text-slate-900">{children}</h2>
);

const SectionHeading = ({ icon: Icon, title }: { icon: LucideIcon; title: string }) => (
    <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon size={16} />
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</span>
    </div>
);

const KPICard = ({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: Tone; label: string; value: string; hint: string }) => {
    const tc = toneClasses[tone];
    return (
        <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]" style={{ padding: '24px' }}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                    <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                    <div className="text-[28px] font-bold leading-none tracking-tight text-slate-900">{value}</div>
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tc.bg} ${tc.text} ${tc.ring}`}>
                    <Icon size={18} />
                </div>
            </div>
            <p className="m-0 mt-4 text-[12px] font-medium text-slate-400">{hint}</p>
        </div>
    );
};

const StatRow = ({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: string }) => {
    const tc = toneClasses[tone];
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70" style={{ padding: '14px 16px' }}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tc.bg} ${tc.text}`}>
                <Icon size={15} />
            </div>
            <span className="flex-1 text-[13px] font-medium text-slate-600">{label}</span>
            <span className="text-[13px] font-semibold text-slate-800" style={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
};

export default AdminPanel;
