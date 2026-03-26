import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { Spin, Tabs, message, Form, Input, Button, Select, Table, Modal, Switch, InputNumber, Tag, Space, TimePicker, DatePicker, Tooltip, Badge, Empty, Drawer, Typography, Divider, Popconfirm } from 'antd';
import { Menu as MenuIcon } from 'lucide-react';
import {
    SettingOutlined, TeamOutlined, MailOutlined, ApiOutlined, MessageOutlined,
    ClockCircleOutlined, ShoppingCartOutlined, DollarOutlined, TagOutlined,
    PlusOutlined, DeleteOutlined, EditOutlined, SyncOutlined, SearchOutlined,
    SendOutlined, ThunderboltOutlined, ShopOutlined, FileTextOutlined,
    GlobalOutlined, BranchesOutlined, RobotOutlined, FacebookOutlined
} from '@ant-design/icons';
import AppLayout from '../../../components/layout/AppLayout';
import WorkspaceSettingsForm from '../../../features/workspace/components/WorkspaceSettingsForm';
import ZaloIntegrationSettings from '../../../features/workspace/components/ZaloIntegrationSettings';
import FacebookIntegrationSettings from '../../../features/workspace/components/FacebookIntegrationSettings';
import KnowledgeSettings from '../../../features/workspace/components/KnowledgeSettings';
import { useWorkspaceTags, useAddWorkspaceTag, useRemoveWorkspaceTag } from '../../../domains/workspace/workspace.hooks';
import axios from 'axios';

const { Text, Title } = Typography;
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4020/api';

function getHeaders() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('nemark_token') : '';
    return { Authorization: `Bearer ${token}` };
}

