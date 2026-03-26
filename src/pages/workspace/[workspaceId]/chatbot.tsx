import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import AppLayout from '../../../components/layout/AppLayout';
import { chatbotService, IAIBotData } from '../../../services/chatbot.service';
import { 
    Button, Input, Select, Switch, Tag, Modal, message, Empty, Spin, 
    Avatar, Tooltip, Badge, Card 
} from 'antd';
import {
    Bot, Plus, Pencil, Trash2, Power, PowerOff, MessageSquare, Users, 
    Globe, Send, Sparkles, Brain, Settings2, Play, ChevronRight, 
    Zap, BookOpen, Target, Shield, Upload, X, GripVertical
} from 'lucide-react';

const { TextArea } = Input;

// ────────── TYPES ──────────
interface BotItem {
    _id: string;
    name: string;
    avatarUrl?: string;
    brandName: string;
    mainTask: string;
    conversationStyle: string;
    isActive: boolean;
    isDraft: boolean;
    stats: { totalConversations: number; totalReplies: number; leadsCollected: number };
    createdAt: string;
    channels: any;
    scenarios: any[];
    quickReplies: any[];
}

const TASK_LABELS: Record<string, string> = {
    customer_care: 'Chăm sóc khách hàng',
    sales: 'Tư vấn bán hàng',
    technical_support: 'Hỗ trợ kỹ thuật',
};

const STYLE_LABELS: Record<string, string> = {
    friendly: 'Thân thiện',
    professional: 'Chuyên nghiệp',
    casual: 'Tự nhiên',
};

const LENGTH_LABELS: Record<string, string> = {
    short: 'Ngắn gọn',
    medium: 'Trung bình',
    long: 'Chi tiết',
};

const CHANNEL_META: Record<string, { label: string; icon: any; color: string }> = {
    website: { label: 'Website', icon: Globe, color: '#6366f1' },
    messenger: { label: 'Messenger', icon: MessageSquare, color: '#0084ff' },
    facebook: { label: 'Facebook Fanpage', icon: MessageSquare, color: '#1877F2' },
    zalo: { label: 'Zalo OA', icon: Send, color: '#0068ff' },
    instagram: { label: 'Instagram', icon: Target, color: '#e4405f' },
};

// ────────── DEFAULT BOT DATA ──────────
const defaultBotData: Partial<IAIBotData> = {
    name: 'Chatbot AI',
    brandName: '',
    brandDescription: '',
    mainTask: 'customer_care',
    conversationStyle: 'friendly',
    messageLength: 'medium',
    customGreeting: 'Chào mừng bạn ghé thăm website của chúng tôi 👋',
    welcomeMessage: '',
    channels: {
        website: { enabled: true },
        messenger: { enabled: true },
        facebook: { enabled: true },
        zalo: { enabled: true },
        instagram: { enabled: false },
    },
    agentCondition: 'no_condition',
    scenarios: [],
    quickReplies: [
        { label: 'Báo giá 💰', value: 'Tôi muốn xem báo giá' },
        { label: 'Hỗ trợ tôi ❓', value: 'Tôi cần hỗ trợ' },
    ],
    followUp: { enabled: false, delaySeconds: 30, message: 'Bạn còn cần hỗ trợ gì thêm không ạ?' },
    isActive: false,
    isDraft: true,
};

