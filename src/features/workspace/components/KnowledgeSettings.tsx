import React, { useState, useEffect } from 'react';
import { message, Spin, Tag, Modal, Input } from 'antd';
import { BookOpen, Cloud, RefreshCw, Trash2, Plus, Search, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { knowledgeService } from '../../../services/knowledge.service';

interface KnowledgeEntry {
    _id: string;
    product: string;
    question: string;
    answer: string;
    upsaleText?: string;
    source: 'google_sheets' | 'manual';
    createdAt: string;
}

interface Stats {
    total: number;
    productCount: number;
    products: string[];
}

export default function KnowledgeSettings({ workspaceId }: { workspaceId: string }) {
    const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [sheetUrl, setSheetUrl] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [searchText, setSearchText] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({ product: '', question: '', answer: '', upsaleText: '' });

    const fetchData = async () => {
        try {
            setLoading(true);
            const [entriesRes, statsRes] = await Promise.all([
                knowledgeService.getAll(workspaceId, selectedProduct || undefined),
                knowledgeService.getStats(workspaceId),
            ]);
            setEntries(entriesRes.data || []);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [workspaceId, selectedProduct]);

    const handleSync = async () => {
        if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
            message.error('Vui lòng nhập URL Google Sheets hợp lệ');
            return;
        }
        try {
            setSyncing(true);
            const res = await knowledgeService.syncFromSheet(workspaceId, sheetUrl);
            message.success(`Đã đồng bộ ${res.data?.syncedEntries || 0} câu hỏi/trả lời`);
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Lỗi đồng bộ');
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await knowledgeService.remove(workspaceId, id);
            message.success('Đã xóa');
            fetchData();
        } catch { message.error('Lỗi xóa'); }
    };

    const handleAdd = async () => {
        if (!addForm.product || !addForm.question || !addForm.answer) {
            message.error('Vui lòng điền đủ thông tin');
            return;
        }
        try {
            await knowledgeService.create(workspaceId, addForm);
            message.success('Đã thêm');
            setShowAddModal(false);
            setAddForm({ product: '', question: '', answer: '', upsaleText: '' });
            fetchData();
        } catch { message.error('Lỗi thêm'); }
    };

    // Filter by search
    const filtered = searchText
        ? entries.filter(e =>
            e.question.toLowerCase().includes(searchText.toLowerCase()) ||
            e.answer.toLowerCase().includes(searchText.toLowerCase()) ||
            e.product.toLowerCase().includes(searchText.toLowerCase())
        )
        : entries;

    const PRODUCT_COLORS: Record<string, string> = {
        'Gemini Ultra': '#8b5cf6',
        'Gemini AI Pro': '#6366f1',
        'Gemini pro': '#6366f1',
        'Chat GPT Plus': '#10b981',
        'Youtobe Premium': '#ef4444',
        'YouTube Premium': '#ef4444',
        'Capcut': '#f59e0b',
        'Antigravity': '#3b82f6',
        'Lời chào': '#06b6d4',
        'Lời cảm ơn': '#ec4899',
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <BookOpen size={22} color="#fff" />
                </div>
                <div>
                    <h3 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 700 }}>
                        Kho Kiến Thức CSKH
                    </h3>
                    <p style={{ color: 'rgba(255,255,255,.6)', margin: 0, fontSize: 13 }}>
                        {stats ? `${stats.total} câu hỏi • ${stats.productCount} sản phẩm` : 'Đang tải...'}
                    </p>
                </div>
            </div>

            {/* Sync Section */}
            <div style={{
                background: 'rgba(255,255,255,.08)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                border: '1px solid rgba(255,255,255,.1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Cloud size={16} color="#a5b4fc" />
                    <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>Đồng bộ từ Google Sheets</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="text"
                        placeholder="Dán URL Google Sheets tại đây..."
                        value={sheetUrl}
                        onChange={e => setSheetUrl(e.target.value)}
                        style={{
                            flex: 1,
                            background: 'rgba(255,255,255,.1)',
                            border: '1px solid rgba(255,255,255,.15)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            color: '#fff',
                            fontSize: 13,
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={handleSync}
                        disabled={syncing || !sheetUrl}
                        style={{
                            background: syncing ? 'rgba(99,102,241,.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '8px 16px',
                            cursor: syncing ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {syncing ? <Spin size="small" /> : <RefreshCw size={14} />}
                        {syncing ? 'Đang sync...' : 'Đồng bộ'}
                    </button>
                </div>
                <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
                    Cột: STT | Sản phẩm | Câu hỏi | Cách trả lời | Upsale
                </p>
            </div>

            {/* Product Filter + Search */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{
                    flex: 1, minWidth: 200,
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,.1)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    border: '1px solid rgba(255,255,255,.12)',
                }}>
                    <Search size={14} color="rgba(255,255,255,.5)" />
                    <input
                        placeholder="Tìm kiếm..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            outline: 'none',
                            width: '100%',
                            fontSize: 13,
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setSelectedProduct('')}
                        style={{
                            background: !selectedProduct ? 'rgba(99,102,241,.7)' : 'rgba(255,255,255,.08)',
                            border: '1px solid rgba(255,255,255,.15)',
                            color: '#fff',
                            borderRadius: 6,
                            padding: '4px 10px',
                            cursor: 'pointer',
                            fontSize: 12,
                        }}
                    >
                        Tất cả
                    </button>
                    {stats?.products.map(p => (
                        <button
                            key={p}
                            onClick={() => setSelectedProduct(p)}
                            style={{
                                background: selectedProduct === p ? (PRODUCT_COLORS[p] || '#6366f1') + 'cc' : 'rgba(255,255,255,.08)',
                                border: `1px solid ${selectedProduct === p ? (PRODUCT_COLORS[p] || '#6366f1') : 'rgba(255,255,255,.15)'}`,
                                color: '#fff',
                                borderRadius: 6,
                                padding: '4px 10px',
                                cursor: 'pointer',
                                fontSize: 12,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => setShowAddModal(true)}
                    style={{
                        background: 'rgba(16,185,129,.6)',
                        border: '1px solid rgba(16,185,129,.8)',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                    }}
                >
                    <Plus size={14} /> Thêm
                </button>
            </div>

            {/* Entries List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin size="large" />
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'rgba(255,255,255,.4)',
                }}>
                    <Database size={40} style={{ marginBottom: 12, opacity: .5 }} />
                    <p style={{ margin: 0 }}>Chưa có dữ liệu. Dán URL Google Sheets và bấm Đồng bộ.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                    {filtered.map(entry => (
                        <div
                            key={entry._id}
                            style={{
                                background: 'rgba(255,255,255,.06)',
                                borderRadius: 10,
                                padding: '12px 14px',
                                border: `1px solid ${expandedId === entry._id ? 'rgba(99,102,241,.5)' : 'rgba(255,255,255,.08)'}`,
                                cursor: 'pointer',
                                transition: 'all .2s',
                            }}
                            onClick={() => setExpandedId(expandedId === entry._id ? null : entry._id)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{
                                    background: (PRODUCT_COLORS[entry.product] || '#6366f1') + '33',
                                    color: PRODUCT_COLORS[entry.product] || '#a5b4fc',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                }}>
                                    {entry.product}
                                </span>
                                {entry.source === 'google_sheets' && (
                                    <Cloud size={12} color="rgba(255,255,255,.3)" />
                                )}
                                <div style={{ flex: 1 }} />
                                <button
                                    onClick={e => { e.stopPropagation(); handleDelete(entry._id); }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'rgba(255,255,255,.3)',
                                        cursor: 'pointer',
                                        padding: 4,
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <p style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>
                                ❓ {entry.question.substring(0, 120)}{entry.question.length > 120 ? '...' : ''}
                            </p>

                            {expandedId === entry._id && (
                                <div style={{ marginTop: 10 }}>
                                    <div style={{
                                        background: 'rgba(99,102,241,.15)',
                                        borderRadius: 8,
                                        padding: 12,
                                        marginBottom: entry.upsaleText ? 8 : 0,
                                    }}>
                                        <p style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 600, margin: '0 0 4px' }}>
                                            💬 Cách trả lời:
                                        </p>
                                        <p style={{ color: '#e2e8f0', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                            {entry.answer}
                                        </p>
                                    </div>
                                    {entry.upsaleText && (
                                        <div style={{
                                            background: 'rgba(16,185,129,.15)',
                                            borderRadius: 8,
                                            padding: 12,
                                        }}>
                                            <p style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 600, margin: '0 0 4px' }}>
                                                🚀 Upsale:
                                            </p>
                                            <p style={{ color: '#e2e8f0', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>
                                                {entry.upsaleText}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add Modal */}
            <Modal
                title="Thêm kiến thức mới"
                open={showAddModal}
                onCancel={() => setShowAddModal(false)}
                onOk={handleAdd}
                okText="Thêm"
                cancelText="Hủy"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Input
                        placeholder="Sản phẩm (VD: Gemini Ultra)"
                        value={addForm.product}
                        onChange={e => setAddForm(f => ({ ...f, product: e.target.value }))}
                    />
                    <Input.TextArea
                        placeholder="Câu hỏi khách thường hỏi"
                        value={addForm.question}
                        onChange={e => setAddForm(f => ({ ...f, question: e.target.value }))}
                        rows={3}
                    />
                    <Input.TextArea
                        placeholder="Cách trả lời"
                        value={addForm.answer}
                        onChange={e => setAddForm(f => ({ ...f, answer: e.target.value }))}
                        rows={5}
                    />
                    <Input.TextArea
                        placeholder="Text upsale (tùy chọn)"
                        value={addForm.upsaleText}
                        onChange={e => setAddForm(f => ({ ...f, upsaleText: e.target.value }))}
                        rows={2}
                    />
                </div>
            </Modal>
        </div>
    );
}