// ════════════════════════════════════════════
// Message Templates (Mẫu tin nhắn)
// ════════════════════════════════════════════
function MessageTemplateSettings({ workspaceId }: { workspaceId: string }) {
    const [macros, setMacros] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form] = Form.useForm();

    const fetchMacros = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/macros/workspace/${workspaceId}`, { headers: getHeaders() });
            setMacros(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchMacros(); }, [fetchMacros]);

    const handleSave = async (values: any) => {
        try {
            if (editing) {
                await axios.patch(`${API}/macros/workspace/${workspaceId}/${editing._id}`, values, { headers: getHeaders() });
                message.success('Đã cập nhật mẫu tin nhắn');
            } else {
                await axios.post(`${API}/macros/workspace/${workspaceId}/${values.scope === 'team' ? 'team' : 'personal'}`, values, { headers: getHeaders() });
                message.success('Đã tạo mẫu tin nhắn mới');
            }
            setModalOpen(false);
            form.resetFields();
            setEditing(null);
            fetchMacros();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Lỗi');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await axios.delete(`${API}/macros/workspace/${workspaceId}/${id}`, { headers: getHeaders() });
            message.success('Đã xóa');
            fetchMacros();
        } catch { message.error('Lỗi khi xóa'); }
    };

    const columns = [
        { title: 'Tiêu đề', dataIndex: 'title', key: 'title', render: (t: string) => <Text strong>{t}</Text> },
        { title: 'Phím tắt', dataIndex: 'shortcut', key: 'shortcut', render: (s: string) => s ? <Tag color="blue">{s}</Tag> : '-' },
        { title: 'Kênh', dataIndex: 'channel', key: 'channel', render: (c: string) => <Tag>{c || 'all'}</Tag> },
        { title: 'Phạm vi', dataIndex: 'scope', key: 'scope', render: (s: string) => <Tag color={s === 'team' ? 'green' : 'default'}>{s === 'team' ? 'Nhóm' : 'Cá nhân'}</Tag> },
        {
            title: '', key: 'actions', width: 100,
            render: (_: any, r: any) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }} />
                    <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDelete(r._id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Mẫu tin nhắn</Title>
                    <Text type="secondary">Tạo mẫu tin nhắn để gửi nhanh cho khách hàng, hỗ trợ biến thể và phím tắt.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
                    Tạo mẫu
                </Button>
            </div>
            <Table dataSource={macros} columns={columns} rowKey="_id" loading={loading} size="small"
                pagination={{ pageSize: 10 }} locale={{ emptyText: <Empty description="Chưa có mẫu tin nhắn nào" /> }} />
            <Modal title={editing ? 'Chỉnh sửa mẫu' : 'Tạo mẫu mới'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
                footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ scope: 'personal', channel: 'all' }}>
                    <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
                        <Input placeholder="VD: Chào khách mới" />
                    </Form.Item>
                    <Form.Item name="content" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung' }]}>
                        <Input.TextArea rows={4} placeholder="Xin chào {{customer_name}}, cảm ơn bạn đã liên hệ!" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <Form.Item name="shortcut" label="Phím tắt">
                            <Input placeholder="/hello" />
                        </Form.Item>
                        <Form.Item name="channel" label="Kênh áp dụng">
                            <Select options={[
                                { value: 'all', label: 'Tất cả' },
                                { value: 'widget', label: 'Website' },
                                { value: 'zalo', label: 'Zalo' },
                                { value: 'facebook', label: 'Facebook' },
                                { value: 'email', label: 'Email' },
                            ]} />
                        </Form.Item>
                        <Form.Item name="scope" label="Phạm vi">
                            <Select options={[
                                { value: 'personal', label: 'Cá nhân' },
                                { value: 'team', label: 'Nhóm' },
                            ]} />
                        </Form.Item>
                    </div>
                    <Form.Item name="category" label="Danh mục">
                        <Input placeholder="VD: Chào hỏi, Hỗ trợ, Thanh toán" />
                    </Form.Item>
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => { setModalOpen(false); setEditing(null); }} style={{ marginRight: 8 }}>Hủy</Button>
                        <Button type="primary" htmlType="submit">Lưu</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════
// Distribution Rules (Rule phân phối)
// ════════════════════════════════════════════
function DistributionRuleSettings({ workspaceId }: { workspaceId: string }) {
    const [rules, setRules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form] = Form.useForm();

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/distribution-rules/workspace/${workspaceId}`, { headers: getHeaders() });
            setRules(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const handleSave = async (values: any) => {
        try {
            const payload = {
                ...values,
                conditions: values.conditions || [],
                action: { type: values.actionType, agentIds: values.agentIds?.split(',').map((s: string) => s.trim()).filter(Boolean) || [] },
            };
            if (editing) {
                await axios.patch(`${API}/distribution-rules/workspace/${workspaceId}/${editing._id}`, payload, { headers: getHeaders() });
                message.success('Đã cập nhật rule');
            } else {
                await axios.post(`${API}/distribution-rules/workspace/${workspaceId}`, payload, { headers: getHeaders() });
                message.success('Đã tạo rule mới');
            }
            setModalOpen(false); form.resetFields(); setEditing(null); fetchRules();
        } catch (e: any) { message.error(e.response?.data?.message || 'Lỗi'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await axios.delete(`${API}/distribution-rules/workspace/${workspaceId}/${id}`, { headers: getHeaders() });
            message.success('Đã xóa'); fetchRules();
        } catch { message.error('Lỗi khi xóa'); }
    };

    const handleToggle = async (id: string, isActive: boolean) => {
        try {
            await axios.patch(`${API}/distribution-rules/workspace/${workspaceId}/${id}`, { isActive }, { headers: getHeaders() });
            fetchRules();
        } catch { message.error('Lỗi'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Rule phân phối</Title>
                    <Text type="secondary">Tự động phân phối cuộc hội thoại cho agent dựa trên kênh, nguồn, và điều kiện khác.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
                    Tạo rule
                </Button>
            </div>
            <Table dataSource={rules} rowKey="_id" loading={loading} size="small" pagination={false}
                locale={{ emptyText: <Empty description="Chưa có rule phân phối nào" /> }}
                columns={[
                    { title: 'Tên', dataIndex: 'name', key: 'name', render: (t: string) => <Text strong>{t}</Text> },
                    { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', width: 80, render: (p: number) => <Tag color="blue">{p}</Tag> },
                    {
                        title: 'Hành động', dataIndex: 'action', key: 'action',
                        render: (a: any) => <Tag color="purple">{a?.type?.replace(/_/g, ' ')}</Tag>
                    },
                    {
                        title: 'Trạng thái', dataIndex: 'isActive', key: 'isActive', width: 100,
                        render: (active: boolean, r: any) => <Switch size="small" checked={active} onChange={(v) => handleToggle(r._id, v)} />
                    },
                    {
                        title: '', key: 'actions', width: 80,
                        render: (_: any, r: any) => (
                            <Space>
                                <Button size="small" icon={<EditOutlined />} onClick={() => {
                                    setEditing(r); form.setFieldsValue({ ...r, actionType: r.action?.type, agentIds: r.action?.agentIds?.join(', ') }); setModalOpen(true);
                                }} />
                                <Popconfirm title="Xóa rule này?" onConfirm={() => handleDelete(r._id)}>
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Space>
                        ),
                    },
                ]} />
            <Modal title={editing ? 'Chỉnh sửa rule' : 'Tạo rule mới'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
                footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ conditionLogic: 'all', priority: 0 }}>
                    <Form.Item name="name" label="Tên rule" rules={[{ required: true }]}>
                        <Input placeholder="VD: Facebook → Nhóm Sale" />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="priority" label="Độ ưu tiên">
                            <InputNumber min={0} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="conditionLogic" label="Logic điều kiện">
                            <Select options={[{ value: 'all', label: 'Tất cả điều kiện (AND)' }, { value: 'any', label: 'Bất kỳ (OR)' }]} />
                        </Form.Item>
                    </div>
                    <Form.Item name="actionType" label="Hành động phân phối" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'assign_agent', label: 'Gán cho agent cụ thể' },
                            { value: 'round_robin', label: 'Luân phiên' },
                            { value: 'least_busy', label: 'Agent ít bận nhất' },
                            { value: 'previous_agent', label: 'Agent cũ (đã hỗ trợ trước đó)' },
                        ]} />
                    </Form.Item>
                    <Form.Item name="agentIds" label="Agent IDs (cách nhau dấu phẩy)">
                        <Input placeholder="agent_id_1, agent_id_2" />
                    </Form.Item>
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => { setModalOpen(false); setEditing(null); }} style={{ marginRight: 8 }}>Hủy</Button>
                        <Button type="primary" htmlType="submit">Lưu</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════
// Business Hours (Giờ làm việc)
// ════════════════════════════════════════════
const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function BusinessHoursSettings({ workspaceId }: { workspaceId: string }) {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/business-hours/workspace/${workspaceId}`, { headers: getHeaders() });
            if (data.data) {
                setConfig(data.data);
            } else {
                // Default schedule
                setConfig({
                    timezone: 'Asia/Ho_Chi_Minh',
                    schedule: [0, 1, 2, 3, 4, 5, 6].map(d => ({ day: d, startTime: '08:00', endTime: '17:30', isActive: d >= 1 && d <= 5 })),
                    holidays: [],
                    offlineAction: 'custom_message',
                    offlineMessage: 'Chúng tôi hiện ngoài giờ làm việc. Vui lòng để lại tin nhắn!',
                    isActive: true,
                });
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${API}/business-hours/workspace/${workspaceId}`, config, { headers: getHeaders() });
            message.success('Đã lưu giờ làm việc');
        } catch { message.error('Lỗi khi lưu'); }
        setSaving(false);
    };

    const updateSchedule = (index: number, field: string, value: any) => {
        const newSchedule = [...config.schedule];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        setConfig({ ...config, schedule: newSchedule });
    };

    if (loading) return <Spin />;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Giờ làm việc</Title>
                    <Text type="secondary">Thiết lập khung giờ làm việc và hành động khi ngoài giờ.</Text>
                </div>
                <Space>
                    <Switch checked={config?.isActive} onChange={v => setConfig({ ...config, isActive: v })} checkedChildren="Hoạt động" unCheckedChildren="Tắt" />
                    <Button type="primary" onClick={handleSave} loading={saving}>Lưu</Button>
                </Space>
            </div>

            <div style={{ background: 'var(--color-bg-soft, #f6f8fa)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <Text strong style={{ marginBottom: 12, display: 'block' }}>Lịch làm việc hàng tuần</Text>
                {config?.schedule?.map((s: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '8px 12px', background: s.isActive ? 'var(--color-bg, #fff)' : 'transparent', borderRadius: 8, opacity: s.isActive ? 1 : 0.5 }}>
                        <Switch size="small" checked={s.isActive} onChange={v => updateSchedule(i, 'isActive', v)} />
                        <Text style={{ width: 80, fontWeight: 500 }}>{DAY_NAMES[s.day]}</Text>
                        <Input size="small" value={s.startTime} onChange={e => updateSchedule(i, 'startTime', e.target.value)} style={{ width: 80 }} placeholder="08:00" disabled={!s.isActive} />
                        <Text type="secondary">→</Text>
                        <Input size="small" value={s.endTime} onChange={e => updateSchedule(i, 'endTime', e.target.value)} style={{ width: 80 }} placeholder="17:30" disabled={!s.isActive} />
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                    <Text strong>Hành động ngoài giờ</Text>
                    <Select value={config?.offlineAction} onChange={v => setConfig({ ...config, offlineAction: v })} style={{ width: '100%', marginTop: 8 }}
                        options={[
                            { value: 'custom_message', label: 'Hiện tin nhắn tùy chỉnh' },
                            { value: 'bot_reply', label: 'Bot tự động trả lời' },
                            { value: 'show_form', label: 'Hiện form để lại thông tin' },
                        ]} />
                </div>
                <div>
                    <Text strong>Tin nhắn ngoài giờ</Text>
                    <Input.TextArea rows={2} value={config?.offlineMessage} onChange={e => setConfig({ ...config, offlineMessage: e.target.value })} style={{ marginTop: 8 }} />
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════
// Product Management (Sản phẩm)
// ════════════════════════════════════════════
function ProductSettings({ workspaceId }: { workspaceId: string }) {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [sheetUrl, setSheetUrl] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [form] = Form.useForm();
    const [total, setTotal] = useState(0);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/products/workspace/${workspaceId}`, { headers: getHeaders() });
            setProducts(data.data?.products || []);
            setTotal(data.data?.total || 0);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const handleSave = async (values: any) => {
        try {
            if (editing) {
                await axios.patch(`${API}/products/workspace/${workspaceId}/${editing._id}`, values, { headers: getHeaders() });
                message.success('Đã cập nhật sản phẩm');
            } else {
                await axios.post(`${API}/products/workspace/${workspaceId}`, values, { headers: getHeaders() });
                message.success('Đã tạo sản phẩm mới');
            }
            setModalOpen(false); form.resetFields(); setEditing(null); fetchProducts();
        } catch (e: any) { message.error(e.response?.data?.message || 'Lỗi'); }
    };

    const handleSync = async () => {
        if (!sheetUrl.trim()) { message.warning('Nhập link Google Sheet'); return; }
        setSyncing(true);
        try {
            const { data } = await axios.post(`${API}/products/workspace/${workspaceId}/sync-google-sheet`, { sheetUrl }, { headers: getHeaders() });
            message.success(`Đồng bộ thành công: ${data.data?.imported || 0} sản phẩm`);
            if (data.data?.errors?.length) message.warning(`${data.data.errors.length} lỗi`);
            setSyncModalOpen(false); setSheetUrl(''); fetchProducts();
        } catch (e: any) { message.error(e.response?.data?.message || 'Lỗi đồng bộ'); }
        setSyncing(false);
    };

    const handleDelete = async (id: string) => {
        try {
            await axios.delete(`${API}/products/workspace/${workspaceId}/${id}`, { headers: getHeaders() });
            message.success('Đã xóa'); fetchProducts();
        } catch { message.error('Lỗi'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Đồng bộ sản phẩm</Title>
                    <Text type="secondary">Quản lý sản phẩm, đồng bộ từ Google Sheet hoặc tạo thủ công. Tổng: <strong>{total}</strong></Text>
                </div>
                <Space>
                    <Button icon={<SyncOutlined />} onClick={() => setSyncModalOpen(true)}>Đồng bộ Google Sheet</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>Tạo mới</Button>
                </Space>
            </div>
            <Table dataSource={products} rowKey="_id" loading={loading} size="small" pagination={{ pageSize: 10 }}
                locale={{ emptyText: <Empty description="Chưa có sản phẩm" /> }}
                columns={[
                    { title: 'Tên', dataIndex: 'name', key: 'name', render: (n: string, r: any) => <><Text strong>{n}</Text>{r.sku ? <Text type="secondary" style={{ marginLeft: 8 }}>#{r.sku}</Text> : null}</> },
                    { title: 'Giá', dataIndex: 'price', key: 'price', width: 120, render: (p: number) => <Text>{p?.toLocaleString('vi-VN')} ₫</Text> },
                    { title: 'Tồn kho', dataIndex: 'stock', key: 'stock', width: 80 },
                    { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 120, render: (s: string) => <Tag color={s === 'google_sheet' ? 'green' : 'default'}>{s}</Tag> },
                    {
                        title: '', key: 'actions', width: 80,
                        render: (_: any, r: any) => (
                            <Space>
                                <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }} />
                                <Popconfirm title="Xóa sản phẩm?" onConfirm={() => handleDelete(r._id)}>
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Space>
                        ),
                    },
                ]} />

            {/* Sync Modal */}
            <Modal title="Tạo đồng bộ Google Sheet" open={syncModalOpen} onCancel={() => setSyncModalOpen(false)} footer={null} width={520}>
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">Dán link Google Sheet công khai. Sheet cần có cột: Tên (name), Giá (price). Các cột tùy chọn: SKU, Mô tả, Danh mục, Tồn kho, Hình ảnh.</Text>
                </div>
                <Input placeholder="Link Google Sheet" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} style={{ marginBottom: 16 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Switch defaultChecked checkedChildren="Hoạt động" unCheckedChildren="Tắt" />
                    <Button type="primary" onClick={handleSync} loading={syncing}>Lấy dữ liệu</Button>
                </div>
            </Modal>

            {/* Create/Edit Modal */}
            <Modal title={editing ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
                footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ price: 0, stock: 0, currency: 'VND' }}>
                    <Form.Item name="name" label="Tên sản phẩm" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <Form.Item name="price" label="Giá" rules={[{ required: true }]}>
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="stock" label="Tồn kho">
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="sku" label="Mã SKU">
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item name="description" label="Mô tả">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name="category" label="Danh mục">
                        <Input placeholder="VD: Điện thoại, Phụ kiện" />
                    </Form.Item>
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setModalOpen(false)} style={{ marginRight: 8 }}>Hủy</Button>
                        <Button type="primary" htmlType="submit">Lưu</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════
// Tax Management (Thuế)
// ════════════════════════════════════════════
function TaxSettings({ workspaceId }: { workspaceId: string }) {
    const [taxes, setTaxes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form] = Form.useForm();

    const fetchTaxes = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/taxes/workspace/${workspaceId}`, { headers: getHeaders() });
            setTaxes(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchTaxes(); }, [fetchTaxes]);

    const handleSave = async (values: any) => {
        try {
            if (editing) {
                await axios.patch(`${API}/taxes/workspace/${workspaceId}/${editing._id}`, values, { headers: getHeaders() });
                message.success('Đã cập nhật');
            } else {
                await axios.post(`${API}/taxes/workspace/${workspaceId}`, values, { headers: getHeaders() });
                message.success('Đã tạo thuế mới');
            }
            setModalOpen(false); form.resetFields(); setEditing(null); fetchTaxes();
        } catch (e: any) { message.error(e.response?.data?.message || 'Lỗi'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await axios.delete(`${API}/taxes/workspace/${workspaceId}/${id}`, { headers: getHeaders() });
            message.success('Đã xóa'); fetchTaxes();
        } catch { message.error('Lỗi'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Thuế</Title>
                    <Text type="secondary">Quản lý cách tính các loại thuế trên đơn hàng của bạn.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
                    Thêm thuế
                </Button>
            </div>
            <Table dataSource={taxes} rowKey="_id" loading={loading} size="small" pagination={false}
                locale={{ emptyText: <Empty description="Chưa có loại thuế nào" /> }}
                columns={[
                    { title: 'Tên', dataIndex: 'name', key: 'name', render: (t: string) => <Text strong>{t}</Text> },
                    { title: 'Thuế suất', dataIndex: 'rate', key: 'rate', width: 100, render: (r: number) => `${r}%` },
                    { title: 'Ngôn ngữ', dataIndex: 'locale', key: 'locale', width: 100, render: (l: string) => <Tag>{l}</Tag> },
                    {
                        title: '', key: 'actions', width: 80,
                        render: (_: any, r: any) => (
                            <Space>
                                <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }} />
                                <Popconfirm title="Xóa thuế này?" onConfirm={() => handleDelete(r._id)}>
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Space>
                        ),
                    },
                ]} />
            <Modal title={editing ? 'Chỉnh sửa thuế' : 'Thêm thuế'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
                footer={null} width={400}>
                <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ rate: 0, locale: 'vi-VN' }}>
                    <Form.Item name="locale" label="Ngôn ngữ">
                        <Select options={[{ value: 'vi-VN', label: 'vi-VN' }, { value: 'en-US', label: 'en-US' }]} />
                    </Form.Item>
                    <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên thuế' }]}>
                        <Input placeholder="Thuế GTGT" />
                    </Form.Item>
                    <Form.Item name="rate" label="Thuế suất (%)" rules={[{ required: true }]}>
                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => { setModalOpen(false); setEditing(null); }} style={{ marginRight: 8 }}>Hủy</Button>
                        <Button type="primary" htmlType="submit">Tạo mới</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════
// Email Integration
// ════════════════════════════════════════════
function EmailSettings({ workspaceId }: { workspaceId: string }) {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form] = Form.useForm();

    const fetchAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/email-accounts/workspace/${workspaceId}`, { headers: getHeaders() });
            setAccounts(data.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    const handleSave = async (values: any) => {
        try {
            const payload = {
                ...values,
                smtp: { host: values.smtpHost, port: values.smtpPort, secure: values.smtpSecure, user: values.smtpUser, password: values.smtpPassword },
                imap: { host: values.imapHost, port: values.imapPort, secure: values.imapSecure, user: values.imapUser, password: values.imapPassword },
            };
            await axios.post(`${API}/email-accounts/workspace/${workspaceId}`, payload, { headers: getHeaders() });
            message.success('Đã thêm email');
            setModalOpen(false); form.resetFields(); fetchAccounts();
        } catch (e: any) { message.error(e.response?.data?.message || 'Lỗi'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await axios.delete(`${API}/email-accounts/workspace/${workspaceId}/${id}`, { headers: getHeaders() });
            message.success('Đã xóa'); fetchAccounts();
        } catch { message.error('Lỗi'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Danh sách email</Title>
                    <Text type="secondary">Danh sách địa chỉ email nhận và gửi đi trên Subiz.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
                    + Thêm email
                </Button>
            </div>
            <Table dataSource={accounts} rowKey="_id" loading={loading} size="small" pagination={false}
                locale={{ emptyText: <Empty description="Chưa có email nào được tích hợp" /> }}
                columns={[
                    { title: 'Email', dataIndex: 'email', key: 'email', render: (e: string) => <Text strong>{e}</Text> },
                    { title: 'Tên hiển thị', dataIndex: 'displayName', key: 'displayName' },
                    { title: 'Cho phép nhận', dataIndex: 'allowReceive', key: 'r', width: 100, render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Có' : 'Không'}</Tag> },
                    { title: 'Cho phép gửi', dataIndex: 'allowSend', key: 's', width: 100, render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Có' : 'Không'}</Tag> },
                    { title: 'Loại phiếu', dataIndex: 'ticketType', key: 'type', width: 100 },
                    {
                        title: '', key: 'actions', width: 50,
                        render: (_: any, r: any) => (
                            <Popconfirm title="Xóa email này?" onConfirm={() => handleDelete(r._id)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        ),
                    },
                ]} />
            <Modal title="Thêm email" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSave}
                    initialValues={{ smtpPort: 587, smtpSecure: false, imapPort: 993, imapSecure: true, allowReceive: true, allowSend: true }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="email" label="Địa chỉ email" rules={[{ required: true }]}>
                            <Input placeholder="support@example.com" />
                        </Form.Item>
                        <Form.Item name="displayName" label="Tên hiển thị">
                            <Input placeholder="Support Team" />
                        </Form.Item>
                    </div>
                    <Divider>SMTP (Gửi mail)</Divider>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                        <Form.Item name="smtpHost" label="Host"><Input placeholder="smtp.gmail.com" /></Form.Item>
                        <Form.Item name="smtpPort" label="Port"><InputNumber style={{ width: '100%' }} /></Form.Item>
                        <Form.Item name="smtpSecure" label="SSL" valuePropName="checked"><Switch /></Form.Item>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="smtpUser" label="Username"><Input /></Form.Item>
                        <Form.Item name="smtpPassword" label="Password"><Input.Password /></Form.Item>
                    </div>
                    <Divider>IMAP (Nhận mail)</Divider>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                        <Form.Item name="imapHost" label="Host"><Input placeholder="imap.gmail.com" /></Form.Item>
                        <Form.Item name="imapPort" label="Port"><InputNumber style={{ width: '100%' }} /></Form.Item>
                        <Form.Item name="imapSecure" label="SSL" valuePropName="checked"><Switch /></Form.Item>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="imapUser" label="Username"><Input /></Form.Item>
                        <Form.Item name="imapPassword" label="Password"><Input.Password /></Form.Item>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setModalOpen(false)} style={{ marginRight: 8 }}>Hủy</Button>
                        <Button type="primary" htmlType="submit">Thêm email</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════
// Order Management (Đơn hàng)
// ════════════════════════════════════════════
const STATUS_COLORS: Record<string, string> = {
    draft: 'default', pending: 'orange', confirmed: 'blue', shipping: 'cyan',
    delivered: 'green', cancelled: 'red', returned: 'purple',
};
const STATUS_LABELS: Record<string, string> = {
    draft: 'Nháp', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao',
    delivered: 'Đã giao', cancelled: 'Đã hủy', returned: 'Trả hàng',
};

function OrderSettings({ workspaceId }: { workspaceId: string }) {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/orders/workspace/${workspaceId}`, { headers: getHeaders() });
            setOrders(data.data?.orders || []);
            setTotal(data.data?.total || 0);
        } catch { /* ignore */ }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const handleStatusChange = async (orderId: string, status: string) => {
        try {
            await axios.patch(`${API}/orders/workspace/${workspaceId}/${orderId}/status`, { status }, { headers: getHeaders() });
            message.success('Đã cập nhật trạng thái');
            fetchOrders();
        } catch { message.error('Lỗi'); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Đơn hàng</Title>
                    <Text type="secondary">Quản lý đơn hàng — Tổng: <strong>{total}</strong></Text>
                </div>
            </div>
            <Table dataSource={orders} rowKey="_id" loading={loading} size="small" pagination={{ pageSize: 10 }}
                locale={{ emptyText: <Empty description="Chưa có đơn hàng. Đơn hàng được tạo từ cuộc hội thoại." /> }}
                columns={[
                    { title: 'Mã đơn', dataIndex: 'orderNumber', key: 'no', render: (n: string) => <Text strong>{n}</Text> },
                    { title: 'Khách hàng', dataIndex: 'customerName', key: 'c' },
                    { title: 'Tổng', dataIndex: 'total', key: 'total', width: 130, render: (t: number) => <Text strong>{t?.toLocaleString('vi-VN')} ₫</Text> },
                    {
                        title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 150,
                        render: (s: string, r: any) => (
                            <Select size="small" value={s} onChange={v => handleStatusChange(r._id, v)} style={{ width: 130 }}
                                options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
                        ),
                    },
                    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'date', width: 140, render: (d: string) => new Date(d).toLocaleDateString('vi-VN') },
                ]} />
        </div>
    );
}