// ────────── MAIN PAGE ──────────
export default function ChatbotPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const wsId = workspaceId as string;

    const [bots, setBots] = useState<BotItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingBot, setEditingBot] = useState<BotItem | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<Partial<IAIBotData>>({ ...defaultBotData });
    const [saving, setSaving] = useState(false);

    // ── Fetch bots ──
    const fetchBots = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await chatbotService.list(wsId);
            setBots(res.data || []);
        } catch {
            message.error('Không thể tải danh sách bot');
        } finally {
            setLoading(false);
        }
    }, [wsId]);

    useEffect(() => { fetchBots(); }, [fetchBots]);

    // ── Handlers ──
    const handleCreate = () => {
        setEditingBot(null);
        setFormData({ ...defaultBotData });
        setCurrentStep(0);
        setIsCreating(true);
    };

    const handleEdit = (bot: BotItem) => {
        setEditingBot(bot);
        setFormData({
            name: bot.name,
            avatarUrl: bot.avatarUrl,
            brandName: bot.brandName,
            mainTask: bot.mainTask as any,
            conversationStyle: bot.conversationStyle as any,
            channels: bot.channels,
            scenarios: bot.scenarios || [],
            quickReplies: bot.quickReplies || [],
            isActive: bot.isActive,
            isDraft: bot.isDraft,
        });
        setCurrentStep(0);
        setIsCreating(true);
    };

    const handleSave = async () => {
        if (!wsId) return;
        setSaving(true);
        try {
            if (editingBot) {
                await chatbotService.update(wsId, editingBot._id, formData);
                message.success('Đã cập nhật bot');
            } else {
                await chatbotService.create(wsId, formData);
                message.success('Đã tạo bot mới');
            }
            setIsCreating(false);
            fetchBots();
        } catch {
            message.error('Lưu thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (botId: string) => {
        Modal.confirm({
            title: 'Xóa Bot',
            content: 'Bạn có chắc chắn muốn xóa bot này?',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await chatbotService.remove(wsId, botId);
                    message.success('Đã xóa bot');
                    fetchBots();
                } catch {
                    message.error('Xóa thất bại');
                }
            },
        });
    };

    const handleToggle = async (botId: string, active: boolean) => {
        try {
            await chatbotService.toggleActive(wsId, botId, active);
            message.success(active ? 'Bot đã được bật' : 'Bot đã tắt');
            fetchBots();
        } catch {
            message.error('Thao tác thất bại');
        }
    };

    const updateForm = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    // ── Steps definition ──
    const steps = [
        { key: 'design', label: 'Thiết kế', icon: Sparkles, desc: 'Thiết kế thương hiệu, cài đặt các nguồn dữ liệu cho chatbot AI,...' },
        { key: 'knowledge', label: 'Kiến thức', icon: Brain, desc: 'Cho phép trợ lý AI học từ dữ liệu bạn tải lên để trả lời câu hỏi của khách' },
        { key: 'scenarios', label: 'Xử lý tình huống', icon: Settings2, desc: 'Hướng dẫn cách AI xử lý cho từng trường hợp cụ thể' },
        { key: 'conditions', label: 'Điều kiện chạy bot', icon: Play, desc: 'Cài đặt chatbot AI chạy trên website, Fanpage, ZaloOA nào' },
    ];

    // ── If creating/editing: show builder ──
    if (isCreating) {
        return (
            <AppLayout hideHeader>
                <style>{`
                    .bot-builder { display: flex; height: 100vh; background: #f8f9fc; }
                    .bot-builder-sidebar { width: 280px; background: #fff; border-right: 1px solid #e8e8ef; padding: 20px 0; flex-shrink: 0; display: flex; flex-direction: column; }
                    .bot-builder-header { padding: 0 20px 20px; border-bottom: 1px solid #e8e8ef; display: flex; align-items: center; gap: 12px; }
                    .bot-builder-header img, .bot-builder-header .bot-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #818cf8); display: flex; align-items: center; justify-content: center; color: #fff; }
                    .bot-builder-main { flex: 1; overflow-y: auto; padding: 32px 40px; }
                    .step-item { padding: 14px 20px; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; transition: all 0.2s; border-left: 3px solid transparent; }
                    .step-item:hover { background: #f3f4ff; }
                    .step-item.active { background: #eef2ff; border-left-color: #6366f1; }
                    .step-num { width: 28px; height: 28px; border-radius: 50%; background: #e8e8ef; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #64748b; flex-shrink: 0; }
                    .step-item.active .step-num { background: #6366f1; color: #fff; }
                    .step-label { font-weight: 600; font-size: 14px; color: #1e293b; }
                    .step-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; margin-top: 2px; }
                    .form-section { background: #fff; border-radius: 16px; padding: 28px 32px; margin-bottom: 24px; border: 1px solid #e8e8ef; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
                    .form-section h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
                    .form-group { margin-bottom: 18px; }
                    .form-group label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
                    .form-group label .required { color: #ef4444; margin-left: 2px; }
                    .form-group .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
                    .channel-list { display: flex; flex-direction: column; gap: 12px; }
                    .channel-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
                    .channel-item .ch-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; }
                    .scenario-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; position: relative; }
                    .scenario-card .remove-btn { position: absolute; top: 8px; right: 8px; cursor: pointer; color: #94a3b8; }
                    .scenario-card .remove-btn:hover { color: #ef4444; }
                    .qr-tags { display: flex; flex-wrap: wrap; gap: 8px; }
                    .qr-tag { padding: 6px 14px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 20px; color: #4338ca; font-size: 13px; display: flex; align-items: center; gap: 6px; }
                    .preview-panel { width: 360px; background: #fff; border-left: 1px solid #e8e8ef; padding: 20px; flex-shrink: 0; display: flex; flex-direction: column; }
                    .preview-chat { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 12px; padding: 16px 0; }
                    .preview-bubble { max-width: 80%; padding: 10px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; animation: fadeInUp 0.3s ease; }
                    .preview-bubble.bot { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; align-self: flex-start; }
                    .preview-bubble.user { background: #6366f1; color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }
                    .preview-qr { display: flex; flex-wrap: wrap; gap: 6px; }
                    .preview-qr-btn { padding: 6px 14px; border: 1.5px solid #6366f1; border-radius: 20px; color: #6366f1; font-size: 13px; background: #fff; cursor: pointer; }
                    .preview-input { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid #e8e8ef; }
                    @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                    .agent-cond-list { display: flex; flex-direction: column; gap: 8px; }
                    .agent-cond-item { padding: 10px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
                    .agent-cond-item:hover { border-color: #a5b4fc; }
                    .agent-cond-item.selected { border-color: #6366f1; background: #eef2ff; }
                    .builder-actions { padding: 20px; border-top: 1px solid #e8e8ef; display: flex; gap: 12px; justify-content: flex-end; background: #fff; }
                `}</style>

                <div className="bot-builder">
                    {/* ── LEFT: Steps sidebar ── */}
                    <div className="bot-builder-sidebar">
                        <div className="bot-builder-header">
                            <div className="bot-avatar"><Bot size={20} /></div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{formData.name || 'Chatbot AI'}</div>
                                <Tag color={editingBot ? 'blue' : 'orange'} style={{ margin: 0 }}>
                                    {editingBot ? (editingBot.isActive ? 'Active' : 'Inactive') : 'Draft'}
                                </Tag>
                            </div>
                        </div>

                        <div style={{ flex: 1, padding: '12px 0' }}>
                            {steps.map((step, idx) => (
                                <div
                                    key={step.key}
                                    className={`step-item ${currentStep === idx ? 'active' : ''}`}
                                    onClick={() => setCurrentStep(idx)}
                                >
                                    <div className="step-num">{idx + 1}</div>
                                    <div>
                                        <div className="step-label">{step.label}</div>
                                        <div className="step-desc">{step.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="builder-actions">
                            <Button onClick={() => setIsCreating(false)}>Hủy</Button>
                            <Button type="primary" loading={saving} onClick={handleSave}
                                style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)', border: 'none', borderRadius: 8 }}
                            >
                                Lưu
                            </Button>
                        </div>
                    </div>

                    {/* ── CENTER: Form content ── */}
                    <div className="bot-builder-main">
                        {/* Step 1: Design */}
                        {currentStep === 0 && (
                            <>
                                <div className="form-section">
                                    <h3><Sparkles size={18} color="#6366f1" /> Thương hiệu</h3>

                                    <div className="form-group">
                                        <label>Tên thương hiệu</label>
                                        <Input
                                            value={formData.brandName}
                                            onChange={e => updateForm('brandName', e.target.value)}
                                            placeholder="VD: NemarkChat"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Mô tả thương hiệu</label>
                                        <TextArea
                                            value={formData.brandDescription}
                                            onChange={e => updateForm('brandDescription', e.target.value)}
                                            placeholder="Giới thiệu ngắn về thương hiệu để AI hiểu ngữ cảnh..."
                                            rows={3}
                                            style={{ borderRadius: 10 }}
                                        />
                                        <div className="hint">AI sẽ dùng thông tin này để cá nhân hóa phản hồi</div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3><Bot size={18} color="#6366f1" /> Chân dung</h3>

                                    <div className="form-group">
                                        <label>Tên bot<span className="required">*</span></label>
                                        <Input
                                            value={formData.name}
                                            onChange={e => updateForm('name', e.target.value)}
                                            placeholder="Chatbot AI"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Nhiệm vụ chính</label>
                                        <Select
                                            value={formData.mainTask}
                                            onChange={v => updateForm('mainTask', v)}
                                            style={{ width: '100%', borderRadius: 10 }}
                                            size="large"
                                            options={[
                                                { value: 'customer_care', label: 'Chăm sóc khách hàng' },
                                                { value: 'sales', label: 'Tư vấn bán hàng' },
                                                { value: 'technical_support', label: 'Hỗ trợ kỹ thuật' },
                                            ]}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Phong cách trò chuyện</label>
                                        <Select
                                            value={formData.conversationStyle}
                                            onChange={v => updateForm('conversationStyle', v)}
                                            style={{ width: '100%' }}
                                            size="large"
                                            options={[
                                                { value: 'friendly', label: '😊 Thân thiện' },
                                                { value: 'professional', label: '💼 Chuyên nghiệp' },
                                                { value: 'casual', label: '😎 Tự nhiên' },
                                            ]}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Độ dài thông điệp</label>
                                        <Select
                                            value={formData.messageLength}
                                            onChange={v => updateForm('messageLength', v)}
                                            style={{ width: '100%' }}
                                            size="large"
                                            options={[
                                                { value: 'short', label: 'Ngắn gọn' },
                                                { value: 'medium', label: 'Trung bình' },
                                                { value: 'long', label: 'Chi tiết' },
                                            ]}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Tin nhắn chào khách</label>
                                        <Input
                                            value={formData.customGreeting}
                                            onChange={e => updateForm('customGreeting', e.target.value)}
                                            placeholder="Chào mừng bạn ghé thăm website của chúng tôi 👋"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                        />
                                    </div>
                                </div>

                                {/* Quick Replies */}
                                <div className="form-section">
                                    <h3><Zap size={18} color="#f59e0b" /> Câu trả lời nhanh</h3>
                                    <div className="hint" style={{ marginBottom: 12 }}>Các nút nhanh hiển thị sau tin nhắn chào để khách lựa chọn</div>

                                    <div className="qr-tags">
                                        {(formData.quickReplies || []).map((qr, idx) => (
                                            <div key={idx} className="qr-tag">
                                                {qr.label}
                                                <X size={14} style={{ cursor: 'pointer' }} onClick={() => {
                                                    const newQR = [...(formData.quickReplies || [])];
                                                    newQR.splice(idx, 1);
                                                    updateForm('quickReplies', newQR);
                                                }} />
                                            </div>
                                        ))}
                                        <Button type="dashed" size="small" icon={<Plus size={14} />}
                                            onClick={() => {
                                                const label = prompt('Nhập label (VD: Báo giá 💰):');
                                                const value = prompt('Nhập nội dung gửi khi nhấn:');
                                                if (label && value) {
                                                    updateForm('quickReplies', [...(formData.quickReplies || []), { label, value }]);
                                                }
                                            }}
                                        >
                                            Thêm
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Step 2: Knowledge */}
                        {currentStep === 1 && (
                            <div className="form-section">
                                <h3><Brain size={18} color="#6366f1" /> Kiến thức</h3>
                                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
                                    Cho phép trợ lý AI học từ dữ liệu bạn tải lên để trả lời câu hỏi của khách hàng.
                                    Bot sẽ sử dụng <strong>Knowledge Base</strong> có sẵn trong workspace.
                                </p>

                                <div style={{ 
                                    textAlign: 'center', padding: '40px 20px', 
                                    background: '#f8fafc', borderRadius: 16, 
                                    border: '2px dashed #d1d5db', marginTop: 20 
                                }}>
                                    <BookOpen size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
                                    <div style={{ fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                                        Dữ liệu kiến thức được quản lý tại mục Knowledge
                                    </div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                                        Bot sẽ tự động sử dụng tất cả dữ liệu Knowledge Base của workspace để trả lời khách hàng
                                    </div>
                                    <Button
                                        type="primary"
                                        icon={<BookOpen size={16} />}
                                        style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)', border: 'none', borderRadius: 8 }}
                                        onClick={() => window.open(`/workspace/${wsId}/settings`, '_blank')}
                                    >
                                        Quản lý Knowledge Base
                                    </Button>
                                </div>

                                <div style={{ marginTop: 20, padding: 16, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Sparkles size={16} /> Gợi ý
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: 20, color: '#3b82f6', fontSize: 13, lineHeight: 1.8 }}>
                                        <li>Tải lên file FAQ (Câu hỏi thường gặp) từ Google Sheets</li>
                                        <li>Thêm thông tin sản phẩm, bảng giá, chính sách</li>
                                        <li>Càng nhiều dữ liệu, bot trả lời càng chính xác</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Scenarios */}
                        {currentStep === 2 && (
                            <div className="form-section">
                                <h3><Settings2 size={18} color="#6366f1" /> Xử lý tình huống</h3>
                                <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                                    Hướng dẫn AI cách xử lý cho từng tình huống cụ thể. Khi khách nhắn chứa từ khóa, bot sẽ trả lời theo kịch bản đã thiết lập.
                                </p>

                                {(formData.scenarios || []).map((sc, idx) => (
                                    <div key={idx} className="scenario-card">
                                        <div className="remove-btn" onClick={() => {
                                            const newSc = [...(formData.scenarios || [])];
                                            newSc.splice(idx, 1);
                                            updateForm('scenarios', newSc);
                                        }}>
                                            <X size={16} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                            <div>
                                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Khi khách nhắn chứa</label>
                                                <Input
                                                    value={sc.trigger}
                                                    onChange={e => {
                                                        const newSc = [...(formData.scenarios || [])];
                                                        newSc[idx] = { ...newSc[idx], trigger: e.target.value };
                                                        updateForm('scenarios', newSc);
                                                    }}
                                                    placeholder="VD: giá, báo giá, bao nhiêu"
                                                    style={{ borderRadius: 8 }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Kiểu khớp</label>
                                                <Select
                                                    value={sc.triggerType}
                                                    onChange={v => {
                                                        const newSc = [...(formData.scenarios || [])];
                                                        newSc[idx] = { ...newSc[idx], triggerType: v };
                                                        updateForm('scenarios', newSc);
                                                    }}
                                                    style={{ width: '100%' }}
                                                    options={[
                                                        { value: 'contains', label: 'Chứa từ khóa' },
                                                        { value: 'keyword', label: 'Từ khóa chính xác' },
                                                        { value: 'regex', label: 'Biểu thức chính quy' },
                                                    ]}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Bot sẽ trả lời</label>
                                            <TextArea
                                                value={sc.response}
                                                onChange={e => {
                                                    const newSc = [...(formData.scenarios || [])];
                                                    newSc[idx] = { ...newSc[idx], response: e.target.value };
                                                    updateForm('scenarios', newSc);
                                                }}
                                                placeholder="Nội dung bot trả lời..."
                                                rows={2}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    type="dashed"
                                    icon={<Plus size={16} />}
                                    onClick={() => {
                                        updateForm('scenarios', [
                                            ...(formData.scenarios || []),
                                            { trigger: '', triggerType: 'contains', response: '', priority: 0 },
                                        ]);
                                    }}
                                    style={{ width: '100%', height: 44, borderRadius: 10 }}
                                >
                                    Thêm kịch bản
                                </Button>
                            </div>
                        )}

                        {/* Step 4: Conditions */}
                        {currentStep === 3 && (
                            <>
                                <div className="form-section">
                                    <h3><Globe size={18} color="#6366f1" /> Kênh tương tác</h3>
                                    <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                                        Trả lời khách nhắn tin trên website, fanpage, zalo, ...
                                    </p>

                                    <div className="channel-list">
                                        {Object.entries(CHANNEL_META).map(([key, meta]) => {
                                            const Icon = meta.icon;
                                            const enabled = formData.channels?.[key as keyof typeof formData.channels]?.enabled || false;
                                            return (
                                                <div key={key} className="channel-item">
                                                    <Switch
                                                        checked={enabled}
                                                        onChange={checked => {
                                                            updateForm('channels', {
                                                                ...formData.channels,
                                                                [key]: { ...formData.channels?.[key as keyof typeof formData.channels], enabled: checked },
                                                            });
                                                        }}
                                                        size="small"
                                                    />
                                                    <div className="ch-icon" style={{ background: meta.color }}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{meta.label}</div>
                                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                                            {enabled ? `Chạy với tất cả ${meta.label.toLowerCase()}` : 'Đã tắt'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3><Users size={18} color="#6366f1" /> Tư vấn viên online/offline</h3>
                                    <div className="agent-cond-list">
                                        {[
                                            { value: 'no_condition', label: 'Không có điều kiện', desc: 'Bot luôn chạy bất kể agent online hay không' },
                                            { value: 'no_agent_online', label: 'Không có ai online', desc: 'Bot chỉ chạy khi không có agent nào online' },
                                            { value: 'at_least_one_online', label: 'Có ít nhất một người online', desc: 'Bot chạy khi có agent online để chuyển tiếp' },
                                            { value: 'always', label: 'Luôn luôn chạy', desc: 'Bot chạy song song cùng agent' },
                                        ].map(opt => (
                                            <div
                                                key={opt.value}
                                                className={`agent-cond-item ${formData.agentCondition === opt.value ? 'selected' : ''}`}
                                                onClick={() => updateForm('agentCondition', opt.value)}
                                            >
                                                <div style={{
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    border: formData.agentCondition === opt.value ? '5px solid #6366f1' : '2px solid #cbd5e1',
                                                    flexShrink: 0,
                                                }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{opt.desc}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── RIGHT: Live Preview ── */}
                    <div className="preview-panel">
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Play size={16} color="#6366f1" /> Xem thử
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Preview bot chat</div>

                        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', border: '1px solid #e8e8ef' }}>
                            <div className="preview-chat">
                                {/* Bot name indicator */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Bot size={14} color="#fff" />
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>{formData.name || 'Chatbot AI'}</span>
                                </div>

                                {/* Greeting */}
                                <div className="preview-bubble bot">
                                    {formData.customGreeting || 'Chào mừng bạn ghé thăm website của chúng tôi 👋'}
                                </div>

                                {/* Quick Replies */}
                                {(formData.quickReplies || []).length > 0 && (
                                    <div className="preview-qr">
                                        {(formData.quickReplies || []).map((qr, i) => (
                                            <div key={i} className="preview-qr-btn">{qr.label}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Sample user message */}
                                <div className="preview-bubble user">Tôi muốn xem báo giá</div>

                                {/* Bot response from scenario */}
                                {(formData.scenarios || []).length > 0 && formData.scenarios![0].response && (
                                    <div className="preview-bubble bot">{formData.scenarios![0].response}</div>
                                )}
                                {(formData.scenarios || []).length === 0 && (
                                    <div className="preview-bubble bot" style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                                        Bot sẽ tìm trong knowledge base và trả lời...
                                    </div>
                                )}
                            </div>

                            <div className="preview-input">
                                <Input placeholder="Type a message..." disabled style={{ borderRadius: 20, flex: 1 }} />
                                <Send size={18} color="#94a3b8" />
                            </div>
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    // ────────── BOT LIST VIEW ──────────
    return (
        <AppLayout headerTitle={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                    width: 36, height: 36, borderRadius: 10, 
                    background: 'linear-gradient(135deg, #6366f1, #818cf8)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                    <Bot size={20} color="#fff" />
                </div>
                <span>Nhân viên AI</span>
            </div>
        } headerExtra={
            <Button
                type="primary"
                icon={<Plus size={16} />}
                onClick={handleCreate}
                style={{ 
                    background: 'linear-gradient(135deg, #ef4444, #f87171)', 
                    border: 'none', borderRadius: 10, height: 40, fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                }}
            >
                Tạo Bot AI
            </Button>
        }>
            <style>{`
                .chatbot-page { padding: 24px 32px; }
                .bot-hero { 
                    background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #c7d2fe 100%); 
                    border-radius: 20px; padding: 28px 32px; margin-bottom: 24px;
                    display: flex; align-items: center; justify-content: space-between;
                    border: 1px solid #c7d2fe;
                }
                .bot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
                .bot-card { 
                    background: #fff; border-radius: 16px; padding: 24px; 
                    border: 1px solid #e8e8ef; transition: all 0.25s ease;
                    cursor: pointer; position: relative; overflow: hidden;
                }
                .bot-card:hover { 
                    transform: translateY(-2px); 
                    box-shadow: 0 8px 24px rgba(99,102,241,0.12);
                    border-color: #a5b4fc; 
                }
                .bot-card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
                .bot-card-avatar { 
                    width: 48px; height: 48px; border-radius: 14px; 
                    background: linear-gradient(135deg, #6366f1, #818cf8); 
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 4px 12px rgba(99,102,241,0.25);
                }
                .bot-card-stats { 
                    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; 
                    padding: 12px 0; margin-top: 12px; border-top: 1px solid #f1f5f9;
                }
                .bot-stat { text-align: center; }
                .bot-stat-val { font-size: 18px; font-weight: 700; color: #1e293b; }
                .bot-stat-label { font-size: 11px; color: #94a3b8; margin-top: 2px; }
                .bot-card-channels { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
                .bot-card-actions { display: flex; gap: 8px; margin-top: 16px; }
                .empty-state { 
                    text-align: center; padding: 60px 20px;
                    background: #fff; border-radius: 20px; border: 1px solid #e8e8ef;
                }
            `}</style>

            <div className="chatbot-page">
                {/* Hero */}
                <div className="bot-hero">
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#312e81', marginBottom: 6 }}>
                            Nhân viên AI
                        </div>
                        <div style={{ color: '#6366f1', fontSize: 14, lineHeight: 1.6 }}>
                            Chatbot thông minh hỗ trợ trả lời câu hỏi và tư vấn sản phẩm.<br />
                            Tự động trả lời 24/7, thu thập khách hàng tiềm năng.
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Zap size={16} color="#6366f1" />
                            <span style={{ fontWeight: 600, color: '#4338ca' }}>{bots.length} Bot</span>
                        </div>
                    </div>
                </div>

                {/* Bot List */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : bots.length === 0 ? (
                    <div className="empty-state">
                        <Bot size={56} color="#c7d2fe" strokeWidth={1.5} style={{ marginBottom: 16 }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Chưa có dữ liệu</div>
                        <div style={{ color: '#94a3b8', marginBottom: 24 }}>Tạo bot AI đầu tiên để bắt đầu tự động trả lời khách hàng</div>
                        <Button
                            type="primary"
                            icon={<Plus size={16} />}
                            size="large"
                            onClick={handleCreate}
                            style={{ 
                                background: 'linear-gradient(135deg, #ef4444, #f87171)', 
                                border: 'none', borderRadius: 10, height: 44, fontWeight: 600 
                            }}
                        >
                            Tạo Bot AI
                        </Button>
                    </div>
                ) : (
                    <div className="bot-grid">
                        {bots.map(bot => (
                            <div key={bot._id} className="bot-card" onClick={() => handleEdit(bot)}>
                                <div className="bot-card-header">
                                    <div className="bot-card-avatar">
                                        {bot.avatarUrl ? (
                                            <Avatar src={bot.avatarUrl} size={48} style={{ borderRadius: 14 }} />
                                        ) : (
                                            <Bot size={24} color="#fff" />
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{bot.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <Tag color={bot.isActive ? 'green' : bot.isDraft ? 'orange' : 'default'} style={{ margin: 0, borderRadius: 6, fontSize: 12 }}>
                                                {bot.isActive ? 'Active' : bot.isDraft ? 'Draft' : 'Inactive'}
                                            </Tag>
                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                                {TASK_LABELS[bot.mainTask] || bot.mainTask}
                                            </span>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={bot.isActive}
                                        onChange={(checked, e) => {
                                            e.stopPropagation();
                                            handleToggle(bot._id, checked);
                                        }}
                                        checkedChildren={<Power size={12} />}
                                        unCheckedChildren={<PowerOff size={12} />}
                                    />
                                </div>

                                {/* Channels */}
                                <div className="bot-card-channels">
                                    {Object.entries(CHANNEL_META).map(([key, meta]) => {
                                        const enabled = bot.channels?.[key as keyof typeof bot.channels]?.enabled;
                                        if (!enabled) return null;
                                        const Icon = meta.icon;
                                        return (
                                            <Tag key={key} style={{ borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                                                <Icon size={12} /> {meta.label}
                                            </Tag>
                                        );
                                    })}
                                </div>

                                {/* Stats */}
                                <div className="bot-card-stats">
                                    <div className="bot-stat">
                                        <div className="bot-stat-val">{bot.stats?.totalConversations || 0}</div>
                                        <div className="bot-stat-label">Hội thoại</div>
                                    </div>
                                    <div className="bot-stat">
                                        <div className="bot-stat-val">{bot.stats?.totalReplies || 0}</div>
                                        <div className="bot-stat-label">Trả lời</div>
                                    </div>
                                    <div className="bot-stat">
                                        <div className="bot-stat-val">{bot.stats?.leadsCollected || 0}</div>
                                        <div className="bot-stat-label">Leads</div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="bot-card-actions" onClick={e => e.stopPropagation()}>
                                    <Button size="small" icon={<Pencil size={14} />} onClick={() => handleEdit(bot)}>Sửa</Button>
                                    <Button size="small" danger icon={<Trash2 size={14} />} onClick={() => handleDelete(bot._id)}>Xóa</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
