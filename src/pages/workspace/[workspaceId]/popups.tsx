import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import {
    Button, Modal, Form, Input, Select, Switch, Tabs, message,
    Empty, Spin, Tag, Drawer, Divider, Typography, Card, Space, Badge,
    InputNumber, Radio, Table, Popconfirm
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
    Plus, Trash2, Settings, Eye, Megaphone, PauseCircle, PlayCircle, BarChart3
} from 'lucide-react';
import AppLayout from '../../../components/layout/AppLayout';
import { popupHttpService } from '../../../services/popup.service';

const { Text, Title } = Typography;

// ── Template categories (Subiz-inspired) ──
const CATEGORIES = [
    { key: 'all', label: 'Tất cả' },
    { key: 'general', label: 'Chung' },
    { key: 'tet', label: 'Tết Nguyên Đán' },
    { key: 'quoc_khanh', label: 'Quốc khánh' },
    { key: '30_4', label: '30/4 - 1/5' },
    { key: '8_3', label: '8-3' },
    { key: 'giang_sinh', label: 'Giáng sinh' },
    { key: 'nam_moi', label: 'Năm mới' },
    { key: 'sale', label: 'Giảm giá' },
    { key: 'lead', label: 'Thu thập Lead' },
];

const DEFAULT_POPUP = {
    name: 'Popup mới',
    type: 'popup',
    category: 'general',
    status: 'paused',
    design: {
        imageUrl: '',
        width: 400,
        height: 600,
        layout: 'center',
        fields: [
            { type: 'email', label: 'Email', placeholder: 'Nhập Email', required: true },
            { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
        ],
        buttonText: 'Đăng ký ngay',
        buttonColor: '#6366f1',
    },
    thankYou: {
        title: 'Thank you',
        message: 'We had received your request',
    },
    settings: {
        triggerMode: 'delay',
        triggerDelay: 5,
        frequency: 'once',
        urlRules: { domains: [], paths: [] },
    },
};

export default function PopupsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;

    const [popups, setPopups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [activeCategory, setActiveCategory] = useState('all');

    const fetchPopups = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);
        try {
            const res = await popupHttpService.getByWorkspace(workspaceId as string);
            if (res.success) setPopups(res.data || []);
        } catch (_e) { }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => { fetchPopups(); }, [fetchPopups]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({
            ...DEFAULT_POPUP,
            designWidth: 400,
            designHeight: 600,
            designButtonText: 'Đăng ký ngay',
            designButtonColor: '#6366f1',
            thankYouTitle: 'Thank you',
            thankYouMessage: 'We had received your request',
            triggerMode: 'delay',
            triggerDelay: 5,
            frequency: 'once',
        });
        setDrawerOpen(true);
    };

    const openEdit = (popup: any) => {
        setEditing(popup);
        form.setFieldsValue({
            name: popup.name,
            type: popup.type,
            category: popup.category,
            designImageUrl: popup.design?.imageUrl || '',
            designWidth: popup.design?.width || 400,
            designHeight: popup.design?.height || 600,
            designLayout: popup.design?.layout || 'center',
            designButtonText: popup.design?.buttonText || 'Đăng ký ngay',
            designButtonColor: popup.design?.buttonColor || '#6366f1',
            designFields: popup.design?.fields || [],
            thankYouTitle: popup.thankYou?.title || '',
            thankYouMessage: popup.thankYou?.message || '',
            thankYouButtonText: popup.thankYou?.buttonText || '',
            thankYouButtonUrl: popup.thankYou?.buttonUrl || '',
            triggerMode: popup.settings?.triggerMode || 'delay',
            triggerDelay: popup.settings?.triggerDelay || 5,
            scrollPercent: popup.settings?.scrollPercent,
            frequency: popup.settings?.frequency || 'once',
        });
        setDrawerOpen(true);
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const payload = {
                name: values.name,
                type: values.type || 'popup',
                category: values.category || 'general',
                design: {
                    imageUrl: values.designImageUrl || '',
                    width: values.designWidth || 400,
                    height: values.designHeight || 600,
                    layout: values.designLayout || 'center',
                    fields: (values.designFields || []).filter((f: any) => f?.label),
                    buttonText: values.designButtonText || 'Đăng ký ngay',
                    buttonColor: values.designButtonColor || '#6366f1',
                },
                thankYou: {
                    title: values.thankYouTitle || 'Thank you',
                    message: values.thankYouMessage || '',
                    buttonText: values.thankYouButtonText || '',
                    buttonUrl: values.thankYouButtonUrl || '',
                },
                settings: {
                    triggerMode: values.triggerMode || 'delay',
                    triggerDelay: values.triggerDelay || 5,
                    scrollPercent: values.scrollPercent,
                    frequency: values.frequency || 'once',
                },
            };

            if (editing) {
                await popupHttpService.update(workspaceId as string, editing._id, payload);
                message.success('Đã cập nhật popup!');
            } else {
                await popupHttpService.create(workspaceId as string, payload);
                message.success('Đã tạo popup!');
            }
            setDrawerOpen(false);
            fetchPopups();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
        setSaving(false);
    };

    const handleToggleStatus = async (popup: any) => {
        const newStatus = popup.status === 'active' ? 'paused' : 'active';
        try {
            await popupHttpService.update(workspaceId as string, popup._id, { status: newStatus });
            message.success(newStatus === 'active' ? 'Đã kích hoạt!' : 'Đã tạm dừng!');
            fetchPopups();
        } catch (_e) { message.error('Lỗi'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await popupHttpService.deletePopup(workspaceId as string, id);
            message.success('Đã xóa!');
            fetchPopups();
        } catch (_e) { message.error('Lỗi'); }
    };

    const filteredPopups = activeCategory === 'all'
        ? popups
        : popups.filter(p => p.category === activeCategory);

    if (!workspaceId) return <AppLayout><Spin /></AppLayout>;

    return (
        <AppLayout>
            <Head><title>Tiện ích Web</title></Head>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                    <div>
                        <h1 style={{
                            fontSize: 28, fontWeight: 700, color: '#1a1a2e', margin: 0,
                            letterSpacing: '-0.02em'
                        }}>
                            🎨 Tiện ích Web
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                            Sáng tạo website với popup, thông báo đơn hàng, form thu thập lead
                        </p>
                    </div>
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={openCreate}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none',
                            borderRadius: 12,
                            height: 44,
                            fontWeight: 600,
                            paddingInline: 24,
                        }}
                    >
                        Tạo mới
                    </Button>
                </div>

                {/* Category tabs (Subiz-style left sidebar) */}
                <div style={{ display: 'flex', gap: 24 }}>
                    {/* Sidebar categories */}
                    <div style={{
                        width: 180, flexShrink: 0, background: '#f8f9fb', borderRadius: 16,
                        padding: '12px 8px', height: 'fit-content',
                    }}>
                        {CATEGORIES.map(c => (
                            <div
                                key={c.key}
                                onClick={() => setActiveCategory(c.key)}
                                style={{
                                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                    fontSize: 13, fontWeight: activeCategory === c.key ? 600 : 400,
                                    background: activeCategory === c.key ? '#6366f1' : 'transparent',
                                    color: activeCategory === c.key ? '#fff' : '#475569',
                                    transition: 'all .2s', marginBottom: 2,
                                }}
                            >
                                {c.label}
                            </div>
                        ))}
                    </div>

                    {/* Main content */}
                    <div style={{ flex: 1 }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                        ) : filteredPopups.length === 0 ? (
                            <Empty
                                description={<span style={{ color: '#94a3b8', fontSize: 14 }}>Chưa có popup nào. Tạo mới ngay!</span>}
                                style={{ padding: 80 }}
                            />
                        ) : (
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                gap: 16,
                            }}>
                                {filteredPopups.map(popup => (
                                    <div key={popup._id} style={{
                                        background: '#fff', borderRadius: 16, border: '1px solid #e8e8ed',
                                        overflow: 'hidden', transition: 'all .2s',
                                        cursor: 'pointer',
                                    }}
                                         onClick={() => openEdit(popup)}
                                    >
                                        {/* Preview image */}
                                        <div style={{
                                            height: 140, background: popup.design?.imageUrl
                                                ? `url(${popup.design.imageUrl}) center/cover`
                                                : 'linear-gradient(135deg, #6366f1, #a78bfa)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontSize: 36,
                                        }}>
                                            {!popup.design?.imageUrl && <Megaphone size={40} />}
                                        </div>

                                        {/* Info */}
                                        <div style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                <Text strong style={{ fontSize: 14 }}>{popup.name}</Text>
                                                <Tag color={popup.status === 'active' ? 'green' : 'default'} style={{ borderRadius: 8 }}>
                                                    {popup.status === 'active' ? 'Đang chạy' : 'Tạm dừng'}
                                                </Tag>
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                                                <span>👁 {popup.stats?.views || 0}</span>
                                                <span>📝 {popup.stats?.submissions || 0}</span>
                                                <span>❌ {popup.stats?.closes || 0}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                                <Button
                                                    size="small"
                                                    type={popup.status === 'active' ? 'default' : 'primary'}
                                                    icon={popup.status === 'active' ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
                                                    onClick={(e) => { e.stopPropagation(); handleToggleStatus(popup); }}
                                                    style={{ borderRadius: 8, fontSize: 11, flex: 1 }}
                                                >
                                                    {popup.status === 'active' ? 'Dừng' : 'Bật'}
                                                </Button>
                                                <Popconfirm title="Xóa popup này?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(popup._id); }} onCancel={(e) => e?.stopPropagation()}>
                                                    <Button size="small" danger icon={<Trash2 size={12} />} onClick={(e) => e.stopPropagation()} style={{ borderRadius: 8 }} />
                                                </Popconfirm>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Create/Edit Drawer ─── */}
            <Drawer
                title={editing ? `Chỉnh sửa — ${editing.name}` : 'Tạo mới Popup'}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={640}
                destroyOnClose
                extra={
                    <Button type="primary" loading={saving} onClick={() => form.submit()}
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                        {editing ? 'Lưu' : 'Xuất bản'}
                    </Button>
                }
            >
                <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
                    <Tabs defaultActiveKey="design" items={[
                        {
                            key: 'design', label: '1. Thiết kế',
                            children: (
                                <>
                                    <Form.Item label="Tên popup" name="name" rules={[{ required: true, message: 'Nhập tên' }]}>
                                        <Input placeholder="VD: Form khuyến mãi dịp Quốc Khánh" />
                                    </Form.Item>
                                    <Space style={{ width: '100%' }} size={12}>
                                        <Form.Item label="Loại" name="type" style={{ width: 160 }}>
                                            <Select options={[
                                                { value: 'popup', label: 'Popup' },
                                                { value: 'notification', label: 'Thông báo' },
                                            ]} />
                                        </Form.Item>
                                        <Form.Item label="Danh mục" name="category" style={{ flex: 1 }}>
                                            <Select options={CATEGORIES.filter(c => c.key !== 'all').map(c => ({ value: c.key, label: c.label }))} />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Trang chính</Divider>
                                    <Form.Item label="Hình ảnh (URL)" name="designImageUrl" extra="400 × 600 px khuyến nghị">
                                        <Input placeholder="https://example.com/banner.jpg" />
                                    </Form.Item>
                                    <Space>
                                        <Form.Item label="Chiều rộng" name="designWidth">
                                            <InputNumber min={200} max={800} suffix="px" />
                                        </Form.Item>
                                        <Form.Item label="Chiều cao" name="designHeight">
                                            <InputNumber min={200} max={1200} suffix="px" />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Bảng hỏi thông tin</Divider>
                                    <Form.List name="designFields">
                                        {(fields, { add, remove }) => (
                                            <>
                                                {fields.map(({ key, name, ...rest }) => (
                                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                        <Form.Item {...rest} name={[name, 'type']} noStyle>
                                                            <Select style={{ width: 100 }} options={[
                                                                { value: 'text', label: '📝 Văn bản' },
                                                                { value: 'email', label: '📧 Email' },
                                                                { value: 'phone', label: '📱 SĐT' },
                                                            ]} />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'label']} style={{ marginBottom: 0, width: 160 }}>
                                                            <Input placeholder="Label" />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'placeholder']} style={{ marginBottom: 0, width: 140 }}>
                                                            <Input placeholder="Placeholder" />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'required']} valuePropName="checked" noStyle>
                                                            <Switch size="small" />
                                                        </Form.Item>
                                                        <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                                    </Space>
                                                ))}
                                                <Button type="dashed" onClick={() => add({ type: 'text', label: '', placeholder: '' })} block icon={<PlusOutlined />}>
                                                    + Thêm trường
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>

                                    <Divider>Nút hành động</Divider>
                                    <Space style={{ width: '100%' }}>
                                        <Form.Item label="Văn bản nút" name="designButtonText" style={{ flex: 1 }}>
                                            <Input placeholder="Đăng ký ngay" />
                                        </Form.Item>
                                        <Form.Item label="Màu nút" name="designButtonColor">
                                            <Input type="color" style={{ width: 60, padding: 2 }} />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Trang cảm ơn</Divider>
                                    <Form.Item label="Tiêu đề" name="thankYouTitle">
                                        <Input placeholder="Thank you" />
                                    </Form.Item>
                                    <Form.Item label="Nội dung" name="thankYouMessage">
                                        <Input.TextArea rows={2} placeholder="We had received your request" />
                                    </Form.Item>
                                    <Form.Item label="Nút chuyển hướng (tùy chọn)" name="thankYouButtonText">
                                        <Input placeholder="Xem sản phẩm" />
                                    </Form.Item>
                                    <Form.Item label="URL chuyển hướng" name="thankYouButtonUrl">
                                        <Input placeholder="https://example.com/products" />
                                    </Form.Item>
                                </>
                            ),
                        },
                        {
                            key: 'settings', label: '2. Cài đặt',
                            children: (
                                <>
                                    <Divider>Điều kiện chạy popup</Divider>
                                    <Form.Item label="Kích hoạt khi" name="triggerMode">
                                        <Radio.Group>
                                            <Radio value="immediate">Ngay lập tức</Radio>
                                            <Radio value="delay">Sau N giây</Radio>
                                            <Radio value="scroll">Cuộn % trang</Radio>
                                            <Radio value="exit_intent">Khi rời trang</Radio>
                                        </Radio.Group>
                                    </Form.Item>
                                    <Form.Item noStyle shouldUpdate={(p, c) => p.triggerMode !== c.triggerMode}>
                                        {({ getFieldValue }) => (
                                            getFieldValue('triggerMode') === 'delay' && (
                                                <Form.Item label="Số giây" name="triggerDelay">
                                                    <InputNumber min={0} suffix="giây" />
                                                </Form.Item>
                                            )
                                        )}
                                    </Form.Item>
                                    <Form.Item noStyle shouldUpdate={(p, c) => p.triggerMode !== c.triggerMode}>
                                        {({ getFieldValue }) => (
                                            getFieldValue('triggerMode') === 'scroll' && (
                                                <Form.Item label="Cuộn % trang" name="scrollPercent">
                                                    <InputNumber min={0} max={100} suffix="%" />
                                                </Form.Item>
                                            )
                                        )}
                                    </Form.Item>

                                    <Divider>Tần suất</Divider>
                                    <Form.Item label="Hiển thị" name="frequency">
                                        <Radio.Group>
                                            <Radio value="once">1 lần duy nhất</Radio>
                                            <Radio value="every_visit">Mỗi lượt truy cập</Radio>
                                            <Radio value="every_day">Mỗi ngày 1 lần</Radio>
                                        </Radio.Group>
                                    </Form.Item>
                                </>
                            ),
                        },
                        {
                            key: 'stats', label: '3. Thống kê',
                            children: (
                                <>
                                    {editing ? (
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                            {[
                                                { label: 'Lượt xem', value: editing.stats?.views || 0, icon: '👁', color: '#6366f1' },
                                                { label: 'Đã gửi form', value: editing.stats?.submissions || 0, icon: '📝', color: '#22c55e' },
                                                { label: 'Đã đóng', value: editing.stats?.closes || 0, icon: '❌', color: '#ef4444' },
                                            ].map(s => (
                                                <div key={s.label} style={{
                                                    flex: 1, minWidth: 140, padding: 20, borderRadius: 16,
                                                    background: '#f8f9fb', textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.icon} {s.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty description="Chỉ có khi chỉnh sửa popup đã tạo" />
                                    )}
                                </>
                            ),
                        },
                    ]} />
                </Form>
            </Drawer>
        </AppLayout>
    );
}