// ════════════════════════════════════════════
// Tag Settings (Phân loại khách hàng)
// ════════════════════════════════════════════
function TagSettings({ workspaceId }: { workspaceId: string }) {
    const [tagInput, setTagInput] = useState('');
    const [addingTag, setAddingTag] = useState(false);
    const { data: tagsRes } = useWorkspaceTags(workspaceId);
    const tags = tagsRes?.data || [];
    const addTag = useAddWorkspaceTag();
    const removeTag = useRemoveWorkspaceTag();

    const handleAddTag = async () => {
        if (!tagInput || !tagInput.trim()) return;
        const newTag = tagInput.trim();
        if (tags.includes(newTag)) {
            message.warning('Tag đã tồn tại!');
            return;
        }
        setAddingTag(true);
        try {
            await addTag.mutateAsync({ workspaceId, tag: newTag });
            setTagInput('');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi khi thêm tag');
        } finally {
            setAddingTag(false);
        }
    };

    const handleRemoveTag = async (removedTag: string) => {
        try {
            await removeTag.mutateAsync({ workspaceId, tag: removedTag });
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi khi xóa tag');
        }
    };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <Typography.Title level={4} style={{ margin: 0 }}>Phân loại khách hàng (Tags)</Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 8 }}>
                    Định nghĩa các thẻ (tags) để phân loại khách hàng trong workspace (ví dụ: VIP, Tiềm năng, Sắp chốt...).
                    Agent có thể gắn các tag này cho cuộc hội thoại.
                </Typography.Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {tags.length === 0 ? (
                    <Typography.Text type="secondary" style={{ fontStyle: 'italic', fontSize: 13 }}>Chưa có thẻ nào.</Typography.Text>
                ) : (
                    tags.map((tag: string) => (
                        <Tag
                            key={tag}
                            closable
                            onClose={(e) => { e.preventDefault(); handleRemoveTag(tag); }}
                            color="blue"
                            style={{ padding: '4px 10px', fontSize: 13 }}
                        >
                            {tag}
                        </Tag>
                    ))
                )}
            </div>
            <Space>
                <Input
                    placeholder="Nhập thẻ mới (VD: VIP)"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onPressEnter={(e) => { e.preventDefault(); handleAddTag(); }}
                    style={{ width: 200 }}
                />
                <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddTag} loading={addingTag}>
                    Thêm Thẻ
                </Button>
            </Space>
        </div>
    );
}

