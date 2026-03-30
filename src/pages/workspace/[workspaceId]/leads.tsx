import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Spin, message, Modal, Input, Select, Badge, Drawer, Tooltip, Dropdown, Progress } from 'antd';
import {
    Plus, Search, LayoutGrid, List, ChevronRight, Phone, Mail, User2, X,
    MessageSquare, Trash2, Send, Target, MoreHorizontal, TrendingUp,
    Calendar, Clock, Globe, Zap, ArrowUpRight, Eye, Users, Star,
    UserPlus, Activity, BarChart3, ExternalLink, CheckSquare, Square, Radio,
    Brain, Sparkles, RefreshCw
} from 'lucide-react';
import AppLayout from '../../../components/layout/AppLayout';
import { leadService } from '../../../services/lead.service';
import { zaloService as zaloApiService } from '../../../services/zalo.service';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

type LeadStage = 'mới' | 'tiềm_năng' | 'đang_tư_vấn' | 'chốt_đơn' | 'khách_hàng' | 'từ_chối';

const STAGES: { key: LeadStage; label: string; color: string; gradient: string; icon: string; bgColor: string; borderColor: string }[] = [
    { key: 'mới', label: 'Mới', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', icon: '✦', bgColor: '#eef2ff', borderColor: '#c7d2fe' },
    { key: 'tiềm_năng', label: 'Tiềm năng', color: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', icon: '◆', bgColor: '#f0f9ff', borderColor: '#bae6fd' },
    { key: 'đang_tư_vấn', label: 'Đang tư vấn', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', icon: '◉', bgColor: '#fffbeb', borderColor: '#fde68a' },
    { key: 'chốt_đơn', label: 'Chốt đơn', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', icon: '★', bgColor: '#f5f3ff', borderColor: '#ddd6fe' },
    { key: 'khách_hàng', label: 'Khách hàng', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)', icon: '●', bgColor: '#ecfdf5', borderColor: '#a7f3d0' },
    { key: 'từ_chối', label: 'Từ chối', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f87171)', icon: '✕', bgColor: '#fef2f2', borderColor: '#fecaca' },
];

const SOURCE_LABELS: Record<string, string> = {
    zalo: 'Zalo', facebook: 'Facebook', widget: 'Widget', manual: 'Thủ công',
};

const SOURCE_ICONS: Record<string, string> = {
    zalo: '💬', facebook: '📘', widget: '🌐', manual: '✋',
};

interface Lead {
    _id: string;
    name: string;
    phone: string;
    email: string;
    avatar: string;
    stage: LeadStage;
    source: string;
    tags: string[];
    score: number;
    assignedTo: any;
    notes: { text: string; createdAt: string; createdBy: any }[];
    lastContactedAt: string | null;
    conversationCount: number;
    zaloUserId?: string;
    fbUserId?: string;
    createdAt: string;
    updatedAt: string;
}

export default function LeadsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const [ready, setReady] = useState(false);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'kanban' | 'list'>('kanban');
    const [search, setSearch] = useState('');
    const [filterSource, setFilterSource] = useState<string>('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', source: 'manual' });
    const [noteText, setNoteText] = useState('');
    const [stats, setStats] = useState<any>(null);

    // Group Import states
    const [groupImportOpen, setGroupImportOpen] = useState(false);
    const [groups, setGroups] = useState<any[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [groupMembers, setGroupMembers] = useState<any[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);

    // Auto-friend states
    const [autoFriendRunning, setAutoFriendRunning] = useState(false);
    const [autoFriendJob, setAutoFriendJob] = useState<any>(null);
    const [friendMsg, setFriendMsg] = useState('Xin chào, mình muốn kết bạn!');
    // Behavior analysis states
    const [memberAnalysis, setMemberAnalysis] = useState<Record<string, any>>({});
    const [analyzingMembers, setAnalyzingMembers] = useState(false);
    const [analysisDrawer, setAnalysisDrawer] = useState<any>(null);
    // Bulk sync all groups state
    const [bulkSyncing, setBulkSyncing] = useState(false);

    // ── AI Analysis State ──
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiAnalyzingBulk, setAiAnalyzingBulk] = useState(false);
    const [aiBulkResult, setAiBulkResult] = useState<any>(null);

    // Drag-and-drop state
    const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);

    // ── Bulk Selection & Broadcast State ──
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [broadcastOpen, setBroadcastOpen] = useState(false);
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastSending, setBroadcastSending] = useState(false);
    const [bulkStageOpen, setBulkStageOpen] = useState(false);

    const toggleLeadSelection = (leadId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedLeadIds(prev => {
            const next = new Set(prev);
            if (next.has(leadId)) next.delete(leadId);
            else next.add(leadId);
            return next;
        });
    };

    const selectAllLeads = () => {
        if (selectedLeadIds.size === leads.length) {
            setSelectedLeadIds(new Set());
        } else {
            setSelectedLeadIds(new Set(leads.map(l => l._id)));
        }
    };

    const selectedLeadsList = useMemo(() => leads.filter(l => selectedLeadIds.has(l._id)), [leads, selectedLeadIds]);

    const handleBroadcast = async () => {
        if (!broadcastMsg.trim() || selectedLeadsList.length === 0) return;
        setBroadcastSending(true);
        try {
            // Get Zalo-source lead IDs (only Zalo leads can receive Zalo messages)
            const zaloLeads = selectedLeadsList.filter(l => l.source === 'zalo');
            const nonZaloLeads = selectedLeadsList.filter(l => l.source !== 'zalo');

            if (zaloLeads.length === 0) {
                message.warning('Không có lead nào từ Zalo để gửi tin nhắn. Chỉ lead Zalo mới nhận được tin nhắn qua Zalo.');
                setBroadcastSending(false);
                return;
            }

            // Extract Zalo thread IDs from lead metadata
            const recipientIds = zaloLeads.map(l => (l as any).zaloUserId || (l as any).metadata?.zaloUserId || l._id).filter(Boolean);

            if (recipientIds.length === 0) {
                message.error('Không tìm thấy Zalo ID cho các lead đã chọn');
                setBroadcastSending(false);
                return;
            }


            // Use the broadcast endpoint
            const result = await (await import('../../../lib/http/client')).httpClient.post(
                `/workspaces/${workspaceId}/zalo/broadcast`,
                {
                    messages: [broadcastMsg.trim()],
                    recipientIds,
                    delayMs: 3000,
                }
            );

            const data = result?.data?.data;
            const successCount = data?.successCount || 0;
            const failedCount = data?.failedCount || 0;

            if (successCount > 0) {
                message.success(`✅ Đã gửi ${successCount}/${recipientIds.length} tin nhắn thành công!`);
            }
            if (failedCount > 0) {
                message.warning(`⚠️ ${failedCount} tin nhắn gửi thất bại`);
            }
            if (nonZaloLeads.length > 0) {
                message.info(`ℹ️ ${nonZaloLeads.length} lead không phải Zalo đã được bỏ qua`);
            }

            setBroadcastOpen(false);
            setBroadcastMsg('');
            setSelectedLeadIds(new Set());
        } catch (err: any) {
            const errMsg = err?.response?.data?.error?.message || err?.message || 'Lỗi gửi tin nhắn';
            message.error(`Lỗi broadcast: ${errMsg}`);
        } finally {
            setBroadcastSending(false);
        }
    };

    const handleBulkStageChange = async (newStage: LeadStage) => {
        try {
            let successCount = 0;
            for (const leadId of selectedLeadIds) {
                try {
                    await leadService.updateStage(workspaceId as string, leadId, newStage);
                    successCount++;
                } catch { /* silent */ }
            }
            setLeads(prev => prev.map(l => selectedLeadIds.has(l._id) ? { ...l, stage: newStage } : l));
            message.success(`Đã chuyển ${successCount} lead sang "${STAGES.find(s => s.key === newStage)?.label}"`); 
            setBulkStageOpen(false);
            setSelectedLeadIds(new Set());
        } catch { message.error('Lỗi chuyển giai đoạn'); }
    };

    const handleBulkDelete = async () => {
        Modal.confirm({
            title: `Xoá ${selectedLeadIds.size} lead?`,
            content: 'Hành động này không thể hoàn tác.',
            okText: 'Xoá',
            okButtonProps: { danger: true },
            cancelText: 'Hủy',
            onOk: async () => {
                let count = 0;
                for (const id of selectedLeadIds) {
                    try { await leadService.delete(workspaceId as string, id); count++; } catch { /* silent */ }
                }
                setLeads(prev => prev.filter(l => !selectedLeadIds.has(l._id)));
                setSelectedLeadIds(new Set());
                fetchStats();
                message.success(`Đã xoá ${count} lead`);
            },
        });
    };

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    const fetchLeads = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const params: any = {};
            if (search) params.search = search;
            if (filterSource) params.source = filterSource;
            const res = await leadService.list(workspaceId as string, params);
            setLeads(res?.data?.leads || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [workspaceId, search, filterSource]);

    const fetchStats = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const res = await leadService.getStats(workspaceId as string);
            setStats(res?.data);
        } catch { /* silent */ }
    }, [workspaceId]);

    useEffect(() => { fetchLeads(); fetchStats(); }, [fetchLeads, fetchStats]);

    const handleStageChange = async (leadId: string, newStage: LeadStage) => {
        try {
            await leadService.updateStage(workspaceId as string, leadId, newStage);
            setLeads(prev => prev.map(l => l._id === leadId ? { ...l, stage: newStage } : l));
            if (selectedLead?._id === leadId) setSelectedLead(prev => prev ? { ...prev, stage: newStage } : prev);
            message.success('Đã chuyển giai đoạn');
        } catch { message.error('Lỗi khi chuyển giai đoạn'); }
    };

    const handleCreateLead = async () => {
        if (!newLead.name.trim()) { message.warning('Vui lòng nhập tên'); return; }
        try {
            await leadService.create(workspaceId as string, newLead);
            setCreateModalOpen(false);
            setNewLead({ name: '', phone: '', email: '', source: 'manual' });
            fetchLeads(); fetchStats();
            message.success('Tạo lead thành công');
        } catch { message.error('Lỗi tạo lead'); }
    };

    const handleDeleteLead = async (leadId: string) => {
        try {
            await leadService.delete(workspaceId as string, leadId);
            setLeads(prev => prev.filter(l => l._id !== leadId));
            setDrawerOpen(false); setSelectedLead(null);
            fetchStats();
            message.success('Đã xoá lead');
        } catch { message.error('Lỗi xoá lead'); }
    };

    const handleAddNote = async () => {
        if (!noteText.trim() || !selectedLead) return;
        try {
            const res = await leadService.addNote(workspaceId as string, selectedLead._id, noteText);
            setSelectedLead(res?.data);
            setLeads(prev => prev.map(l => l._id === selectedLead._id ? res?.data : l));
            setNoteText('');
        } catch { message.error('Lỗi thêm ghi chú'); }
    };

    const openDetail = (lead: Lead) => { setSelectedLead(lead); setDrawerOpen(true); };

    const leadsByStage = useMemo(() => {
        const map: Record<string, Lead[]> = {};
        STAGES.forEach(s => { map[s.key] = []; });
        leads.forEach(l => { if (map[l.stage]) map[l.stage].push(l); });
        return map;
    }, [leads]);

    const totalLeads = leads.length;
    const conversionRate = totalLeads > 0 ? Math.round(((leadsByStage['khách_hàng']?.length || 0) / totalLeads) * 100) : 0;

    if (!ready || !workspaceId) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}><Spin size="large" /></div>;
    }

    return (
        <AppLayout headerTitle="Khách hàng tiềm năng">
            <Head><title>Leads | NemarkChat</title></Head>
            <div style={{ padding: '20px 24px 64px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>

                {/* ── Hero Summary Section ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginBottom: 24,
                }}>
                    {/* Total Leads Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        borderRadius: 16,
                        padding: '20px 22px',
                        color: 'white',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: 110,
                    }}>
                        <div style={{ position: 'absolute', right: -10, top: -10, width: 80, height: 80, background: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
                        <div style={{ position: 'absolute', right: 30, bottom: -15, width: 50, height: 50, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Users size={16} style={{ opacity: 0.9 }} />
                            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, letterSpacing: 0.5 }}>TỔNG LEAD</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>{totalLeads}</div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>{stats?.total || 0} tất cả thời gian</div>
                    </div>

                    {/* Conversion Card */}
                    <div style={{
                        background: 'white',
                        borderRadius: 16,
                        padding: '20px 22px',
                        border: '1px solid #e2e8f0',
                        minHeight: 110,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <TrendingUp size={16} color="#10b981" />
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', letterSpacing: 0.5 }}>TỶ LỆ CHUYỂN ĐỔI</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1, marginBottom: 8 }}>{conversionRate}%</div>
                        <Progress percent={conversionRate} strokeColor="#10b981" trailColor="#ecfdf5" showInfo={false} size="small" />
                    </div>

                    {/* Stage Mini-Cards */}
                    {STAGES.slice(0, 4).map(s => (
                        <div key={s.key} style={{
                            background: 'white',
                            borderRadius: 16,
                            padding: '20px 22px',
                            border: '1px solid #e2e8f0',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'all 0.2s',
                            cursor: 'default',
                            minHeight: 110,
                        }}>
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                background: s.gradient,
                            }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ fontSize: 14 }}>{s.icon}</span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', letterSpacing: 0.3 }}>{s.label.toUpperCase()}</span>
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                                {stats?.byStage?.[s.key] || 0}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Toolbar ── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 20,
                    flexWrap: 'wrap',
                }}>
                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 400 }}>
                        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Tìm kiếm theo tên, SĐT, email..."
                            style={{
                                width: '100%',
                                height: 42,
                                paddingLeft: 42,
                                paddingRight: 16,
                                borderRadius: 12,
                                border: '1.5px solid #e2e8f0',
                                background: 'white',
                                fontSize: 13.5,
                                outline: 'none',
                                transition: 'all 0.2s',
                                color: '#1e293b',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#818cf8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    {/* Source Filter */}
                    <Select
                        value={filterSource || undefined}
                        onChange={v => setFilterSource(v || '')}
                        allowClear
                        placeholder="🔍 Nguồn"
                        style={{ minWidth: 140, height: 42 }}
                        options={[
                            { value: 'zalo', label: '💬 Zalo' },
                            { value: 'facebook', label: '📘 Facebook' },
                            { value: 'widget', label: '🌐 Widget' },
                            { value: 'manual', label: '✋ Thủ công' },
                        ]}
                    />

                    {/* View Toggle */}
                    <div style={{
                        display: 'flex',
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1.5px solid #e2e8f0',
                        marginLeft: 'auto',
                        background: 'white',
                    }}>
                        {[{ v: 'kanban', icon: <LayoutGrid size={15} /> }, { v: 'list', icon: <List size={15} /> }].map(({ v, icon }) => (
                            <button key={v} onClick={() => setView(v as any)} style={{
                                padding: '8px 14px',
                                border: 'none',
                                cursor: 'pointer',
                                background: view === v ? '#6366f1' : 'white',
                                color: view === v ? 'white' : '#94a3b8',
                                transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center',
                                borderLeft: v === 'list' ? '1px solid #e2e8f0' : 'none',
                            }}>{icon}</button>
                        ))}
                    </div>

                    {/* Import from Group Button */}
                    <button onClick={async () => {
                        setGroupImportOpen(true);
                        setSelectedGroup(null);
                        setGroupMembers([]);
                        setSelectedMembers(new Set());
                        setGroupsLoading(true);
                        try {
                            const res = await zaloApiService.getGroups(workspaceId as string);
                            setGroups(res?.data?.items || []);
                        } catch { message.error('Lỗi tải danh sách nhóm Zalo'); }
                        finally { setGroupsLoading(false); }
                    }} style={{
                        height: 42,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        borderRadius: 12,
                        padding: '0 18px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#6366f1',
                        background: 'white',
                        border: '1.5px solid #c7d2fe',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as any).style.background = '#eef2ff'; (e.currentTarget as any).style.borderColor = '#818cf8'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.background = 'white'; (e.currentTarget as any).style.borderColor = '#c7d2fe'; }}
                    >
                        <Users size={15} /> Import từ Nhóm
                    </button>

                    {/* Bulk Sync All Groups → Leads Button */}
                    <button
                        disabled={bulkSyncing}
                        onClick={async () => {
                            if (bulkSyncing) return;
                            setBulkSyncing(true);
                            try {
                                const res = await zaloApiService.syncAllGroupsToLeads(workspaceId as string);
                                const data = res?.data;
                                message.success(
                                    `Đồng bộ thành công! ${data?.totalCreated || 0} lead mới, ${data?.totalSkipped || 0} đã tồn tại từ ${data?.totalGroups || 0} nhóm (${data?.totalMembers || 0} thành viên)`
                                );
                                fetchLeads();
                                fetchStats();
                            } catch (err: any) {
                                const errMsg = err?.response?.data?.error?.message
                                    || err?.response?.data?.message
                                    || err?.message
                                    || 'Lỗi đồng bộ nhóm';
                                if (errMsg.includes('chưa kết nối') || errMsg.includes('ZALO_NOT_CONNECTED')) {
                                    message.error('❌ Cần kết nối Zalo trước khi đồng bộ. Vào Cài đặt → Zalo để kết nối.');
                                } else {
                                    message.error(`Lỗi đồng bộ: ${errMsg}`);
                                }
                            } finally {
                                setBulkSyncing(false);
                            }
                        }}
                        style={{
                            height: 42,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            borderRadius: 12,
                            padding: '0 18px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'white',
                            background: bulkSyncing
                                ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            cursor: bulkSyncing ? 'not-allowed' : 'pointer',
                            boxShadow: bulkSyncing ? 'none' : '0 4px 14px rgba(16,185,129,0.3)',
                            transition: 'all 0.2s',
                            opacity: bulkSyncing ? 0.8 : 1,
                        }}
                        onMouseEnter={e => { if (!bulkSyncing) { (e.currentTarget as any).style.transform = 'translateY(-1px)'; (e.currentTarget as any).style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)'; } }}
                        onMouseLeave={e => { (e.currentTarget as any).style.transform = 'translateY(0)'; (e.currentTarget as any).style.boxShadow = bulkSyncing ? 'none' : '0 4px 14px rgba(16,185,129,0.3)'; }}
                    >
                        {bulkSyncing ? (
                            <>
                                <Spin size="small" style={{ marginRight: 4 }} />
                                Đang đồng bộ...
                            </>
                        ) : (
                            <>
                                <Zap size={15} /> Đồng bộ tất cả nhóm
                            </>
                        )}
                    </button>

                    {/* AI Bulk Analyze Button */}
                    <button
                        disabled={aiAnalyzingBulk}
                        onClick={async () => {
                            if (aiAnalyzingBulk) return;
                            setAiAnalyzingBulk(true);
                            try {
                                const res = await leadService.aiAnalyzeBulk(workspaceId as string, 30);
                                setAiBulkResult(res?.data);
                                message.success(res?.message || `Đã phân tích ${res?.data?.analyzed || 0} cuộc hội thoại`);
                                fetchLeads();
                                fetchStats();
                            } catch (err: any) {
                                message.error(`Lỗi AI: ${err?.response?.data?.message || err?.message || 'Không thể phân tích'}`);
                            } finally {
                                setAiAnalyzingBulk(false);
                            }
                        }}
                        style={{
                            height: 42,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            borderRadius: 12,
                            padding: '0 18px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'white',
                            background: aiAnalyzingBulk
                                ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                                : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                            border: 'none',
                            cursor: aiAnalyzingBulk ? 'not-allowed' : 'pointer',
                            boxShadow: aiAnalyzingBulk ? 'none' : '0 4px 14px rgba(245,158,11,0.3)',
                            transition: 'all 0.2s',
                            opacity: aiAnalyzingBulk ? 0.8 : 1,
                        }}
                        onMouseEnter={e => { if (!aiAnalyzingBulk) { (e.currentTarget as any).style.transform = 'translateY(-1px)'; (e.currentTarget as any).style.boxShadow = '0 6px 20px rgba(245,158,11,0.4)'; } }}
                        onMouseLeave={e => { (e.currentTarget as any).style.transform = 'translateY(0)'; (e.currentTarget as any).style.boxShadow = aiAnalyzingBulk ? 'none' : '0 4px 14px rgba(245,158,11,0.3)'; }}
                    >
                        {aiAnalyzingBulk ? (
                            <>
                                <Spin size="small" style={{ marginRight: 4 }} />
                                AI đang phân tích...
                            </>
                        ) : (
                            <>
                                <Brain size={15} /> 🤖 AI Phân Tích
                            </>
                        )}
                    </button>

                    {/* Add Lead Button */}
                    <button onClick={() => setCreateModalOpen(true)} style={{
                        height: 42,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        borderRadius: 12,
                        padding: '0 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'white',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { (e.target as any).style.transform = 'translateY(-1px)'; (e.target as any).style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)'; }}
                    onMouseLeave={e => { (e.target as any).style.transform = 'translateY(0)'; (e.target as any).style.boxShadow = '0 4px 14px rgba(99,102,241,0.3)'; }}
                    >
                        <Plus size={16} /> Thêm Lead
                    </button>
                </div>

                {/* ── Content  ── */}
                {loading ? (
                    <div style={{ display: 'flex', minHeight: '45vh', alignItems: 'center', justifyContent: 'center' }}>
                        <Spin size="large" />
                    </div>
                ) : view === 'kanban' ? (
                    /* ═══ Kanban View ═══ */
                    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16, minHeight: '60vh' }}>
                        {STAGES.map(stage => {
                            const stageLeads = leadsByStage[stage.key] || [];
                            return (
                                <div
                                    key={stage.key}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        setDragOverStage(stage.key);
                                    }}
                                    onDragLeave={() => setDragOverStage(null)}
                                    onDrop={e => {
                                        e.preventDefault();
                                        setDragOverStage(null);
                                        const leadId = e.dataTransfer.getData('text/plain');
                                        if (leadId && draggingLeadId) {
                                            const lead = leads.find(l => l._id === leadId);
                                            if (lead && lead.stage !== stage.key) {
                                                handleStageChange(leadId, stage.key);
                                            }
                                        }
                                        setDraggingLeadId(null);
                                    }}
                                    style={{
                                        flexShrink: 0,
                                        width: 280,
                                        borderRadius: 16,
                                        background: dragOverStage === stage.key ? stage.bgColor : '#fafbfc',
                                        border: dragOverStage === stage.key ? `2px dashed ${stage.color}` : '1px solid #e8ecf0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {/* Column Header */}
                                    <div style={{
                                        padding: '14px 16px',
                                        borderBottom: '1px solid #e8ecf0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        background: 'white',
                                        borderRadius: '16px 16px 0 0',
                                    }}>
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: stage.gradient,
                                            boxShadow: `0 0 6px ${stage.color}40`,
                                        }} />
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', flex: 1 }}>{stage.label}</span>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: stage.color,
                                            background: stage.bgColor,
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            minWidth: 24,
                                            textAlign: 'center',
                                        }}>{stageLeads.length}</span>
                                    </div>

                                    {/* Cards */}
                                    <div style={{ padding: 8, flex: 1, maxHeight: '55vh', overflowY: 'auto' }}>
                                        {stageLeads.map((lead, idx) => (
                                            <div
                                                key={lead._id}
                                                draggable
                                                onDragStart={e => {
                                                    e.dataTransfer.setData('text/plain', lead._id);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    setDraggingLeadId(lead._id);
                                                    // Make the dragged element semi-transparent
                                                    setTimeout(() => {
                                                        (e.target as HTMLElement).style.opacity = '0.4';
                                                    }, 0);
                                                }}
                                                onDragEnd={e => {
                                                    (e.target as HTMLElement).style.opacity = '1';
                                                    setDraggingLeadId(null);
                                                    setDragOverStage(null);
                                                }}
                                                onClick={() => openDetail(lead)}
                                                style={{
                                                    background: selectedLeadIds.has(lead._id) ? '#eef2ff' : (draggingLeadId === lead._id ? '#f8fafc' : 'white'),
                                                    borderRadius: 12,
                                                    border: selectedLeadIds.has(lead._id) ? '1.5px solid #818cf8' : '1px solid #eef0f4',
                                                    padding: '14px',
                                                    marginBottom: 8,
                                                    cursor: 'grab',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    position: 'relative',
                                                    userSelect: 'none',
                                                }}
                                                onMouseEnter={e => {
                                                    if (!draggingLeadId) {
                                                        (e.currentTarget as any).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                                                        (e.currentTarget as any).style.transform = 'translateY(-2px)';
                                                        (e.currentTarget as any).style.borderColor = '#d1d5f0';
                                                    }
                                                }}
                                                onMouseLeave={e => {
                                                    (e.currentTarget as any).style.boxShadow = 'none';
                                                    (e.currentTarget as any).style.transform = 'translateY(0)';
                                                    (e.currentTarget as any).style.borderColor = '#eef0f4';
                                                }}
                                            >
                                                {/* Selection checkbox */}
                                                <div
                                                    onClick={e => toggleLeadSelection(lead._id, e)}
                                                    style={{
                                                        position: 'absolute', top: 8, right: 8, zIndex: 2,
                                                        width: 22, height: 22, borderRadius: 6,
                                                        border: selectedLeadIds.has(lead._id) ? '2px solid #6366f1' : '2px solid #d1d5db',
                                                        background: selectedLeadIds.has(lead._id) ? '#6366f1' : 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                        opacity: selectedLeadIds.has(lead._id) ? 1 : 0.4,
                                                    }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                                    onMouseLeave={e => { if (!selectedLeadIds.has(lead._id)) (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                                                >
                                                    {selectedLeadIds.has(lead._id) && (
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                                    {lead.avatar ? (
                                                        <img src={lead.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
                                                    ) : (
                                                        <div style={{
                                                            width: 36, height: 36, borderRadius: 10,
                                                            background: stage.gradient,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: 'white', fontWeight: 700, fontSize: 14,
                                                            boxShadow: `0 2px 8px ${stage.color}30`,
                                                        }}>{lead.name.charAt(0).toUpperCase()}</div>
                                                    )}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                                                        {lead.phone && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{lead.phone}</div>}
                                                    </div>
                                                </div>

                                                {/* Meta Row */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 10.5, fontWeight: 600,
                                                        padding: '2px 8px',
                                                        borderRadius: 6,
                                                        background: '#f1f5f9',
                                                        color: '#475569',
                                                    }}>
                                                        {SOURCE_ICONS[lead.source] || '📌'} {SOURCE_LABELS[lead.source] || lead.source}
                                                    </span>
                                                    {lead.tags?.slice(0, 2).map(tag => (
                                                        <span key={tag} style={{
                                                            fontSize: 10.5, fontWeight: 500,
                                                            padding: '2px 7px',
                                                            borderRadius: 6,
                                                            background: '#f8fafc',
                                                            color: '#64748b',
                                                            border: '1px solid #e2e8f0',
                                                        }}>{tag}</span>
                                                    ))}
                                                </div>

                                                {/* Activity */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                                                    {lead.conversationCount > 0 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                                                            <MessageSquare size={11} /> {lead.conversationCount}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 'auto' }}>
                                                        {dayjs(lead.createdAt).fromNow()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}

                                        {stageLeads.length === 0 && (
                                            <div style={{
                                                textAlign: 'center',
                                                padding: '40px 16px',
                                                color: '#94a3b8',
                                            }}>
                                                <div style={{
                                                    width: 48, height: 48,
                                                    borderRadius: 14,
                                                    background: '#f1f5f9',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    margin: '0 auto 12px',
                                                    fontSize: 20,
                                                }}>{stage.icon}</div>
                                                <div style={{ fontSize: 12.5, fontWeight: 500 }}>Trống</div>
                                                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>Kéo lead vào đây</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ═══ List View ═══ */
                    <div style={{
                        borderRadius: 16,
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfd' }}>
                                    {['', 'Khách hàng', 'Liên hệ', 'Nguồn', 'Giai đoạn', 'Ngày tạo', ''].map((h, i) => (
                                        <th key={i} style={{
                                            textAlign: i === 6 ? 'center' : (i === 0 ? 'center' : 'left'),
                                            padding: i === 0 ? '12px 8px 12px 16px' : '12px 16px',
                                            fontSize: 11.5,
                                            fontWeight: 600,
                                            color: '#64748b',
                                            textTransform: 'uppercase' as const,
                                            letterSpacing: 0.5,
                                            width: i === 0 ? 40 : 'auto',
                                        }}>
                                            {i === 0 ? (
                                                <div
                                                    onClick={selectAllLeads}
                                                    style={{
                                                        width: 20, height: 20, borderRadius: 5,
                                                        border: selectedLeadIds.size === leads.length && leads.length > 0 ? '2px solid #6366f1' : '2px solid #d1d5db',
                                                        background: selectedLeadIds.size === leads.length && leads.length > 0 ? '#6366f1' : 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', margin: '0 auto',
                                                    }}
                                                >
                                                    {selectedLeadIds.size === leads.length && leads.length > 0 && (
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </div>
                                            ) : h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map(lead => {
                                    const stageInfo = STAGES.find(s => s.key === lead.stage);
                                    return (
                                        <tr
                                            key={lead._id}
                                            onClick={() => openDetail(lead)}
                                            style={{
                                                borderBottom: '1px solid #f8fafc',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                                background: selectedLeadIds.has(lead._id) ? '#eef2ff' : 'transparent',
                                            }}
                                            onMouseEnter={e => { if (!selectedLeadIds.has(lead._id)) (e.currentTarget as any).style.background = '#fafbfe'; }}
                                            onMouseLeave={e => { if (!selectedLeadIds.has(lead._id)) (e.currentTarget as any).style.background = 'transparent'; }}
                                        >
                                            <td style={{ padding: '12px 8px 12px 16px', width: 40, textAlign: 'center' }}>
                                                <div
                                                    onClick={e => toggleLeadSelection(lead._id, e)}
                                                    style={{
                                                        width: 20, height: 20, borderRadius: 5,
                                                        border: selectedLeadIds.has(lead._id) ? '2px solid #6366f1' : '2px solid #d1d5db',
                                                        background: selectedLeadIds.has(lead._id) ? '#6366f1' : 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', margin: '0 auto',
                                                    }}
                                                >
                                                    {selectedLeadIds.has(lead._id) && (
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    {lead.avatar ? (
                                                        <img src={lead.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
                                                    ) : (
                                                        <div style={{
                                                            width: 36, height: 36, borderRadius: 10,
                                                            background: stageInfo?.gradient || '#6366f1',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: 'white', fontWeight: 700, fontSize: 14,
                                                        }}>{lead.name.charAt(0).toUpperCase()}</div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{lead.name}</div>
                                                        {lead.email && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{lead.email}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{lead.phone || '—'}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    fontSize: 11.5, fontWeight: 600,
                                                    padding: '3px 10px',
                                                    borderRadius: 6,
                                                    background: '#f1f5f9',
                                                    color: '#475569',
                                                }}>{SOURCE_ICONS[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    fontSize: 11.5, fontWeight: 600,
                                                    padding: '4px 10px',
                                                    borderRadius: 8,
                                                    color: stageInfo?.color,
                                                    background: stageInfo?.bgColor,
                                                    border: `1px solid ${stageInfo?.borderColor}`,
                                                }}>{stageInfo?.label}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Calendar size={12} />
                                                    {dayjs(lead.createdAt).format('DD/MM/YYYY')}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <ChevronRight size={16} color="#cbd5e1" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {leads.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <div style={{
                                    width: 64, height: 64,
                                    borderRadius: 20,
                                    background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 16px',
                                }}>
                                    <Target size={28} color="#818cf8" />
                                </div>
                                <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#334155' }}>Chưa có lead nào</p>
                                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Thêm lead mới hoặc đồng bộ từ Zalo contacts</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Lead Detail Drawer ── */}
            <Drawer
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setSelectedLead(null); }}
                title={null}
                width={460}
                closable={false}
                styles={{ body: { padding: 0, background: '#fafbfc' } }}
            >
                {selectedLead && (() => {
                    const stageInfo = STAGES.find(s => s.key === selectedLead.stage);
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* ── Drawer Header ── */}
                            <div style={{
                                padding: '24px 28px',
                                background: stageInfo?.gradient || '#6366f1',
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
                                <div style={{ position: 'absolute', right: 40, bottom: -30, width: 60, height: 60, background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        {selectedLead.avatar ? (
                                            <img src={selectedLead.avatar} alt="" style={{
                                                width: 56, height: 56, borderRadius: 16, objectFit: 'cover',
                                                border: '3px solid rgba(255,255,255,0.3)',
                                            }} />
                                        ) : (
                                            <div style={{
                                                width: 56, height: 56, borderRadius: 16,
                                                background: 'rgba(255,255,255,0.15)',
                                                backdropFilter: 'blur(10px)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontWeight: 700, fontSize: 22,
                                                border: '2px solid rgba(255,255,255,0.2)',
                                            }}>{selectedLead.name.charAt(0).toUpperCase()}</div>
                                        )}
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white', letterSpacing: -0.3 }}>
                                                {selectedLead.name}
                                            </h3>
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                marginTop: 6,
                                                fontSize: 11.5, fontWeight: 600,
                                                padding: '3px 10px',
                                                borderRadius: 6,
                                                background: 'rgba(255,255,255,0.2)',
                                                backdropFilter: 'blur(10px)',
                                                color: 'white',
                                            }}>
                                                {stageInfo?.icon} {stageInfo?.label}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => { setDrawerOpen(false); setSelectedLead(null); }} style={{
                                        background: 'rgba(255,255,255,0.15)',
                                        border: 'none',
                                        borderRadius: 10,
                                        padding: 8,
                                        cursor: 'pointer',
                                        color: 'white',
                                        transition: 'all 0.2s',
                                    }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* ── Contact Info ── */}
                            <div style={{ padding: '18px 28px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Thông tin liên hệ</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {selectedLead.phone && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Phone size={15} color="#10b981" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>Số điện thoại</div>
                                                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{selectedLead.phone}</div>
                                            </div>
                                        </div>
                                    )}
                                    {selectedLead.email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Mail size={15} color="#6366f1" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>Email</div>
                                                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{selectedLead.email}</div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Globe size={15} color="#64748b" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>Nguồn</div>
                                            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>
                                                {SOURCE_ICONS[selectedLead.source]} {SOURCE_LABELS[selectedLead.source] || selectedLead.source}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── AI Insights Panel ── */}
                            <div style={{ padding: '18px 28px', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', borderBottom: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Sparkles size={14} color="#f59e0b" />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Insights</span>
                                    </div>
                                    <button
                                        disabled={aiAnalyzing}
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (aiAnalyzing || !selectedLead) return;
                                            // Find conversation for this lead
                                            setAiAnalyzing(true);
                                            try {
                                                // Get list of conversations filtered by this visitor
                                                const { httpClient } = await import('../../../lib/http/client');
                                                const convRes = await httpClient.get(`/workspaces/${workspaceId}/conversations`, { params: { limit: 1 } });
                                                const convs = convRes?.data?.data?.items || convRes?.data?.data || [];
                                                
                                                // Find conversation matching this lead's Zalo/FB ID
                                                let targetConvId = '';
                                                for (const conv of convs) {
                                                    const visitorName = conv.visitorInfo?.name || '';
                                                    if (visitorName === selectedLead.name || 
                                                        (selectedLead.zaloUserId && conv.visitorId === `zalo_${(selectedLead as any).zaloUserId}`)) {
                                                        targetConvId = conv._id;
                                                        break;
                                                    }
                                                }
                                                
                                                if (!targetConvId && convs.length > 0) {
                                                    // Try to find by searching more conversations
                                                    const allConvRes = await httpClient.get(`/workspaces/${workspaceId}/conversations`, { params: { limit: 100 } });
                                                    const allConvs = allConvRes?.data?.data?.items || allConvRes?.data?.data || [];
                                                    for (const conv of allConvs) {
                                                        const vName = conv.visitorInfo?.name || '';
                                                        if (vName === selectedLead.name ||
                                                            ((selectedLead as any).zaloUserId && conv.visitorId === `zalo_${(selectedLead as any).zaloUserId}`) ||
                                                            ((selectedLead as any).fbUserId && conv.visitorId === `fb_${(selectedLead as any).fbUserId}`)) {
                                                            targetConvId = conv._id;
                                                            break;
                                                        }
                                                    }
                                                }
                                                
                                                if (targetConvId) {
                                                    const res = await leadService.aiAnalyze(workspaceId as string, targetConvId, true);
                                                    if (res?.data?.analysis) {
                                                        message.success(`✅ AI: ${res.data.analysis.summary || 'Đã phân tích'}`);
                                                        // Refresh lead data
                                                        if (res.data.lead) {
                                                            setSelectedLead(res.data.lead);
                                                            setLeads(prev => prev.map(l => l._id === res.data.lead._id ? res.data.lead : l));
                                                        }
                                                    } else {
                                                        message.info('Không đủ tin nhắn để phân tích');
                                                    }
                                                } else {
                                                    message.warning('Không tìm thấy cuộc hội thoại cho lead này');
                                                }
                                            } catch (err: any) {
                                                message.error(`Lỗi: ${err?.message || 'Không thể phân tích'}`);
                                            } finally {
                                                setAiAnalyzing(false);
                                            }
                                        }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontSize: 11, fontWeight: 600,
                                            padding: '4px 10px', borderRadius: 6,
                                            background: aiAnalyzing ? '#fde68a' : '#f59e0b',
                                            color: 'white', border: 'none',
                                            cursor: aiAnalyzing ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {aiAnalyzing ? <Spin size="small" /> : <RefreshCw size={11} />}
                                        {aiAnalyzing ? 'Đang phân tích...' : 'Phân tích AI'}
                                    </button>
                                </div>

                                {/* Show AI-extracted info from lead tags/notes */}
                                {(() => {
                                    const intentTag = selectedLead.tags?.find(t => t.startsWith('intent:'));
                                    const sentimentTag = selectedLead.tags?.find(t => t.startsWith('sentiment:'));
                                    const urgencyTag = selectedLead.tags?.find(t => t.startsWith('urgency:'));
                                    const productTags = selectedLead.tags?.filter(t => t.startsWith('product:')) || [];
                                    const aiNote = selectedLead.notes?.find(n => n.text?.startsWith('🤖 AI'));

                                    const intentLabels: Record<string, string> = {
                                        'intent:mua_hàng': '🛒 Muốn mua hàng',
                                        'intent:hỏi_giá': '💰 Hỏi giá',
                                        'intent:hỗ_trợ': '🔧 Cần hỗ trợ',
                                        'intent:khiếu_nại': '⚠️ Khiếu nại',
                                        'intent:khác': '💬 Khác',
                                    };
                                    const sentimentLabels: Record<string, { label: string; color: string }> = {
                                        'sentiment:tích_cực': { label: '😊 Tích cực', color: '#10b981' },
                                        'sentiment:trung_lập': { label: '😐 Trung lập', color: '#64748b' },
                                        'sentiment:tiêu_cực': { label: '😞 Tiêu cực', color: '#ef4444' },
                                    };

                                    if (!intentTag && !sentimentTag && !aiNote && selectedLead.score === 0) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '8px 0', color: '#92400e', fontSize: 12 }}>
                                                <Brain size={20} style={{ opacity: 0.5, margin: '0 auto 6px', display: 'block' }} />
                                                Nhấn "Phân tích AI" để trích xuất thông tin khách hàng tự động
                                            </div>
                                        );
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {/* Intent + Score Row */}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {intentTag && (
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 600,
                                                        padding: '4px 10px', borderRadius: 8,
                                                        background: 'white', color: '#92400e',
                                                        border: '1px solid #fde68a',
                                                    }}>{intentLabels[intentTag] || intentTag.replace('intent:', '')}</span>
                                                )}
                                                {sentimentTag && (
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 600,
                                                        padding: '4px 10px', borderRadius: 8,
                                                        background: 'white',
                                                        color: sentimentLabels[sentimentTag]?.color || '#64748b',
                                                        border: '1px solid #e2e8f0',
                                                    }}>{sentimentLabels[sentimentTag]?.label || sentimentTag.replace('sentiment:', '')}</span>
                                                )}
                                                {selectedLead.score > 0 && (
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 700,
                                                        padding: '4px 10px', borderRadius: 8,
                                                        background: selectedLead.score >= 70 ? '#dcfce7' : selectedLead.score >= 40 ? '#fef3c7' : '#fee2e2',
                                                        color: selectedLead.score >= 70 ? '#166534' : selectedLead.score >= 40 ? '#92400e' : '#991b1b',
                                                        border: `1px solid ${selectedLead.score >= 70 ? '#a7f3d0' : selectedLead.score >= 40 ? '#fde68a' : '#fecaca'}`,
                                                    }}>🎯 Score: {selectedLead.score}/100</span>
                                                )}
                                            </div>
                                            {/* Product Tags */}
                                            {productTags.length > 0 && (
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {productTags.map(t => (
                                                        <span key={t} style={{
                                                            fontSize: 11, fontWeight: 500,
                                                            padding: '2px 8px', borderRadius: 6,
                                                            background: 'white', color: '#6366f1',
                                                            border: '1px solid #c7d2fe',
                                                        }}>🏷️ {t.replace('product:', '')}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {/* AI Summary */}
                                            {aiNote && (
                                                <div style={{
                                                    fontSize: 12, lineHeight: 1.5,
                                                    padding: '8px 12px', borderRadius: 8,
                                                    background: 'white', color: '#475569',
                                                    border: '1px solid #fde68a',
                                                }}>
                                                    {aiNote.text}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* ── Stage Pipeline ── */}
                            <div style={{ padding: '18px 28px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Chuyển giai đoạn</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {STAGES.map(s => {
                                        const isActive = selectedLead.stage === s.key;
                                        return (
                                            <button key={s.key} onClick={() => handleStageChange(selectedLead._id, s.key)} style={{
                                                padding: '6px 14px',
                                                borderRadius: 8,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                background: isActive ? s.gradient : s.bgColor,
                                                color: isActive ? 'white' : s.color,
                                                boxShadow: isActive ? `0 2px 8px ${s.color}30` : 'none',
                                            }}>
                                                {s.icon} {s.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Notes ── */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
                                    Ghi chú ({selectedLead.notes?.length || 0})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {(selectedLead.notes || []).map((note: any, i: number) => (
                                        <div key={i} style={{
                                            borderRadius: 12,
                                            background: 'white',
                                            border: '1px solid #e8ecf0',
                                            padding: '14px 16px',
                                        }}>
                                            <p style={{ margin: 0, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.text}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8

 }}>
                                                <Clock size={11} color="#cbd5e1" />
                                                <span style={{ fontSize: 11, color: '#cbd5e1' }}>{dayjs(note.createdAt).fromNow()}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {(!selectedLead.notes || selectedLead.notes.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: '30px 0', color: '#cbd5e1' }}>
                                            <Star size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                                            <div style={{ fontSize: 12.5 }}>Chưa có ghi chú</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Note Input + Actions ── */}
                            <div style={{ borderTop: '1px solid #e8ecf0', padding: '16px 28px 20px', background: 'white' }}>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <input
                                        value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        placeholder="Thêm ghi chú..."
                                        style={{
                                            flex: 1, height: 40, padding: '0 14px',
                                            borderRadius: 10,
                                            border: '1.5px solid #e2e8f0',
                                            fontSize: 13, outline: 'none',
                                            transition: 'all 0.2s',
                                        }}
                                        onFocus={e => { e.target.style.borderColor = '#818cf8'; }}
                                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                                    />
                                    <button onClick={handleAddNote} disabled={!noteText.trim()} style={{
                                        height: 40, width: 40,
                                        borderRadius: 10,
                                        background: noteText.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
                                        border: 'none',
                                        cursor: noteText.trim() ? 'pointer' : 'default',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white',
                                        transition: 'all 0.2s',
                                    }}>
                                        <Send size={15} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => { if (confirm('Xoá lead này?')) handleDeleteLead(selectedLead._id); }}
                                    style={{
                                        width: '100%', height: 38,
                                        borderRadius: 10,
                                        border: '1.5px solid #fecaca',
                                        background: '#fff5f5',
                                        color: '#ef4444',
                                        fontSize: 12.5, fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as any).style.background = '#fef2f2'; }}
                                    onMouseLeave={e => { (e.currentTarget as any).style.background = '#fff5f5'; }}
                                >
                                    <Trash2 size={14} /> Xoá lead
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Drawer>

            {/* ── Create Lead Modal ── */}
            <Modal
                open={createModalOpen}
                title={null}
                onCancel={() => setCreateModalOpen(false)}
                footer={null}
                width={480}
                styles={{ body: { padding: 0 } }}
            >
                <div style={{ padding: '24px 28px 0' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                        <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: '#6366f1' }} />
                        Thêm Lead mới
                    </h3>
                    <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: 13 }}>Nhập thông tin khách hàng tiềm năng</p>
                </div>
                <div style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                        { key: 'name', label: 'Tên khách hàng *', placeholder: 'Nguyễn Văn A', icon: <User2 size={15} color="#6366f1" /> },
                        { key: 'phone', label: 'Số điện thoại', placeholder: '0912 345 678', icon: <Phone size={15} color="#10b981" /> },
                        { key: 'email', label: 'Email', placeholder: 'email@example.com', icon: <Mail size={15} color="#0ea5e9" /> },
                    ].map(f => (
                        <div key={f.key}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>{f.label}</label>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                                    width: 30, height: 30, borderRadius: 8,
                                    background: '#f8fafc',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{f.icon}</div>
                                <input
                                    value={(newLead as any)[f.key]}
                                    onChange={e => setNewLead(p => ({ ...p, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    style={{
                                        width: '100%', height: 44, paddingLeft: 52, paddingRight: 14,
                                        borderRadius: 10, border: '1.5px solid #e2e8f0',
                                        fontSize: 13.5, outline: 'none', transition: 'all 0.2s',
                                    }}
                                    onFocus={e => { e.target.style.borderColor = '#818cf8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)'; }}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>
                    ))}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Nguồn</label>
                        <Select value={newLead.source} onChange={v => setNewLead(p => ({ ...p, source: v }))} style={{ width: '100%', height: 44 }}
                            options={[
                                { value: 'manual', label: '✋ Thủ công' },
                                { value: 'zalo', label: '💬 Zalo' },
                                { value: 'facebook', label: '📘 Facebook' },
                                { value: 'widget', label: '🌐 Widget' },
                            ]}
                        />
                    </div>
                </div>
                <div style={{
                    padding: '16px 28px',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                }}>
                    <button onClick={() => setCreateModalOpen(false)} style={{
                        height: 40, padding: '0 20px',
                        borderRadius: 10,
                        border: '1.5px solid #e2e8f0',
                        background: 'white',
                        fontSize: 13, fontWeight: 600, color: '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}>Huỷ</button>
                    <button onClick={handleCreateLead} style={{
                        height: 40, padding: '0 24px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        fontSize: 13, fontWeight: 600, color: 'white',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                        transition: 'all 0.2s',
                    }}>Tạo Lead</button>
                </div>
            </Modal>

            {/* ── Group Import Modal ── */}
            <Modal
                open={groupImportOpen}
                title={null}
                onCancel={() => { setGroupImportOpen(false); setSelectedGroup(null); setAutoFriendJob(null); setMemberAnalysis({}); }}
                footer={null}
                width={720}
                styles={{ body: { padding: 0 } }}
            >
                {/* Modal Header */}
                <div style={{
                    padding: '20px 28px 16px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Users size={20} /> Quản lý Thành viên Nhóm Zalo
                    </h3>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>
                        {selectedGroup ? `${selectedGroup.name} — Kết bạn, Nhắn tin, Phân tích lead` : 'Chọn nhóm để xem thành viên'}
                    </p>
                </div>

                <div style={{ padding: '16px 28px 24px', maxHeight: 480, overflowY: 'auto' }}>
                    {!selectedGroup ? (
                        /* ═══ Step 1: Group List ═══ */
                        groupsLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
                        ) : groups.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                <Users size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Không tìm thấy nhóm</div>
                                <div style={{ fontSize: 12.5 }}>Hãy đảm bảo tài khoản Zalo đã kết nối</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {groups.map(g => (
                                    <div
                                        key={g.groupId}
                                        onClick={async () => {
                                            setSelectedGroup(g);
                                            setMembersLoading(true);
                                            setMemberAnalysis({});
                                            try {
                                                const res = await zaloApiService.getGroupMembers(workspaceId as string, g.groupId);
                                                const items = res?.data?.items || [];
                                                setGroupMembers(items);
                                                setSelectedMembers(new Set(items.map((m: any) => m.userId)));
                                            } catch { message.error('Lỗi tải thành viên nhóm'); }
                                            finally { setMembersLoading(false); }
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 14,
                                            padding: '14px 16px',
                                            borderRadius: 12,
                                            border: '1px solid #e8ecf0',
                                            background: 'white',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as any).style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; (e.currentTarget as any).style.borderColor = '#c7d2fe'; (e.currentTarget as any).style.transform = 'translateY(-1px)'; }}
                                        onMouseLeave={e => { (e.currentTarget as any).style.boxShadow = 'none'; (e.currentTarget as any).style.borderColor = '#e8ecf0'; (e.currentTarget as any).style.transform = 'none'; }}
                                    >
                                        {g.avatar ? (
                                            <img src={g.avatar} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 12,
                                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontWeight: 700, fontSize: 16,
                                            }}>{g.name.charAt(0).toUpperCase()}</div>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Users size={12} /> {g.memberCount} thành viên
                                                {g.description && <span>• {g.description.substring(0, 40)}</span>}
                                            </div>
                                        </div>
                                        <ChevronRight size={18} color="#cbd5e1" />
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        /* ═══ Step 2: Enhanced Member List ═══ */
                        membersLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
                        ) : (
                            <div>
                                {/* Back + Toolbar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                                    <button onClick={() => { setSelectedGroup(null); setGroupMembers([]); setSelectedMembers(new Set()); setAutoFriendJob(null); setMemberAnalysis({}); }} style={{
                                        background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px',
                                        fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        ← Quay lại
                                    </button>
                                    <div style={{ flex: 1 }} />
                                    {/* Analyze All Button */}
                                    <Tooltip title="Phân tích hành vi tất cả thành viên">
                                        <button
                                            disabled={analyzingMembers}
                                            onClick={async () => {
                                                setAnalyzingMembers(true);
                                                try {
                                                    const userIds = groupMembers.map(m => m.userId);
                                                    const res = await zaloApiService.batchAnalyzeMembers(workspaceId as string, userIds);
                                                    const analysisMap: Record<string, any> = {};
                                                    (res?.data?.items || []).forEach((a: any) => { analysisMap[a.userId] = a; });
                                                    setMemberAnalysis(analysisMap);
                                                    message.success('Đã phân tích xong!');
                                                } catch { message.error('Lỗi phân tích hành vi'); }
                                                finally { setAnalyzingMembers(false); }
                                            }}
                                            style={{
                                                background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8,
                                                padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#475569',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                            }}
                                        >
                                            {analyzingMembers ? <Spin size="small" /> : <BarChart3 size={13} />}
                                            Phân tích
                                        </button>
                                    </Tooltip>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={selectedMembers.size === groupMembers.length && groupMembers.length > 0}
                                            onChange={e => { e.target.checked ? setSelectedMembers(new Set(groupMembers.map(m => m.userId))) : setSelectedMembers(new Set()); }}
                                            style={{ width: 15, height: 15, accentColor: '#6366f1' }} />
                                        Tất cả ({groupMembers.length})
                                    </label>
                                </div>

                                {/* Auto-Friend Progress Bar */}
                                {autoFriendJob && autoFriendJob.status === 'running' && (
                                    <div style={{
                                        padding: '12px 16px', borderRadius: 10, marginBottom: 12,
                                        background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                                        border: '1px solid #c7d2fe',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <Spin size="small" />
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#4338ca' }}>Đang gửi lời mời kết bạn...</span>
                                        </div>
                                        <Progress
                                            percent={autoFriendJob.totalMembers ? Math.round(((autoFriendJob.sent + autoFriendJob.skipped + autoFriendJob.failed) / autoFriendJob.totalMembers) * 100) : 0}
                                            strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
                                            size="small"
                                        />
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                            ✅ Gửi: {autoFriendJob.sent} • ⏭️ Bỏ qua: {autoFriendJob.skipped} • ❌ Lỗi: {autoFriendJob.failed}
                                            {autoFriendJob.currentMember && <span> • Đang xử lý: <strong>{autoFriendJob.currentMember}</strong></span>}
                                        </div>
                                    </div>
                                )}
                                {autoFriendJob && autoFriendJob.status === 'completed' && (
                                    <div style={{
                                        padding: '12px 16px', borderRadius: 10, marginBottom: 12,
                                        background: '#ecfdf5', border: '1px solid #a7f3d0',
                                    }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#059669' }}>
                                            ✅ Hoàn tất! Đã gửi {autoFriendJob.sent} lời mời, bỏ qua {autoFriendJob.skipped} (đã là bạn: {autoFriendJob.alreadyFriends})
                                        </div>
                                    </div>
                                )}

                                {/* Members grid — Enhanced */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {groupMembers.map(m => {
                                        const analysis = memberAnalysis[m.userId];
                                        const potentialBadge = analysis ? (
                                            analysis.potentialLevel === 'hot' ? { emoji: '🔥', label: 'Nóng', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
                                            : analysis.potentialLevel === 'warm' ? { emoji: '🌡️', label: 'Ấm', bg: '#fffbeb', color: '#d97706', border: '#fde68a' }
                                            : { emoji: '❄️', label: 'Lạnh', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' }
                                        ) : null;
                                        return (
                                            <div key={m.userId} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 14px', borderRadius: 10,
                                                border: selectedMembers.has(m.userId) ? '1.5px solid #c7d2fe' : '1px solid #f1f5f9',
                                                background: selectedMembers.has(m.userId) ? '#f8f7ff' : 'white',
                                                transition: 'all 0.15s',
                                            }}>
                                                <input type="checkbox" checked={selectedMembers.has(m.userId)}
                                                    onChange={e => { const next = new Set(selectedMembers); e.target.checked ? next.add(m.userId) : next.delete(m.userId); setSelectedMembers(next); }}
                                                    style={{ width: 15, height: 15, accentColor: '#6366f1', flexShrink: 0 }} />
                                                {m.avatar ? (
                                                    <img src={m.avatar} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{
                                                        width: 34, height: 34, borderRadius: 9,
                                                        background: m.role === 'admin' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'white', fontSize: 13, fontWeight: 700,
                                                    }}>{m.displayName?.charAt(0)?.toUpperCase() || '?'}</div>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {m.displayName}
                                                    </div>
                                                    {analysis && (
                                                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                                                            💬 {analysis.totalMessages} tin • ⏱️ {analysis.daysSinceActive < 999 ? `${analysis.daysSinceActive}d` : 'N/A'}
                                                            {analysis.sharedPhone && ' • 📱'}
                                                            {analysis.sharedEmail && ' • 📧'}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Behavior badge */}
                                                {potentialBadge && (
                                                    <Tooltip title={`${analysis.recommendation} (Score: ${analysis.engagementScore})`}>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                                            background: potentialBadge.bg, color: potentialBadge.color,
                                                            border: `1px solid ${potentialBadge.border}`, cursor: 'help',
                                                            whiteSpace: 'nowrap',
                                                        }}>{potentialBadge.emoji} {potentialBadge.label}</span>
                                                    </Tooltip>
                                                )}
                                                {m.role === 'admin' && (
                                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>Admin</span>
                                                )}
                                                {/* Action buttons */}
                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                    <Tooltip title="Nhắn tin riêng">
                                                        <button onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${workspaceId}/inbox?dm=${m.userId}`); setGroupImportOpen(false); }}
                                                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                                                            onMouseEnter={e => { (e.currentTarget).style.background = '#eef2ff'; (e.currentTarget).style.borderColor = '#818cf8'; }}
                                                            onMouseLeave={e => { (e.currentTarget).style.background = 'white'; (e.currentTarget).style.borderColor = '#e2e8f0'; }}
                                                        ><MessageSquare size={13} color="#6366f1" /></button>
                                                    </Tooltip>
                                                    <Tooltip title="Kết bạn">
                                                        <button onClick={async (e) => {
                                                            e.stopPropagation();
                                                            try {
                                                                await zaloApiService.autoFriendGroup(workspaceId as string, selectedGroup.groupId, { message: friendMsg, selectedUserIds: [m.userId] });
                                                                message.success(`Đã gửi lời mời kết bạn tới ${m.displayName}`);
                                                            } catch { message.error('Lỗi gửi lời mời'); }
                                                        }}
                                                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                                                            onMouseEnter={e => { (e.currentTarget).style.background = '#ecfdf5'; (e.currentTarget).style.borderColor = '#6ee7b7'; }}
                                                            onMouseLeave={e => { (e.currentTarget).style.background = 'white'; (e.currentTarget).style.borderColor = '#e2e8f0'; }}
                                                        ><UserPlus size={13} color="#10b981" /></button>
                                                    </Tooltip>
                                                    <Tooltip title="Phân tích hành vi">
                                                        <button onClick={async (e) => {
                                                            e.stopPropagation();
                                                            try {
                                                                const res = await zaloApiService.analyzeMember(workspaceId as string, m.userId);
                                                                setAnalysisDrawer(res?.data);
                                                            } catch { message.error('Lỗi phân tích'); }
                                                        }}
                                                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                                                            onMouseEnter={e => { (e.currentTarget).style.background = '#fef3c7'; (e.currentTarget).style.borderColor = '#fbbf24'; }}
                                                            onMouseLeave={e => { (e.currentTarget).style.background = 'white'; (e.currentTarget).style.borderColor = '#e2e8f0'; }}
                                                        ><Activity size={13} color="#f59e0b" /></button>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}
                </div>

                {/* Footer with action buttons */}
                {selectedGroup && !membersLoading && groupMembers.length > 0 && (
                    <div style={{
                        padding: '14px 28px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                    }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                            <strong style={{ color: '#6366f1' }}>{selectedMembers.size}</strong> / {groupMembers.length}
                        </span>

                        {/* Auto-friend all selected */}
                        <Tooltip title="Gửi lời mời kết bạn cho tất cả thành viên đã chọn (anti-spam 8s/lần)">
                            <button
                                disabled={selectedMembers.size === 0 || autoFriendRunning}
                                onClick={async () => {
                                    setAutoFriendRunning(true);
                                    try {
                                        await zaloApiService.autoFriendGroup(workspaceId as string, selectedGroup.groupId, {
                                            message: friendMsg,
                                            selectedUserIds: [...selectedMembers],
                                        });
                                        // Start polling
                                        const poll = setInterval(async () => {
                                            try {
                                                const res = await zaloApiService.getAutoFriendStatus(workspaceId as string, selectedGroup.groupId);
                                                setAutoFriendJob(res?.data);
                                                if (res?.data?.status !== 'running') {
                                                    clearInterval(poll);
                                                    setAutoFriendRunning(false);
                                                }
                                            } catch { clearInterval(poll); setAutoFriendRunning(false); }
                                        }, 3000);
                                        message.info('Bắt đầu gửi lời mời kết bạn...');
                                    } catch { message.error('Lỗi bắt đầu auto-friend'); setAutoFriendRunning(false); }
                                }}
                                style={{
                                    height: 36, padding: '0 14px', borderRadius: 8, border: '1.5px solid #6ee7b7',
                                    background: selectedMembers.size > 0 ? 'white' : '#f1f5f9',
                                    fontSize: 12, fontWeight: 600, color: '#059669',
                                    cursor: selectedMembers.size > 0 ? 'pointer' : 'default',
                                    display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                                }}
                            >
                                {autoFriendRunning ? <Spin size="small" /> : <UserPlus size={14} />}
                                Kết bạn ({selectedMembers.size})
                            </button>
                        </Tooltip>

                        <div style={{ flex: 1 }} />

                        {/* Import as leads */}
                        <button
                            disabled={selectedMembers.size === 0 || importing}
                            onClick={async () => {
                                setImporting(true);
                                try {
                                    const membersToImport = groupMembers.filter(m => selectedMembers.has(m.userId)).map(m => ({
                                        userId: m.userId,
                                        displayName: m.displayName,
                                        avatar: m.avatar || '',
                                    }));
                                    const res = await leadService.bulkConvertFromGroup(workspaceId as string, {
                                        groupId: selectedGroup.groupId,
                                        groupName: selectedGroup.name,
                                        members: membersToImport,
                                    });
                                    message.success(`Đã tạo ${res?.data?.created || 0} lead, bỏ qua ${res?.data?.skipped || 0}`);
                                    setGroupImportOpen(false); setSelectedGroup(null);
                                    fetchLeads(); fetchStats();
                                } catch { message.error('Lỗi import thành viên'); }
                                finally { setImporting(false); }
                            }}
                            style={{
                                height: 36, padding: '0 18px', borderRadius: 8, border: 'none',
                                background: selectedMembers.size > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
                                fontSize: 12, fontWeight: 600, color: 'white',
                                cursor: selectedMembers.size > 0 ? 'pointer' : 'default',
                                boxShadow: selectedMembers.size > 0 ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
                            }}
                        >
                            {importing ? <Spin size="small" /> : <Zap size={13} />}
                            {importing ? 'Đang import...' : `Tạo Lead (${selectedMembers.size})`}
                        </button>
                    </div>
                )}
            </Modal>

            {/* ── Behavior Analysis Drawer ── */}
            <Drawer
                open={!!analysisDrawer}
                onClose={() => setAnalysisDrawer(null)}
                title={null}
                width={400}
                closable={false}
                styles={{ body: { padding: 0, background: '#fafbfc' } }}
            >
                {analysisDrawer && (() => {
                    const a = analysisDrawer;
                    const potentialConfig = a.potentialLevel === 'hot'
                        ? { emoji: '🔥', label: 'Lead Nóng', gradient: 'linear-gradient(135deg, #ef4444, #f97316)', bg: '#fef2f2' }
                        : a.potentialLevel === 'warm'
                        ? { emoji: '🌡️', label: 'Lead Ấm', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', bg: '#fffbeb' }
                        : { emoji: '❄️', label: 'Lead Lạnh', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', bg: '#f0f9ff' };
                    return (
                        <div>
                            {/* Header */}
                            <div style={{ padding: '24px 28px', background: potentialConfig.gradient, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', right: -15, top: -15, width: 70, height: 70, background: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: 40, marginBottom: 8 }}>{potentialConfig.emoji}</div>
                                        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'white' }}>{potentialConfig.label}</h3>
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{a.recommendation}</div>
                                    </div>
                                    <button onClick={() => setAnalysisDrawer(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'white' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Score Ring */}
                            <div style={{ padding: '24px 28px', background: 'white', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <Progress type="circle" percent={a.engagementScore} size={120}
                                        strokeColor={{ '0%': '#6366f1', '100%': '#8b5cf6' }}
                                        format={p => <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{p}</span>}
                                    />
                                </div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, fontWeight: 500 }}>Điểm tương tác (Engagement Score)</div>
                            </div>

                            {/* Metrics Grid */}
                            <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {[
                                    { label: 'Tổng tin nhắn', value: a.totalMessages, icon: '💬', color: '#6366f1' },
                                    { label: 'Tin nhận', value: a.incomingMessages, icon: '📥', color: '#10b981' },
                                    { label: 'Tin gửi', value: a.outgoingMessages, icon: '📤', color: '#0ea5e9' },
                                    { label: 'Tỷ lệ phản hồi', value: `${a.responseRate}%`, icon: '📊', color: '#f59e0b' },
                                    { label: 'Ngày không hoạt động', value: a.daysSinceActive < 999 ? `${a.daysSinceActive}d` : 'N/A', icon: '⏱️', color: '#8b5cf6' },
                                    { label: 'Khởi tạo hội thoại', value: a.isConversationStarter ? 'Có ✓' : 'Không', icon: '🎯', color: '#ec4899' },
                                ].map((m, i) => (
                                    <div key={i} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #f1f5f9', background: 'white' }}>
                                        <div style={{ fontSize: 18, marginBottom: 6 }}>{m.icon}</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>{m.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Extracted Contact Info */}
                            {(a.sharedPhone || a.sharedEmail) && (
                                <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Thông tin liên hệ trích xuất</div>
                                    {a.extractedPhones?.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <Phone size={14} color="#10b981" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.extractedPhones.join(', ')}</span>
                                        </div>
                                    )}
                                    {a.extractedEmails?.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Mail size={14} color="#6366f1" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.extractedEmails.join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div style={{ padding: '16px 28px' }}>
                                <button onClick={() => { router.push(`/workspace/${workspaceId}/inbox?dm=${a.userId}`); setAnalysisDrawer(null); setGroupImportOpen(false); }}
                                    style={{
                                        width: '100%', height: 44, borderRadius: 12, border: 'none',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: 13, fontWeight: 600, color: 'white',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        boxShadow: '0 4px 14px rgba(99,102,241,0.3)', transition: 'all 0.2s',
                                    }}
                                >
                                    <MessageSquare size={16} /> Nhắn tin tư vấn ngay
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Drawer>

            {/* ═══════ FLOATING BULK ACTION BAR ═══════ */}
            {selectedLeadIds.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 1000,
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(20px)',
                    animation: 'slideUpBar 0.3s ease',
                }}>
                    <style>{`
                        @keyframes slideUpBar {
                            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                            to { opacity: 1; transform: translateX(-50%) translateY(0); }
                        }
                    `}</style>

                    {/* Count badge */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 14px',
                        background: 'rgba(99,102,241,0.2)', borderRadius: 10,
                        border: '1px solid rgba(99,102,241,0.3)',
                    }}>
                        <CheckSquare size={16} color="#a5b4fc" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{selectedLeadIds.size}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>đã chọn</span>
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)' }} />

                    {/* Broadcast Button */}
                    <button
                        onClick={() => setBroadcastOpen(true)}
                        style={{
                            height: 40, padding: '0 20px',
                            borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            transition: 'all 0.15s',
                            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { (e.currentTarget).style.transform = 'translateY(0)'; }}
                    >
                        <Send size={15} /> Gửi tin nhắn hàng loạt
                    </button>

                    {/* Change Stage Button */}
                    <Dropdown
                        open={bulkStageOpen}
                        onOpenChange={setBulkStageOpen}
                        trigger={['click']}
                        dropdownRender={() => (
                            <div style={{
                                background: '#fff', borderRadius: 12, padding: 8,
                                boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                border: '1px solid #e2e8f0',
                                minWidth: 180,
                            }}>
                                {STAGES.map(s => (
                                    <div key={s.key}
                                        onClick={() => handleBulkStageChange(s.key)}
                                        style={{
                                            padding: '10px 14px', borderRadius: 8,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                            fontSize: 13, fontWeight: 500, color: '#1e293b',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget).style.background = s.bgColor; }}
                                        onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
                                    >
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                                        {s.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    >
                        <button style={{
                            height: 40, padding: '0 16px',
                            borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.08)', color: '#e2e8f0',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.08)'; }}
                        >
                            <Target size={14} /> Chuyển giai đoạn
                        </button>
                    </Dropdown>

                    {/* Delete Button */}
                    <button
                        onClick={handleBulkDelete}
                        style={{
                            height: 40, padding: '0 16px',
                            borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(239,68,68,0.25)'; }}
                        onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(239,68,68,0.15)'; }}
                    >
                        <Trash2 size={14} /> Xoá
                    </button>

                    {/* Clear selection */}
                    <button
                        onClick={() => setSelectedLeadIds(new Set())}
                        style={{
                            width: 36, height: 36, borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.1)'; }}
                        onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,0.05)'; }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ═══════ BROADCAST MESSAGE MODAL ═══════ */}
            <Modal
                open={broadcastOpen}
                onCancel={() => { setBroadcastOpen(false); setBroadcastMsg(''); }}
                title={null}
                footer={null}
                width={520}
                styles={{ body: { padding: 0 } }}
                centered
            >
                <div style={{ padding: '28px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                        }}>
                            <Send size={22} color="#fff" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Gửi tin nhắn hàng loạt</h3>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                                Broadcast tới {selectedLeadIds.size} lead đã chọn qua Zalo
                            </p>
                        </div>
                    </div>

                    {/* Recipients preview */}
                    <div style={{
                        padding: '14px 16px', borderRadius: 12,
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        marginBottom: 16,
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Người nhận</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                            {selectedLeadsList.slice(0, 20).map(l => (
                                <span key={l._id} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '4px 12px', borderRadius: 20,
                                    background: l.source === 'zalo' ? '#e0f2fe' : '#f1f5f9',
                                    fontSize: 12, fontWeight: 500,
                                    color: l.source === 'zalo' ? '#0369a1' : '#64748b',
                                    border: `1px solid ${l.source === 'zalo' ? '#bae6fd' : '#e2e8f0'}`,
                                }}>
                                    {SOURCE_ICONS[l.source] || '📌'}
                                    {l.name}
                                    {l.source !== 'zalo' && <span style={{ fontSize: 10, color: '#94a3b8' }}>(bỏ qua)</span>}
                                </span>
                            ))}
                            {selectedLeadsList.length > 20 && (
                                <span style={{ fontSize: 12, color: '#94a3b8', padding: '4px 8px' }}>+{selectedLeadsList.length - 20} người khác</span>
                            )}
                        </div>
                        {selectedLeadsList.filter(l => l.source !== 'zalo').length > 0 && (
                            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                                ⚠️ {selectedLeadsList.filter(l => l.source !== 'zalo').length} lead không phải Zalo sẽ bị bỏ qua. Chỉ lead từ Zalo mới nhận được tin nhắn.
                            </div>
                        )}
                    </div>

                    {/* Message input */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Nội dung tin nhắn</div>
                        <Input.TextArea
                            value={broadcastMsg}
                            onChange={e => setBroadcastMsg(e.target.value)}
                            placeholder="Nhập tin nhắn bạn muốn gửi...

Ví dụ: Xin chào! Bên mình đang có chương trình khuyến mãi đặc biệt. Anh/chị có muốn tìm hiểu thêm không ạ?"
                            rows={5}
                            maxLength={2000}
                            style={{
                                borderRadius: 12, resize: 'none',
                                fontSize: 14, lineHeight: 1.6,
                            }}
                            showCount
                        />
                    </div>

                    {/* Info box */}
                    <div style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: '#f0f9ff', border: '1px solid #bae6fd',
                        fontSize: 12, color: '#0369a1', lineHeight: 1.6,
                        marginBottom: 24,
                    }}>
                        💡 <strong>Lưu ý:</strong> Tin nhắn sẽ được gửi tuần tự với khoảng cách 3 giây giữa mỗi người để tránh bị spam. Cần kết nối Zalo trước khi gửi.
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => { setBroadcastOpen(false); setBroadcastMsg(''); }}
                            style={{
                                height: 44, padding: '0 24px',
                                borderRadius: 12, border: '1px solid #e2e8f0',
                                background: '#fff', color: '#64748b',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            }}
                        >Hủy</button>
                        <button
                            onClick={handleBroadcast}
                            disabled={!broadcastMsg.trim() || broadcastSending}
                            style={{
                                height: 44, padding: '0 28px',
                                borderRadius: 12, border: 'none',
                                background: broadcastMsg.trim() && !broadcastSending
                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                    : '#e2e8f0',
                                color: broadcastMsg.trim() && !broadcastSending ? '#fff' : '#94a3b8',
                                fontSize: 14, fontWeight: 700,
                                cursor: broadcastMsg.trim() && !broadcastSending ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: 8,
                                boxShadow: broadcastMsg.trim() && !broadcastSending ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                                transition: 'all 0.2s',
                            }}
                        >
                            {broadcastSending ? (
                                <><Spin size="small" /> Đang gửi...</>
                            ) : (
                                <><Send size={16} /> Gửi {selectedLeadsList.filter(l => l.source === 'zalo').length} tin nhắn</>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}
