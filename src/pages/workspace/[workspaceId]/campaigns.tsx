import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import {
    Input, Select, Slider, Switch, Modal, DatePicker, InputNumber,
    message, Spin
} from 'antd';
import {
    Megaphone, Plus, Play, Pause, Trash2, Eye, Users, Send, Clock, Shield,
    CheckCircle, XCircle, AlertTriangle, ArrowLeft, Filter, UserCheck, ChevronRight,
    BarChart3, Zap, Radio
} from 'lucide-react';
import AppLayout from '../../../components/layout/AppLayout';
import { httpClient } from '../../../lib/http/client';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface Campaign {
    _id: string;
    name: string;
    status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
    messages: string[];
    audience: {
        type: 'all' | 'filter' | 'manual';
        filters?: { source?: string; minMessages?: number; lastActiveWithinDays?: number };
        manualIds?: string[];
    };
    schedule: { startAt: string; sendWindow?: { startHour: number; endHour: number } };
    antiSpam: { delayBetweenMs: number; maxPerHour: number; randomizeDelay: boolean };
    stats: { total: number; sent: number; failed: number; pending: number };
    createdAt: string;
    liveProgress?: { sent: number; failed: number; total: number; status: string; estimatedRemainingMs?: number };
}

interface WorkspaceStats {
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalFailed: number;
}

type View = 'list' | 'create' | 'detail';

/* ─── Tone helpers ─── */
type Tone = 'indigo' | 'sky' | 'rose' | 'emerald' | 'violet' | 'amber';
const toneIcon: Record<Tone, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
    sky: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    rose: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    amber: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
};
const toneText: Record<Tone, string> = {
    indigo: 'text-indigo-700', sky: 'text-sky-700', rose: 'text-rose-700',
    emerald: 'text-emerald-700', violet: 'text-violet-700', amber: 'text-amber-700',
};
const toneBg: Record<Tone, string> = {
    indigo: 'bg-indigo-50 border-indigo-200', sky: 'bg-sky-50 border-sky-200',
    rose: 'bg-rose-50 border-rose-200', emerald: 'bg-emerald-50 border-emerald-200',
    violet: 'bg-violet-50 border-violet-200', amber: 'bg-amber-50 border-amber-200',
};

/* ─── Reusable Atoms ─── */
const DCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div
        className={`rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] ${className}`}
        style={{ padding: 28 }}
    >
        {children}
    </div>
);

const SectionLabel = ({ icon: Icon, label }: { icon: React.FC<any>; label: string }) => (
    <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon size={16} />
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
    </div>
);

const StatusBadge = ({ status, text, tone }: { status: string; text: string; tone: Tone }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${toneBg[tone]} ${toneText[tone]}`}>
        <span className={`h-2 w-2 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: 'currentColor' }} />
        {text}
    </span>
);

const IconBtn = ({
    icon: Icon, label, onClick, tone = 'indigo', danger = false, primary = false, size = 36,
}: {
    icon: React.FC<any>; label: string; onClick?: () => void; tone?: Tone; danger?: boolean; primary?: boolean; size?: number;
}) => (
    <button
        title={label}
        onClick={onClick}
        className={[
            'inline-flex items-center justify-center rounded-xl border transition-all duration-200',
            danger
                ? 'border-rose-200 bg-white text-rose-500 hover:bg-rose-50 hover:border-rose-300'
                : primary
                    ? 'border-transparent bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.25)] hover:bg-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300',
        ].join(' ')}
        style={{ width: size, height: size }}
    >
        <Icon size={15} />
    </button>
);