// ════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ════════════════════════════════════════════
const SIDEBAR_SECTIONS = [
    {
        group: 'TÀI KHOẢN',
        items: [
            { key: 'general', label: 'Thông tin', icon: <SettingOutlined /> },
            { key: 'agents', label: 'Agent', icon: <TeamOutlined /> },
        ],
    },
    {
        group: 'TÍCH HỢP',
        items: [
            { key: 'zalo', label: 'Zalo', icon: <MessageOutlined /> },
            { key: 'facebook', label: 'Facebook', icon: <FacebookOutlined /> },
            { key: 'email', label: 'Email', icon: <MailOutlined /> },
            { key: 'webhook', label: 'Webhook', icon: <ApiOutlined /> },
        ],
    },
    {
        group: 'HỘI THOẠI',
        items: [
            { key: 'templates', label: 'Mẫu tin nhắn', icon: <FileTextOutlined /> },
            { key: 'distribution', label: 'Rule phân phối', icon: <BranchesOutlined /> },
            { key: 'tags', label: 'Tag', icon: <TagOutlined /> },
            { key: 'business-hours', label: 'Giờ làm việc', icon: <ClockCircleOutlined /> },
            { key: 'knowledge', label: 'Kiến thức AI', icon: <RobotOutlined /> },
        ],
    },
    {
        group: 'SẢN PHẨM',
        items: [
            { key: 'products', label: 'Đồng bộ sản phẩm', icon: <ShopOutlined /> },
            { key: 'taxes', label: 'Thuế', icon: <DollarOutlined /> },
        ],
    },
    {
        group: 'ĐƠN HÀNG',
        items: [
            { key: 'orders', label: 'Quản lý đơn', icon: <ShoppingCartOutlined /> },
        ],
    },
];

