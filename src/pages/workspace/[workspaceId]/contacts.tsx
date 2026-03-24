import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import {
    Input, Table, Tag, Button, Drawer, Descriptions, message, Select,
    Tooltip, Statistic, Empty, Tabs, Badge, Space, Popconfirm, Spin,
} from 'antd';
import {
    Search, Download, Users, UserCheck, Phone, Mail, Globe, Clock,
    MessageSquare, Eye, Edit2, X as XIcon, ArrowLeft, Filter,
} from 'lucide-react';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { httpClient } from '../../../lib/http/client';
import AppLayout from '../../../components/layout/AppLayout';
import type { ColumnsType } from 'antd/es/table';

// ── Types ──
interface Contact {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    channel: 'widget' | 'zalo';
    source?: string;
    avatar?: string;
    totalConversations?: number;
    totalMessages?: number;
    firstSeen: string;
    lastSeen: string;
    lastMessagePreview?: string;
    visitorId?: string;
    zaloUserId?: string;
}

// ── Helpers ──
function timeAgo(dateStr: string) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD} ngày trước`;
    return d.toLocaleDateString('vi-VN');
}

export default function ContactsPage() {
    const router = useRouter();
    const { workspaceId } = router.query as { workspaceId: string };
    const { data: meData, isLoading: meLoading } = useGetMe();

    // State
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchText, setSearchText] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'widget' | 'zalo'>('all');
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [exporting, setExporting] = useState(false);

    // Stats
    const [stats, setStats] = useState({ total: 0, widget: 0, zalo: 0 });

    // ── Fetch contacts ──
    const fetchContacts = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);

        try {
            let widgetContacts: Contact[] = [];
            let zaloContacts: Contact[] = [];
            let wTotal = 0;
            let zTotal = 0;

            // Fetch widget visitors
            if (activeTab === 'all' || activeTab === 'widget') {
                const wRes = await httpClient.get(`/conversations/workspace/${workspaceId}/visitors`, {
                    params: { page, limit: pageSize, search: searchText || undefined },
                });
                const wData = wRes.data?.data;
                wTotal = wData?.total || 0;
                widgetContacts = (wData?.items || []).map((v: any) => ({
                    _id: v._id,
                    name: v.name || v.email || v.visitorId?.slice(0, 8) || 'Khách',
                    email: v.email,
                    phone: v.phone,
                    channel: 'widget' as const,
                    totalConversations: v.totalConversations || 0,
                    firstSeen: v.firstSeenAt || v.createdAt,
                    lastSeen: v.lastSeenAt || v.updatedAt,
                    visitorId: v.visitorId,
                }));
            }

            // Fetch Zalo contacts
            if (activeTab === 'all' || activeTab === 'zalo') {
                try {
                    const zRes = await httpClient.get(`/workspaces/${workspaceId}/zalo/contacts`, {
                        params: { page, limit: pageSize, search: searchText || undefined },
                    });
                    const zData = zRes.data?.data;
                    zTotal = zData?.total || 0;
                    zaloContacts = (zData?.items || []).map((c: any) => ({
                        _id: c._id,
                        name: c.displayName || `Zalo ${c.zaloUserId?.slice(0, 6)}`,
                        phone: c.phoneNumber,
                        channel: 'zalo' as const,
                        source: c.source,
                        avatar: c.avatar,
                        totalMessages: c.totalMessages || 0,
                        firstSeen: c.firstContactAt || c.createdAt,
                        lastSeen: c.lastMessageAt || c.updatedAt,
                        lastMessagePreview: c.lastMessagePreview,
                        zaloUserId: c.zaloUserId,
                    }));
                } catch (e) {
                    // Zalo module might not be active
                    console.warn('Zalo contacts not available:', e);
                }
            }

            // Combine — deduplicate Zalo visitors that appear in BOTH sources
            // Widget visitors with visitorId starting with 'zalo_' are actually Zalo users
            // that got auto-created by handleIncomingZaloMessage. Filter them out when showing 'all'.
            if (activeTab === 'all') {
                // Build a set of Zalo user IDs for dedup
                const zaloUserIds = new Set(zaloContacts.map(c => c.zaloUserId).filter(Boolean));
                
                // Filter widget contacts: remove those that are actually Zalo visitors
                const filteredWidget = widgetContacts.filter(v => {
                    if (!v.visitorId) return true;
                    // If visitorId starts with 'zalo_', strip prefix and check if it's in zaloContacts
                    if (v.visitorId.startsWith('zalo_')) {
                        const zaloId = v.visitorId.replace('zalo_', '');
                        return !zaloUserIds.has(zaloId); // Only keep if NOT in Zalo contacts
                    }
                    return true;
                });
                
                const combined = [...filteredWidget, ...zaloContacts]
                    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
                setContacts(combined);
                setTotal(filteredWidget.length + zTotal);
            } else if (activeTab === 'widget') {
                // When showing widget-only tab, also filter out zalo_ visitors
                const filteredWidget = widgetContacts.filter(v => !v.visitorId?.startsWith('zalo_'));
                setContacts(filteredWidget);
                setTotal(filteredWidget.length);
            } else {
                setContacts(zaloContacts);
                setTotal(zTotal);
            }

            // Update stats — exclude zalo_ visitors from widget count
            const actualWidgetCount = (widgetContacts || []).filter(v => !v.visitorId?.startsWith('zalo_')).length;
            setStats({ total: actualWidgetCount + zTotal, widget: actualWidgetCount, zalo: zTotal });
        } catch (err) {
            console.error('[Contacts] Fetch error:', err);
            message.error('Lỗi tải danh sách liên hệ');
        } finally {
            setLoading(false);
        }
    }, [workspaceId, page, pageSize, searchText, activeTab]);

    useEffect(() => { fetchContacts(); }, [fetchContacts]);

    // ── Export CSV ──
    const handleExport = async () => {
        if (!workspaceId) return;
        setExporting(true);
        try {
            const downloads: Promise<void>[] = [];

            if (activeTab === 'all' || activeTab === 'widget') {
                downloads.push(
                    httpClient.get(`/conversations/workspace/${workspaceId}/visitors/export`, {
                        responseType: 'blob',
                        params: { search: searchText || undefined },
                    }).then(res => {
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `widget_visitors_${new Date().toISOString().slice(0, 10)}.csv`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                    })
                );
            }

            if (activeTab === 'all' || activeTab === 'zalo') {
                downloads.push(
                    httpClient.get(`/workspaces/${workspaceId}/zalo/contacts/export`, {
                        responseType: 'blob',
                    }).then(res => {
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `zalo_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                    }).catch(() => {
                        // Zalo module might not be available
                    })
                );
            }

            await Promise.all(downloads);
            message.success('Đã xuất file CSV thành công!');
        } catch (err) {
            message.error('Lỗi khi export');
        } finally {
            setExporting(false);
        }
    };

    // ── Update contact ──
    const handleUpdateContact = async (contact: Contact, field: string, value: string) => {
        try {
            if (contact.channel === 'widget' && contact.visitorId) {
                await httpClient.patch(`/conversations/workspace/${workspaceId}/visitors/${contact.visitorId}`, {
                    [field]: value,
                });
            } else if (contact.channel === 'zalo' && contact.zaloUserId) {
                const payload: any = {};
                if (field === 'name') payload.displayName = value;
                else if (field === 'phone') payload.phoneNumber = value;
                else payload[field] = value;
                await httpClient.patch(`/workspaces/${workspaceId}/zalo/contacts/${contact.zaloUserId}`, payload);
            }
            message.success('Đã cập nhật');
            setEditingField(null);
            setEditValue('');
            fetchContacts();
            // Also update the selected contact in drawer
            if (selectedContact?._id === contact._id) {
                setSelectedContact({ ...contact, [field]: value } as Contact);
            }
        } catch {
            message.error('Lỗi cập nhật');
        }
    };

    // ── Table columns ──
    const columns: ColumnsType<Contact> = [
        {
            title: 'Tên',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (value: string, record: Contact) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {record.avatar ? (
                        <img src={record.avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{
                            width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: record.channel === 'zalo' ? 'linear-gradient(135deg, #0068ff, #00c3ff)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontSize: 14, fontWeight: 600,
                        }}>
                            {(value || '?')[0]?.toUpperCase()}
                        </div>
                    )}
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: '#1f2937' }}>{value || 'Khách'}</div>
                        {record.email && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{record.email}</div>}
                    </div>
                </div>
            ),
        },
        {
            title: 'Kênh',
            dataIndex: 'channel',
            key: 'channel',
            width: 90,
            align: 'center' as const,
            render: (ch: string) => (
                <Tag color={ch === 'zalo' ? 'blue' : 'purple'} style={{ borderRadius: 12, fontSize: 11.5, padding: '1px 10px' }}>
                    {ch === 'zalo' ? '💬 Zalo' : '🌐 Widget'}
                </Tag>
            ),
        },
        {
            title: 'Liên hệ',
            key: 'contact',
            width: 180,
            render: (_: any, record: Contact) => (
                <div style={{ fontSize: 12.5 }}>
                    {record.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}>
                            <Phone size={12} color="#6b7280" /> {record.phone}
                        </div>
                    )}
                    {record.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}>
                            <Mail size={12} color="#6b7280" /> {record.email}
                        </div>
                    )}
                    {!record.phone && !record.email && <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Chưa có</span>}
                </div>
            ),
        },
        {
            title: 'Hoạt động',
            key: 'activity',
            width: 130,
            render: (_: any, record: Contact) => (
                <div style={{ fontSize: 12.5 }}>
                    <div style={{ color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MessageSquare size={12} color="#6b7280" />
                        {record.totalConversations ?? record.totalMessages ?? 0} {record.channel === 'zalo' ? 'tin nhắn' : 'hội thoại'}
                    </div>
                    {record.lastMessagePreview && (
                        <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                            {record.lastMessagePreview}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Lần cuối',
            dataIndex: 'lastSeen',
            key: 'lastSeen',
            width: 120,
            sorter: (a: Contact, b: Contact) => new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime(),
            defaultSortOrder: 'descend',
            render: (v: string) => (
                <Tooltip title={v ? new Date(v).toLocaleString('vi-VN') : ''}>
                    <span style={{ fontSize: 12.5, color: '#6b7280' }}>{timeAgo(v)}</span>
                </Tooltip>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 60,
            render: (_: any, record: Contact) => (
                <Button
                    type="text"
                    size="small"
                    icon={<Eye size={15} />}
                    onClick={() => { setSelectedContact(record); setDrawerOpen(true); }}
                    style={{ color: '#6366f1' }}
                />
            ),
        },
    ];

    if (meLoading || !workspaceId) {
        return <AppLayout><div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div></AppLayout>;
    }

    return (
        <AppLayout>
            <Head><title>Người dùng | NemarChat</title></Head>

            <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
                {/* ── Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.5px' }}>
                            <Users size={26} style={{ verticalAlign: 'middle', marginRight: 10, color: '#6366f1' }} />
                            Quản lý người dùng
                        </h1>
                        <p style={{ color: '#6b7280', fontSize: 13.5, marginTop: 4, marginBottom: 0 }}>
                            Danh sách tất cả khách hàng đã liên hệ qua Widget và Zalo
                        </p>
                    </div>
                    <Button
                        icon={<Download size={16} />}
                        onClick={handleExport}
                        loading={exporting}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            borderRadius: 8, fontWeight: 500, height: 38,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', border: 'none',
                        }}
                    >
                        Export CSV
                    </Button>
                </div>

                {/* ── Stats Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                    {[
                        { label: 'Tổng liên hệ', value: stats.total, icon: <Users size={20} />, color: '#6366f1', bg: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' },
                        { label: 'Widget Chat', value: stats.widget, icon: <Globe size={20} />, color: '#8b5cf6', bg: 'linear-gradient(135deg, #f5f3ff, #ede9fe)' },
                        { label: 'Zalo', value: stats.zalo, icon: <MessageSquare size={20} />, color: '#0068ff', bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: s.bg, borderRadius: 14, padding: '18px 22px',
                            border: '1px solid rgba(99, 102, 241, 0.1)',
                            display: 'flex', alignItems: 'center', gap: 16,
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)', color: s.color,
                            }}>
                                {s.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{s.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>{s.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Toolbar: Tabs + Search ── */}
                <div style={{
                    background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 20px', borderBottom: '1px solid #f3f4f6',
                    }}>
                        <div style={{ display: 'flex', gap: 0 }}>
                            {([
                                { key: 'all', label: 'Tất cả', count: stats.total },
                                { key: 'widget', label: 'Widget', count: stats.widget },
                                { key: 'zalo', label: 'Zalo', count: stats.zalo },
                            ] as const).map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => { setActiveTab(tab.key); setPage(1); }}
                                    style={{
                                        padding: '8px 18px', border: 'none', cursor: 'pointer',
                                        borderRadius: 8, fontSize: 13, fontWeight: 600,
                                        background: activeTab === tab.key ? '#6366f1' : 'transparent',
                                        color: activeTab === tab.key ? '#fff' : '#6b7280',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {tab.label}
                                    <Badge
                                        count={tab.count}
                                        style={{
                                            marginLeft: 8,
                                            background: activeTab === tab.key ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                                            color: activeTab === tab.key ? '#fff' : '#6b7280',
                                            fontSize: 11, fontWeight: 600, boxShadow: 'none',
                                        }}
                                    />
                                </button>
                            ))}
                        </div>

                        <Input
                            prefix={<Search size={14} color="#9ca3af" />}
                            placeholder="Tìm theo tên, email, SĐT..."
                            value={searchText}
                            onChange={e => { setSearchText(e.target.value); setPage(1); }}
                            allowClear
                            style={{ width: 280, borderRadius: 8, height: 36 }}
                        />
                    </div>

                    {/* ── Table ── */}
                    <Table
                        dataSource={contacts}
                        columns={columns}
                        rowKey="_id"
                        loading={loading}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            onChange: (p, ps) => { setPage(p); setPageSize(ps || 20); },
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '20', '50', '100'],
                            showTotal: (t) => <span style={{ fontSize: 12.5, color: '#6b7280' }}>{t} liên hệ</span>,
                            size: 'small',
                        }}
                        size="middle"
                        scroll={{ x: 800 }}
                        onRow={(record) => ({
                            onClick: () => { setSelectedContact(record); setDrawerOpen(true); },
                            style: { cursor: 'pointer' },
                        })}
                        locale={{ emptyText: <Empty description="Chưa có liên hệ nào" style={{ padding: 40 }} /> }}
                        style={{ borderRadius: 0 }}
                    />
                </div>
            </div>

            {/* ── Contact Detail Drawer ── */}
            <Drawer
                title={null}
                placement="right"
                width={400}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setSelectedContact(null); setEditingField(null); }}
                styles={{ body: { padding: 0 }, header: { display: 'none' } }}
            >
                {selectedContact && (
                    <div>
                        {/* Header */}
                        <div style={{
                            background: selectedContact.channel === 'zalo'
                                ? 'linear-gradient(135deg, #0068ff, #00c3ff)'
                                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            padding: '24px 20px 28px', color: '#fff', position: 'relative',
                        }}>
                            <Button
                                type="text"
                                icon={<XIcon size={18} color="#fff" />}
                                onClick={() => { setDrawerOpen(false); setSelectedContact(null); }}
                                style={{ position: 'absolute', top: 12, right: 12 }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                                {selectedContact.avatar ? (
                                    <img src={selectedContact.avatar} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.3)', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: 56, height: 56, borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 22, fontWeight: 700, border: '3px solid rgba(255,255,255,0.3)',
                                    }}>
                                        {(selectedContact.name || '?')[0]?.toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{selectedContact.name}</h2>
                                    <Tag color="rgba(255,255,255,0.25)" style={{ color: '#fff', borderRadius: 10, marginTop: 4, border: 'none', fontSize: 11.5 }}>
                                        {selectedContact.channel === 'zalo' ? '💬 Zalo' : '🌐 Widget'}
                                        {selectedContact.source ? ` · ${selectedContact.source}` : ''}
                                    </Tag>
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                                    {selectedContact.totalConversations ?? selectedContact.totalMessages ?? 0}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#6b7280' }}>
                                    {selectedContact.channel === 'zalo' ? 'Tin nhắn' : 'Hội thoại'}
                                </div>
                            </div>
                            <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                                    {timeAgo(selectedContact.lastSeen)}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#6b7280' }}>Hoạt động cuối</div>
                            </div>
                        </div>

                        {/* Detail Fields */}
                        <div style={{ padding: '16px 20px' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Thông tin liên hệ
                            </h3>

                            {[
                                { key: 'name', label: 'Tên', icon: <UserCheck size={15} />, value: selectedContact.name },
                                { key: 'email', label: 'Email', icon: <Mail size={15} />, value: selectedContact.email },
                                { key: 'phone', label: 'Số điện thoại', icon: <Phone size={15} />, value: selectedContact.phone },
                            ].map(field => (
                                <div key={field.key} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 0', borderBottom: '1px solid #f3f4f6',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
                                        {field.icon}
                                        <span style={{ fontWeight: 500 }}>{field.label}</span>
                                    </div>
                                    {editingField === field.key ? (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <Input
                                                size="small"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                style={{ width: 140, borderRadius: 6, fontSize: 12.5 }}
                                                autoFocus
                                                onPressEnter={() => handleUpdateContact(selectedContact, field.key, editValue)}
                                            />
                                            <Button size="small" type="primary" style={{ borderRadius: 6, fontSize: 11 }}
                                                onClick={() => handleUpdateContact(selectedContact, field.key, editValue)}>Lưu</Button>
                                            <Button size="small" style={{ borderRadius: 6, fontSize: 11 }}
                                                onClick={() => setEditingField(null)}>Hủy</Button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 13, color: field.value ? '#111827' : '#9ca3af', fontWeight: field.value ? 500 : 400 }}>
                                                {field.value || 'Chưa có'}
                                            </span>
                                            <Tooltip title="Chỉnh sửa">
                                                <Edit2
                                                    size={13}
                                                    color="#9ca3af"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingField(field.key);
                                                        setEditValue(field.value || '');
                                                    }}
                                                />
                                            </Tooltip>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Timeline */}
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginTop: 24, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Lịch sử
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                                    <span style={{ color: '#6b7280' }}>Lần đầu liên hệ:</span>
                                    <span style={{ color: '#111827', fontWeight: 500 }}>
                                        {selectedContact.firstSeen ? new Date(selectedContact.firstSeen).toLocaleString('vi-VN') : '—'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
                                    <span style={{ color: '#6b7280' }}>Hoạt động cuối:</span>
                                    <span style={{ color: '#111827', fontWeight: 500 }}>
                                        {selectedContact.lastSeen ? new Date(selectedContact.lastSeen).toLocaleString('vi-VN') : '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Last message preview */}
                            {selectedContact.lastMessagePreview && (
                                <div style={{ marginTop: 20 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Tin nhắn gần nhất
                                    </h3>
                                    <div style={{
                                        background: '#f9fafb', borderRadius: 10, padding: '12px 14px',
                                        fontSize: 13, color: '#374151', lineHeight: 1.5,
                                        borderLeft: '3px solid #6366f1',
                                    }}>
                                        {selectedContact.lastMessagePreview}
                                    </div>
                                </div>
                            )}

                            {/* ID Info */}
                            <div style={{ marginTop: 24, padding: '12px 14px', background: '#f9fafb', borderRadius: 10, fontSize: 11.5, color: '#9ca3af' }}>
                                {selectedContact.visitorId && <div>Visitor ID: <code style={{ color: '#6b7280' }}>{selectedContact.visitorId}</code></div>}
                                {selectedContact.zaloUserId && <div>Zalo ID: <code style={{ color: '#6b7280' }}>{selectedContact.zaloUserId}</code></div>}
                                <div>DB ID: <code style={{ color: '#6b7280' }}>{selectedContact._id}</code></div>
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>
        </AppLayout>
    );
}