export default function CampaignsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;

    const [view, setView] = useState<View>('list');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [stats, setStats] = useState<WorkspaceStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

    // Wizard state
    const [step, setStep] = useState(0);
    const [formName, setFormName] = useState('');
    const [formMessages, setFormMessages] = useState<string[]>(['']);
    const [audienceType, setAudienceType] = useState<'all' | 'filter' | 'manual'>('all');
    const [filterSource, setFilterSource] = useState<string | undefined>();
    const [filterMinMessages, setFilterMinMessages] = useState<number>(0);
    const [filterLastActiveDays, setFilterLastActiveDays] = useState<number>(90);
    const [manualIds, setManualIds] = useState<string[]>([]);
    const [scheduleStartAt, setScheduleStartAt] = useState(dayjs().add(1, 'hour'));
    const [sendWindowEnabled, setSendWindowEnabled] = useState(true);
    const [sendWindowStart, setSendWindowStart] = useState(8);
    const [sendWindowEnd, setSendWindowEnd] = useState(21);
    const [antiSpamDelay, setAntiSpamDelay] = useState(8);
    const [antiSpamMaxPerHour, setAntiSpamMaxPerHour] = useState(30);
    const [antiSpamRandomize, setAntiSpamRandomize] = useState(true);
    const [creating, setCreating] = useState(false);

    // Load data
    const loadCampaigns = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);
        try {
            const [campRes, statsRes] = await Promise.all([
                httpClient.get(`/workspaces/${workspaceId}/campaigns`),
                httpClient.get(`/workspaces/${workspaceId}/campaigns/stats`),
            ]);
            setCampaigns(campRes.data?.data?.items || []);
            setStats(statsRes.data?.data || null);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [workspaceId]);

    useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

    // Poll progress for running campaigns
    useEffect(() => {
        const running = campaigns.filter(c => c.status === 'running');
        if (running.length === 0) return;
        const interval = setInterval(async () => {
            try {
                const res = await httpClient.get(`/workspaces/${workspaceId}/campaigns`);
                setCampaigns(res.data?.data?.items || []);
            } catch { /* silent */ }
        }, 5000);
        return () => clearInterval(interval);
    }, [campaigns, workspaceId]);

    // Actions
    const handleStartCampaign = async (id: string) => {
        try {
            await httpClient.post(`/workspaces/${workspaceId}/campaigns/${id}/start`);
            message.success('Campaign đã bắt đầu gửi!');
            loadCampaigns();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Lỗi khi bắt đầu campaign');
        }
    };

    const handlePause = async (id: string) => {
        try {
            await httpClient.post(`/workspaces/${workspaceId}/campaigns/${id}/pause`);
            message.success('Đã tạm dừng');
            loadCampaigns();
        } catch { message.error('Lỗi'); }
    };

    const handleResume = async (id: string) => {
        try {
            await httpClient.post(`/workspaces/${workspaceId}/campaigns/${id}/resume`);
            message.success('Đã tiếp tục');
            loadCampaigns();
        } catch { message.error('Lỗi'); }
    };

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: 'Xóa campaign?',
            content: 'Hành động này không thể hoàn tác.',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await httpClient.delete(`/workspaces/${workspaceId}/campaigns/${id}`);
                    message.success('Đã xóa');
                    loadCampaigns();
                } catch { message.error('Lỗi khi xóa'); }
            },
        });
    };

    const handleCreateCampaign = async () => {
        if (!formName.trim()) { message.warning('Cần đặt tên campaign'); return; }
        if (!formMessages.filter(m => m.trim()).length) { message.warning('Cần ít nhất 1 tin nhắn'); return; }

        setCreating(true);
        try {
            await httpClient.post(`/workspaces/${workspaceId}/campaigns`, {
                name: formName,
                messages: formMessages.filter(m => m.trim()),
                audience: {
                    type: audienceType,
                    filters: audienceType === 'filter' ? {
                        source: filterSource,
                        minMessages: filterMinMessages || undefined,
                        lastActiveWithinDays: filterLastActiveDays || undefined,
                    } : undefined,
                    manualIds: audienceType === 'manual' ? manualIds : undefined,
                },
                schedule: {
                    startAt: scheduleStartAt.toISOString(),
                    sendWindow: sendWindowEnabled ? { startHour: sendWindowStart, endHour: sendWindowEnd } : undefined,
                },
                antiSpam: {
                    delayBetweenMs: antiSpamDelay * 1000,
                    maxPerHour: antiSpamMaxPerHour,
                    randomizeDelay: antiSpamRandomize,
                },
            });
            message.success('Campaign đã tạo thành công!');
            setView('list');
            resetForm();
            loadCampaigns();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Lỗi khi tạo campaign');
        }
        finally { setCreating(false); }
    };

    const resetForm = () => {
        setStep(0); setFormName(''); setFormMessages(['']);
        setAudienceType('all'); setFilterSource(undefined);
        setFilterMinMessages(0); setFilterLastActiveDays(90);
        setManualIds([]); setScheduleStartAt(dayjs().add(1, 'hour'));
        setSendWindowEnabled(true); setAntiSpamDelay(8);
        setAntiSpamMaxPerHour(30); setAntiSpamRandomize(true);
    };

    const statusLookup: Record<string, { text: string; tone: Tone }> = {
        draft: { text: 'Nháp', tone: 'sky' },
        scheduled: { text: 'Đã lên lịch', tone: 'indigo' },
        running: { text: 'Đang gửi', tone: 'emerald' },
        paused: { text: 'Tạm dừng', tone: 'amber' },
        completed: { text: 'Hoàn tất', tone: 'violet' },
        failed: { text: 'Lỗi', tone: 'rose' },
    };

    // ═══════════════════════════════════
    // RENDER: STAT CARDS
    // ═══════════════════════════════════
    const renderStats = () => {
        if (!stats) return null;
        const successRate = stats.totalSent + stats.totalFailed > 0
            ? Math.round((stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100)
            : 0;

        const items: { icon: React.FC<any>; tone: Tone; label: string; value: string | number }[] = [
            { icon: Megaphone, tone: 'indigo', label: 'Tổng Campaigns', value: stats.totalCampaigns },
            { icon: Radio, tone: 'emerald', label: 'Đang hoạt động', value: stats.activeCampaigns },
            { icon: Send, tone: 'sky', label: 'Đã gửi', value: stats.totalSent },
            { icon: CheckCircle, tone: 'amber', label: 'Tỷ lệ thành công', value: `${successRate}%` },
        ];

        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((s, i) => (
                    <div
                        key={i}
                        className="group rounded-[24px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:scale-[1.01]"
                        style={{ padding: 24 }}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-3">
                                <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    {s.label}
                                </p>
                                <div className="text-[34px] font-bold leading-none tracking-tight text-slate-900">
                                    {s.value}
                                </div>
                            </div>
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-[1.06] ${toneIcon[s.tone]}`}>
                                <s.icon size={18} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ═══════════════════════════════════
    // RENDER: CAMPAIGN LIST
    // ═══════════════════════════════════
    const renderList = () => (
        <div className="space-y-6">
            {renderStats()}

            {/* Section Heading */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <SectionLabel icon={Megaphone} label="Chiến dịch gửi tin" />
                <button
                    onClick={() => { resetForm(); setView('create'); }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition-all duration-200 hover:bg-indigo-700 active:scale-[0.97]"
                >
                    <Plus size={16} />
                    Tạo Campaign
                </button>
            </div>

            {loading ? (
                <div className="flex min-h-[40vh] items-center justify-center"><Spin size="large" /></div>
            ) : campaigns.length === 0 ? (
                /* ── Empty State ── */
                <DCard className="text-center">
                    <div className="mx-auto" style={{ maxWidth: 380, padding: '40px 0' }}>
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
                            <Megaphone size={36} className="text-slate-300" strokeWidth={1.5} />
                        </div>
                        <h3 className="m-0 mb-2 text-[18px] font-semibold text-slate-900">Chưa có campaign nào</h3>
                        <p className="m-0 mb-6 text-[14px] leading-6 text-slate-500">
                            Tạo chiến dịch gửi tin nhắn hàng loạt đến khách hàng Zalo của bạn.
                        </p>
                        <button
                            onClick={() => { resetForm(); setView('create'); }}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition-all duration-200 hover:bg-indigo-700"
                        >
                            <Plus size={16} />
                            Tạo campaign đầu tiên
                        </button>
                    </div>
                </DCard>
            ) : (
                /* ── Campaign Table ── */
                <DCard className="overflow-hidden !p-0">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_130px_180px_110px_160px] items-center border-b border-slate-100 bg-slate-50/70 px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        <span>Campaign</span>
                        <span>Trạng thái</span>
                        <span>Tiến trình</span>
                        <span>Đối tượng</span>
                        <span className="text-right">Thao tác</span>
                    </div>

                    {/* Table rows */}
                    <div className="divide-y divide-slate-100">
                        {campaigns.map(c => {
                            const cfg = statusLookup[c.status] || statusLookup.draft;
                            const pct = c.stats.total > 0 ? Math.round(((c.stats.sent + c.stats.failed) / c.stats.total) * 100) : 0;
                            return (
                                <div
                                    key={c._id}
                                    className="group grid grid-cols-[1fr_130px_180px_110px_160px] items-center px-6 py-4 transition-colors duration-150 hover:bg-slate-50/60"
                                >
                                    {/* Name */}
                                    <div className="min-w-0">
                                        <p className="m-0 truncate text-[14px] font-semibold text-slate-900">{c.name}</p>
                                        <p className="m-0 mt-0.5 text-[12px] text-slate-400">
                                            {c.messages.length} tin nhắn · {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                                        </p>
                                    </div>

                                    {/* Status */}
                                    <div>
                                        <StatusBadge status={c.status} text={cfg.text} tone={cfg.tone} />
                                    </div>

                                    {/* Progress */}
                                    <div>
                                        {c.stats.total === 0 ? (
                                            <span className="text-[13px] text-slate-300">—</span>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                    <div
                                                        className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="m-0 text-[11px] text-slate-400">
                                                    ✓ {c.stats.sent} · ✗ {c.stats.failed} · ⏳ {c.stats.pending}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Audience */}
                                    <div>
                                        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-600">
                                            {c.audience.type === 'all' ? '👥 Tất cả' : c.audience.type === 'filter' ? '🔍 Bộ lọc' : '✋ Chọn tay'}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-end gap-2">
                                        {c.status === 'draft' && (
                                            <IconBtn icon={Play} label="Bắt đầu gửi" primary onClick={() => handleStartCampaign(c._id)} />
                                        )}
                                        {c.status === 'running' && (
                                            <IconBtn icon={Pause} label="Tạm dừng" onClick={() => handlePause(c._id)} />
                                        )}
                                        {c.status === 'paused' && (
                                            <IconBtn icon={Play} label="Tiếp tục" primary onClick={() => handleResume(c._id)} />
                                        )}
                                        <IconBtn icon={Eye} label="Chi tiết" onClick={async () => {
                                            try {
                                                const res = await httpClient.get(`/workspaces/${workspaceId}/campaigns/${c._id}`);
                                                setSelectedCampaign(res.data?.data);
                                                setView('detail');
                                            } catch { message.error('Lỗi tải chi tiết'); }
                                        }} />
                                        {['draft', 'completed', 'failed'].includes(c.status) && (
                                            <IconBtn icon={Trash2} label="Xóa" danger onClick={() => handleDelete(c._id)} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </DCard>
            )}
        </div>
    );

    // ═══════════════════════════════════
    // RENDER: CREATE WIZARD
    // ═══════════════════════════════════
    const wizardSteps = [
        { icon: Send, label: 'Nội dung' },
        { icon: Users, label: 'Đối tượng' },
        { icon: Clock, label: 'Lịch trình' },
        { icon: Shield, label: 'Chống spam' },
    ];

    const canNext = () => {
        if (step === 0) return formName.trim() && formMessages.some(m => m.trim());
        return true;
    };

    const renderWizard = () => (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setView('list')}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300"
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 className="m-0 text-[22px] font-semibold tracking-tight text-slate-900">Tạo Campaign mới</h1>
            </div>

            <DCard>
                {/* Step Indicator */}
                <div className="mb-8 flex items-center justify-center gap-0">
                    {wizardSteps.map((s, i) => {
                        const active = i === step;
                        const done = i < step;
                        return (
                            <div key={i} className="flex items-center">
                                <div className="flex flex-col items-center gap-2" style={{ width: 120 }}>
                                    <div className={[
                                        'flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300',
                                        active ? 'bg-indigo-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.3)]'
                                            : done ? 'bg-indigo-100 text-indigo-600'
                                                : 'bg-slate-100 text-slate-400',
                                    ].join(' ')}>
                                        {done ? <CheckCircle size={16} /> : <s.icon size={16} />}
                                    </div>
                                    <span className={`text-[12px] font-medium ${active ? 'text-indigo-600' : done ? 'text-indigo-500' : 'text-slate-400'}`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < wizardSteps.length - 1 && (
                                    <div className={`h-[2px] w-8 rounded-full transition-colors duration-300 ${i < step ? 'bg-indigo-400' : 'bg-slate-200'}`} style={{ marginTop: -20 }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Step 0: Content ── */}
                {step === 0 && (
                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Tên campaign</label>
                            <Input
                                placeholder="VD: Nhắc nhở gia hạn tháng 4, Upsale Gemini Pro..."
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                style={{ borderRadius: 14, height: 46, fontSize: 14 }}
                            />
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label className="text-[13px] font-semibold text-slate-700">
                                    Nội dung tin nhắn
                                </label>
                                <span className="text-[12px] text-slate-400">{formMessages.length}/10</span>
                            </div>
                            <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[12px] text-indigo-600">
                                💡 Biến hỗ trợ: <code className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px]">{'{{customer_name}}'}</code> — Tên khách hàng
                            </div>

                            <div className="space-y-3">
                                {formMessages.map((msg, i) => (
                                    <div key={i} className="flex gap-2">
                                        <TextArea
                                            value={msg}
                                            onChange={e => {
                                                const next = [...formMessages];
                                                next[i] = e.target.value;
                                                setFormMessages(next);
                                            }}
                                            placeholder={`Tin nhắn ${i + 1}...`}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            style={{ borderRadius: 14, flex: 1 }}
                                        />
                                        {formMessages.length > 1 && (
                                            <button
                                                onClick={() => setFormMessages(formMessages.filter((_, j) => j !== i))}
                                                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {formMessages.length < 10 && (
                                <button
                                    onClick={() => setFormMessages([...formMessages, ''])}
                                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 text-[13px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                                >
                                    <Plus size={14} />
                                    Thêm tin nhắn
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Step 1: Audience ── */}
                {step === 1 && (
                    <div className="space-y-6">
                        <label className="block text-[13px] font-semibold text-slate-700">Chọn đối tượng nhận</label>

                        <div className="grid grid-cols-3 gap-3">
                            {([
                                { key: 'all', icon: Users, title: 'Tất cả', desc: 'Gửi toàn bộ danh bạ Zalo' },
                                { key: 'filter', icon: Filter, title: 'Bộ lọc', desc: 'Lọc theo điều kiện' },
                                { key: 'manual', icon: UserCheck, title: 'Chọn tay', desc: 'Nhập ID cụ thể' },
                            ] as const).map(opt => {
                                const selected = audienceType === opt.key;
                                return (
                                    <button
                                        key={opt.key}
                                        onClick={() => setAudienceType(opt.key)}
                                        className={[
                                            'flex flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition-all duration-200',
                                            selected
                                                ? 'border-indigo-500 bg-indigo-50/60 shadow-[0_0_0_3px_rgba(99,102,241,0.1)]'
                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
                                        ].join(' ')}
                                    >
                                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <opt.icon size={22} />
                                        </div>
                                        <span className={`text-[14px] font-semibold ${selected ? 'text-indigo-700' : 'text-slate-800'}`}>{opt.title}</span>
                                        <span className="text-[12px] text-slate-500">{opt.desc}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {audienceType === 'filter' && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Nguồn liên hệ</label>
                                        <Select
                                            value={filterSource} onChange={setFilterSource} allowClear
                                            placeholder="Tất cả nguồn" style={{ width: '100%' }}
                                            options={[
                                                { label: '👤 Bạn bè', value: 'friend' },
                                                { label: '🔵 Người lạ', value: 'stranger' },
                                                { label: '👥 Nhóm', value: 'group' },
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Tối thiểu tin nhắn</label>
                                        <InputNumber value={filterMinMessages} onChange={v => setFilterMinMessages(v || 0)}
                                            min={0} style={{ width: '100%' }} placeholder="0 = tất cả" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[12px] font-medium text-slate-600">
                                        Hoạt động trong <strong className="text-indigo-600">{filterLastActiveDays}</strong> ngày gần đây
                                    </label>
                                    <Slider value={filterLastActiveDays} onChange={setFilterLastActiveDays}
                                        min={7} max={365} marks={{ 7: '7d', 30: '30d', 90: '90d', 180: '6m', 365: '1y' }} />
                                </div>
                            </div>
                        )}

                        {audienceType === 'manual' && (
                            <div>
                                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">
                                    Nhập Zalo User IDs (mỗi dòng 1 ID)
                                </label>
                                <TextArea
                                    value={manualIds.join('\n')}
                                    onChange={e => setManualIds(e.target.value.split('\n').filter(s => s.trim()))}
                                    placeholder="Nhập mỗi Zalo User ID trên 1 dòng..."
                                    autoSize={{ minRows: 5, maxRows: 10 }}
                                    style={{ borderRadius: 14 }}
                                />
                                <p className="m-0 mt-1.5 text-[12px] text-slate-400">
                                    {manualIds.filter(s => s.trim()).length} ID đã nhập
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Step 2: Schedule ── */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Thời gian bắt đầu</label>
                            <DatePicker
                                showTime
                                value={scheduleStartAt}
                                onChange={v => v && setScheduleStartAt(v)}
                                style={{ width: '100%', borderRadius: 14, height: 46 }}
                                format="DD/MM/YYYY HH:mm"
                            />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="m-0 text-[14px] font-semibold text-slate-700">🕐 Khung giờ gửi</p>
                                    <p className="m-0 mt-0.5 text-[12px] text-slate-500">Chỉ gửi trong giờ hành chính (tránh quấy rối)</p>
                                </div>
                                <Switch checked={sendWindowEnabled} onChange={setSendWindowEnabled} />
                            </div>
                            {sendWindowEnabled && (
                                <div className="flex items-center gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-slate-500">Từ</label>
                                        <InputNumber value={sendWindowStart} onChange={v => setSendWindowStart(v || 8)}
                                            min={0} max={23} style={{ width: 80 }} />
                                    </div>
                                    <span className="mt-4 text-slate-300">→</span>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-slate-500">Đến</label>
                                        <InputNumber value={sendWindowEnd} onChange={v => setSendWindowEnd(v || 21)}
                                            min={0} max={23} style={{ width: 80 }} />
                                    </div>
                                    <span className="mt-4 text-[12px] text-slate-400">giờ</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Step 3: Anti-spam ── */}
                {step === 3 && (
                    <div className="space-y-6">
                        {/* Warning */}
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                            <p className="m-0 text-[13px] leading-5 text-amber-800">
                                <strong>Cảnh báo:</strong> Gửi quá nhanh hoặc quá nhiều có thể bị Zalo ban tài khoản. Nên giữ delay ≥ 8s và tối đa 30 tin/giờ.
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-slate-700">
                                ⏱️ Delay giữa mỗi người nhận: <strong className="text-indigo-600">{antiSpamDelay}s</strong>
                            </label>
                            <Slider value={antiSpamDelay} onChange={setAntiSpamDelay}
                                min={5} max={30} step={1}
                                marks={{ 5: '5s', 8: '8s ✓', 15: '15s', 30: '30s' }}
                                tooltip={{ formatter: v => `${v}s` }} />
                        </div>

                        <div>
                            <label className="mb-2 block text-[13px] font-semibold text-slate-700">
                                📊 Tối đa tin nhắn/giờ: <strong className="text-indigo-600">{antiSpamMaxPerHour}</strong>
                            </label>
                            <Slider value={antiSpamMaxPerHour} onChange={setAntiSpamMaxPerHour}
                                min={5} max={100} step={5}
                                marks={{ 5: '5', 30: '30 ✓', 60: '60', 100: '100' }} />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="m-0 text-[14px] font-semibold text-slate-700">🎲 Randomize delay</p>
                                    <p className="m-0 mt-0.5 text-[12px] text-slate-500">Thêm ±30% biến đổi ngẫu nhiên để tránh bị phát hiện là bot</p>
                                </div>
                                <Switch checked={antiSpamRandomize} onChange={setAntiSpamRandomize} />
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/80 p-5">
                            <h4 className="m-0 mb-3 text-[14px] font-semibold text-indigo-700">📋 Tóm tắt Campaign</h4>
                            <div className="space-y-1.5 text-[13px] leading-6 text-indigo-700">
                                <p className="m-0">• Tên: <strong>{formName || '(chưa đặt)'}</strong></p>
                                <p className="m-0">• {formMessages.filter(m => m.trim()).length} tin nhắn</p>
                                <p className="m-0">• Đối tượng: {audienceType === 'all' ? 'Tất cả danh bạ' : audienceType === 'filter' ? 'Theo bộ lọc' : `${manualIds.length} ID thủ công`}</p>
                                <p className="m-0">• Delay: {antiSpamDelay}s {antiSpamRandomize ? '(±30%)' : ''} · Max {antiSpamMaxPerHour}/giờ</p>
                                <p className="m-0">• Khung giờ: {sendWindowEnabled ? `${sendWindowStart}:00 - ${sendWindowEnd}:00` : 'Không giới hạn'}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
                    <button
                        onClick={() => step > 0 ? setStep(step - 1) : setView('list')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-[14px] font-medium text-slate-600 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300"
                    >
                        {step === 0 ? 'Hủy' : 'Quay lại'}
                    </button>

                    {step < 3 ? (
                        <button
                            disabled={!canNext()}
                            onClick={() => setStep(step + 1)}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-6 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition-all duration-200 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            Tiếp theo
                            <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            disabled={creating}
                            onClick={handleCreateCampaign}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.3)] transition-all duration-200 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
                        >
                            {creating && <Spin size="small" />}
                            <Megaphone size={16} />
                            Tạo Campaign
                        </button>
                    )}
                </div>
            </DCard>
        </div>
    );

    // ═══════════════════════════════════
    // RENDER: DETAIL VIEW
    // ═══════════════════════════════════
    const renderDetail = () => {
        if (!selectedCampaign) return null;
        const c = selectedCampaign;
        const cfg = statusLookup[c.status] || statusLookup.draft;
        const pct = c.stats.total > 0 ? Math.round(((c.stats.sent + c.stats.failed) / c.stats.total) * 100) : 0;

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setView('list'); setSelectedCampaign(null); }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:bg-slate-50"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <h1 className="m-0 text-[22px] font-semibold tracking-tight text-slate-900">{c.name}</h1>
                    <StatusBadge status={c.status} text={cfg.text} tone={cfg.tone} />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                        { label: 'Đã gửi', value: c.stats.sent, icon: CheckCircle, tone: 'emerald' as Tone },
                        { label: 'Thất bại', value: c.stats.failed, icon: XCircle, tone: 'rose' as Tone },
                        { label: 'Đang chờ', value: c.stats.pending, icon: Clock, tone: 'amber' as Tone },
                        { label: 'Tổng', value: c.stats.total, icon: Users, tone: 'indigo' as Tone },
                    ].map((s, i) => (
                        <div key={i} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneIcon[s.tone]}`}>
                                    <s.icon size={15} />
                                </div>
                                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">{s.label}</span>
                            </div>
                            <p className={`m-0 text-[28px] font-bold leading-none ${toneText[s.tone]}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Progress */}
                <DCard>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[13px] font-medium text-slate-600">Tiến trình tổng thể</span>
                        <span className="text-[13px] font-semibold text-indigo-600">{pct}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${c.stats.failed > 0 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    {c.liveProgress?.estimatedRemainingMs && c.status === 'running' && (
                        <p className="m-0 mt-3 text-[12px] text-slate-500">
                            ⏱️ Ước tính còn: {Math.round(c.liveProgress.estimatedRemainingMs / 60000)} phút
                        </p>
                    )}
                </DCard>

                {/* Actions */}
                <DCard>
                    <div className="flex flex-wrap gap-3">
                        {c.status === 'draft' && (
                            <button onClick={() => { handleStartCampaign(c._id); setView('list'); }}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-700">
                                <Play size={15} /> Bắt đầu gửi
                            </button>
                        )}
                        {c.status === 'running' && (
                            <button onClick={() => handlePause(c._id)}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300 bg-white px-5 text-[14px] font-semibold text-amber-600 transition-all hover:bg-amber-50">
                                <Pause size={15} /> Tạm dừng
                            </button>
                        )}
                        {c.status === 'paused' && (
                            <button onClick={() => handleResume(c._id)}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-700">
                                <Play size={15} /> Tiếp tục
                            </button>
                        )}
                        {['draft', 'completed', 'failed'].includes(c.status) && (
                            <button onClick={() => { handleDelete(c._id); setView('list'); }}
                                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 text-[14px] font-semibold text-rose-500 transition-all hover:bg-rose-50 hover:border-rose-300">
                                <Trash2 size={15} /> Xóa
                            </button>
                        )}
                    </div>
                </DCard>

                {/* Messages */}
                <DCard>
                    <SectionLabel icon={Send} label="Nội dung tin nhắn" />
                    <div className="mt-4 space-y-2">
                        {c.messages.map((m, i) => (
                            <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[14px] leading-6 text-slate-700">
                                {m}
                            </div>
                        ))}
                    </div>
                </DCard>

                {/* Config */}
                <DCard>
                    <SectionLabel icon={BarChart3} label="Cấu hình" />
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        {[
                            { label: 'Đối tượng', value: c.audience.type === 'all' ? 'Tất cả' : c.audience.type === 'filter' ? 'Bộ lọc' : 'Chọn tay' },
                            { label: 'Delay', value: `${c.antiSpam.delayBetweenMs / 1000}s ${c.antiSpam.randomizeDelay ? '(±30%)' : ''}` },
                            { label: 'Max/giờ', value: String(c.antiSpam.maxPerHour) },
                            { label: 'Khung giờ', value: c.schedule.sendWindow ? `${c.schedule.sendWindow.startHour}:00 - ${c.schedule.sendWindow.endHour}:00` : 'Không giới hạn' },
                        ].map((item, i) => (
                            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
                                <p className="m-0 mt-1 text-[14px] font-semibold text-slate-800">{item.value}</p>
                            </div>
                        ))}
                    </div>
                </DCard>
            </div>
        );
    };

    return (
        <AppLayout>
            <Head>
                <title>Campaigns | NemarkChat</title>
            </Head>
            <div className="mx-auto max-w-[1380px]" style={{ padding: '24px 16px 64px' }}>
                {view === 'list' && renderList()}
                {view === 'create' && renderWizard()}
                {view === 'detail' && renderDetail()}
            </div>
        </AppLayout>
    );
}