export default function WorkspaceSettingsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const [ready, setReady] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    const [isMobile, setIsMobile] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Sync activeTab with URL query param
    useEffect(() => {
        if (router.isReady) {
            const tab = router.query.tab as string;
            if (tab) setActiveTab(tab);
        }
    }, [router.isReady, router.query.tab]);

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    if (!ready || !workspaceId) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    const wsId = workspaceId as string;

    const renderContent = () => {
        switch (activeTab) {
            case 'general': return <WorkspaceSettingsForm workspaceId={wsId} />;
            case 'zalo': return <ZaloIntegrationSettings workspaceId={wsId} />;
            case 'facebook': return <FacebookIntegrationSettings workspaceId={wsId} />;
            case 'email': return <EmailSettings workspaceId={wsId} />;
            case 'templates': return <MessageTemplateSettings workspaceId={wsId} />;
            case 'distribution': return <DistributionRuleSettings workspaceId={wsId} />;
            case 'business-hours': return <BusinessHoursSettings workspaceId={wsId} />;
            case 'tags': return <TagSettings workspaceId={wsId} />;
            case 'knowledge': return <KnowledgeSettings workspaceId={wsId} />;
            case 'products': return <ProductSettings workspaceId={wsId} />;
            case 'taxes': return <TaxSettings workspaceId={wsId} />;
            case 'orders': return <OrderSettings workspaceId={wsId} />;
            default: return <div><Empty description="Tính năng đang phát triển" /></div>;
        }
    };

    const sidebarContent = (
        <>
            {SIDEBAR_SECTIONS.map(section => (
                <div key={section.group} style={{ marginBottom: 8 }}>
                    <div style={{
                        padding: '8px 20px 4px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-text-tertiary, #999)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}>
                        {section.group}
                    </div>
                    {section.items.map(item => (
                        <div
                            key={item.key}
                            onClick={() => {
                                setActiveTab(item.key);
                                router.push({ pathname: router.pathname, query: { ...router.query, tab: item.key } }, undefined, { shallow: true });
                                if (isMobile) setMobileSidebarOpen(false);
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 20px',
                                cursor: 'pointer',
                                fontSize: 13.5,
                                fontWeight: activeTab === item.key ? 600 : 400,
                                color: activeTab === item.key ? 'var(--color-primary, #4f46e5)' : 'var(--color-text, #333)',
                                background: activeTab === item.key ? 'var(--color-primary-bg, #eef2ff)' : 'transparent',
                                borderRight: activeTab === item.key ? '3px solid var(--color-primary, #4f46e5)' : '3px solid transparent',
                                borderRadius: isMobile ? 10 : 0,
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <span style={{ fontSize: 15, opacity: 0.8 }}>{item.icon}</span>
                            {item.label}
                        </div>
                    ))}
                </div>
            ))}
        </>
    );

    // Find the active tab label for mobile header
    const activeLabel = SIDEBAR_SECTIONS.flatMap(s => s.items).find(i => i.key === activeTab)?.label || 'Cài đặt';

    return (
        <AppLayout headerTitle="Cài đặt">
            <Head><title>Cài đặt | NemarkChat</title></Head>
            <div style={{
                display: 'flex', minHeight: isMobile ? 'calc(100vh - 0px)' : 'calc(100vh - 64px)',
                background: 'var(--color-bg-soft, #f5f6fa)',
                flexDirection: isMobile ? 'column' : 'row',
            }}>
                {/* ── Mobile Header Bar ── */}
                {isMobile && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px',
                        background: 'var(--color-bg, #fff)',
                        borderBottom: '1px solid var(--color-border, #e8e8e8)',
                        position: 'sticky', top: 0, zIndex: 50,
                    }}>
                        <button
                            onClick={() => setMobileSidebarOpen(true)}
                            style={{
                                width: 40, height: 40, borderRadius: 10,
                                background: 'var(--color-bg-soft, #f5f6fa)',
                                border: '1px solid var(--color-border, #e8e8e8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0,
                            }}
                        >
                            <MenuIcon size={18} color="var(--color-text, #333)" />
                        </button>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text, #333)' }}>
                            {activeLabel}
                        </div>
                    </div>
                )}

                {/* ── Mobile Sidebar Drawer ── */}
                {isMobile && (
                    <Drawer
                        open={mobileSidebarOpen}
                        onClose={() => setMobileSidebarOpen(false)}
                        placement="left"
                        width={280}
                        title={<span style={{ fontWeight: 700, fontSize: 16 }}>⚙️ Cài đặt</span>}
                        styles={{ body: { padding: '12px 0' } }}
                    >
                        {sidebarContent}
                    </Drawer>
                )}

                {/* ── Desktop Sidebar ── */}
                {!isMobile && (
                    <aside style={{
                        width: 240, minWidth: 240,
                        background: 'var(--color-bg, #fff)',
                        borderRight: '1px solid var(--color-border, #e8e8e8)',
                        padding: '16px 0',
                        overflowY: 'auto',
                    }}>
                        {sidebarContent}
                    </aside>
                )}

                {/* ── Content ── */}
                <main style={{
                    flex: 1,
                    padding: isMobile ? '16px 14px' : '32px 40px',
                    maxWidth: isMobile ? '100%' : 960,
                    overflow: 'auto',
                    width: '100%',
                }}>
                    {renderContent()}
                </main>
            </div>
        </AppLayout>
    );
}
