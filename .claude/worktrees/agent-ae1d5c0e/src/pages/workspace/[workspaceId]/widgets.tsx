import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import {
    Button, Modal, Form, Input, Select, Switch, ColorPicker, Tabs, message,
    Empty, Spin, Tag, Drawer, Divider, Typography, Card, Space, Badge, Upload
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Plus, Copy, Code, Settings, Trash2, ArrowLeft, Eye, Globe, MessageSquare, Upload as UploadIcon } from 'lucide-react';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { useWorkspace } from '../../../domains/workspace/workspace.hooks';
import { useTotalUnreadCount } from '../../../domains/conversation';
import {
    useWidgetsByWorkspace, useCreateWidget, useUpdateWidget, useDeleteWidget
} from '../../../domains/workspace/widget.hooks';
import AppLayout from '../../../components/layout/AppLayout';
import { uploadService } from '../../../services/upload.service';

const { Text } = Typography;

/**
 * Builds a live config object from flat form values for the preview.
 */
function buildLiveConfig(values: any) {
    let color = values?.primaryColor;
    if (typeof color === 'object' && color?.toHexString) color = color.toHexString();
    return {
        name: values?.name || '',
        primaryColor: color || '#6366f1',
        gradient: values?.gradient || '',
        launcherStyle: values?.launcherStyle || 'bubble',
        launcherText: values?.launcherText || '',
        launcherIcon: values?.launcherIcon || '',
        tooltipText: values?.tooltipText || '',
        greeting: values?.greeting || 'Xin chào!',
        placeholder: values?.placeholder || 'Nhập tin nhắn...',
        position: values?.position || 'bottom-right',
        language: values?.language || 'vi',
        offlineMessage: values?.offlineMessage || '',
        showBranding: values?.showBranding ?? true,
        preChatForm: {
            enabled: values?.preChatEnabled ?? true,
            title: values?.preChatTitle || 'Nhập thông tin',
            fields: [
                { key: 'name', label: 'Họ và tên', type: 'text', required: values?.fieldNameRequired ?? true, enabled: values?.fieldName ?? true },
                { key: 'email', label: 'Email', type: 'email', required: values?.fieldEmailRequired ?? false, enabled: values?.fieldEmail ?? true },
                { key: 'phone', label: 'Số điện thoại', type: 'tel', required: values?.fieldPhoneRequired ?? false, enabled: values?.fieldPhone ?? true },
                ...((values?.customFields || []).filter((cf: any) => cf?.label && cf?.key).map((cf: any) => ({
                    key: cf.key,
                    label: cf.label,
                    type: cf.type || 'text',
                    required: cf.required || false,
                    enabled: true,
                    options: cf.type === 'select' && typeof cf.options === 'string'
                        ? cf.options.split('\n').filter(Boolean)
                        : cf.options || [],
                }))),
            ],
        },
    };
}

/** Live preview wrapper that watches form values */
function LivePreview({ form }: { form: any }) {
    const allValues = Form.useWatch([], form);
    const config = buildLiveConfig(allValues);
    return <WidgetPreview config={config} />;
}

function WidgetPreview({ config }: { config: any }) {
    const bgStyle = config?.gradient
        ? { background: config.gradient }
        : { background: config?.primaryColor || '#6366f1' };

    const launcherStyle = config?.launcherStyle || 'bubble';

    const renderLauncherIcon = () => {
        if (config?.launcherIcon) {
            if (config.launcherStyle !== 'image' && config.launcherIcon.includes('.svg')) {
                return (
                    <div style={{
                        width: 28, height: 28, backgroundColor: 'currentColor',
                        WebkitMaskImage: `url(${config.launcherIcon})`, WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center', WebkitMaskRepeat: 'no-repeat',
                        maskImage: `url(${config.launcherIcon})`, maskSize: 'contain',
                        maskPosition: 'center', maskRepeat: 'no-repeat'
                    }} />
                );
            }
            return (
                <img
                    src={config.launcherIcon}
                    alt="icon"
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                />
            );
        }
        return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
        );
    };

    const renderBubble = () => {
        if (launcherStyle === 'tab') {
            return (
                <div style={{
                    ...bgStyle,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: '20px 20px 0 0',
                    color: 'white', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
                    width: 'fit-content'
                }}>
                    {renderLauncherIcon()}
                    <span>{config?.launcherText || 'Chat'}</span>
                </div>
            );
        }
        if (launcherStyle === 'pill') {
            return (
                <div style={{
                    ...bgStyle,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 50,
                    color: 'white', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    width: 'fit-content'
                }}>
                    {renderLauncherIcon()}
                    <span>{config?.launcherText || 'Hỗ trợ'}</span>
                </div>
            );
        }
        if (launcherStyle === 'image') {
            return (
                <div style={{
                    width: 60, height: 60, borderRadius: '50%', overflow: 'hidden',
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    ...bgStyle,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {config?.launcherIcon ? (
                        <img
                            src={config.launcherIcon}
                            alt="launcher"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        renderLauncherIcon()
                    )}
                </div>
            );
        }
        // Default: bubble
        return (
            <div style={{
                width: 56, height: 56, borderRadius: '50%',
                ...bgStyle,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}>
                {renderLauncherIcon()}
            </div>
        );
    };

    return (
        <div>
            {/* Chat window preview */}
            <div style={{
                width: 320, borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.12)', fontFamily: 'inherit',
                border: '1px solid var(--color-border)'
            }}>
                {/* Header */}
                <div style={{
                    ...bgStyle,
                    padding: '20px 20px 16px', color: 'white'
                }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{config?.name || 'Chat hỗ trợ'}</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{config?.greeting || 'Xin chào!'}</div>
                </div>
                {/* Pre-chat form preview */}
                {config?.preChatForm?.enabled && (
                    <div style={{ padding: 16, background: '#fafafa' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#333' }}>
                            {config.preChatForm.title || 'Nhập thông tin'}
                        </div>
                        {(config.preChatForm.fields || []).filter((f: any) => f.enabled).map((f: any) => (
                            <div key={f.key} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                                    {f.label} {f.required && <span style={{ color: 'red' }}>*</span>}
                                </div>
                                <div style={{
                                    height: 32, borderRadius: 6, border: '1px solid #ddd',
                                    background: 'white', padding: '0 8px', fontSize: 12,
                                    display: 'flex', alignItems: 'center', color: '#bbb'
                                }}>
                                    {f.label}...
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Input */}
                <div style={{
                    padding: '12px 16px', borderTop: '1px solid #eee',
                    display: 'flex', alignItems: 'center', gap: 8, background: 'white'
                }}>
                    <div style={{
                        flex: 1, height: 36, borderRadius: 18, border: '1px solid #ddd',
                        background: '#f8f8f8', padding: '0 14px', fontSize: 13,
                        display: 'flex', alignItems: 'center', color: '#aaa'
                    }}>
                        {config?.placeholder || 'Nhập tin nhắn...'}
                    </div>
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        ...bgStyle,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16
                    }}>→</div>
                </div>
            </div>

            {/* Launcher bubble preview */}
            <div style={{
                marginTop: 20, padding: 16, background: '#f0f0f5', borderRadius: 12,
                border: '1px solid var(--color-border)'
            }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 12 }}>
                    Nút bấm (Launcher)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {renderBubble()}
                    {config?.tooltipText && (
                        <div style={{
                            background: '#333', color: 'white', padding: '6px 12px',
                            borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}>
                            {config.tooltipText}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function EmbedSnippet({ widgetId }: { widgetId: string }) {
    const snippet = `<!-- NemarChat Widget -->
<script>
  (function(w,d,s,o){
    w.NemarChat=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    var js=d.createElement(s);js.async=1;
    js.src='${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/widget/loader.js';
    js.setAttribute('data-widget-id','${widgetId}');
    d.head.appendChild(js);
  })(window,document,'script','nchat');
</script>`;

    const handleCopy = () => {
        navigator.clipboard.writeText(snippet);
        message.success('Đã copy snippet!');
    };

    return (
        <div>
            <div style={{
                background: '#1e1e2e', borderRadius: 12, padding: 16,
                fontFamily: 'monospace', fontSize: 12, color: '#a6e3a1',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                position: 'relative', lineHeight: 1.6
            }}>
                {snippet}
                <Button
                    type="text" size="small"
                    icon={<Copy size={14} />}
                    onClick={handleCopy}
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        color: '#cdd6f4', background: 'rgba(255,255,255,0.1)',
                        borderRadius: 6
                    }}
                />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Dán đoạn mã trên vào trước thẻ <code>&lt;/head&gt;</code> của website bạn.
            </p>
        </div>
    );
}

export default function WorkspaceDetailPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const wsId = workspaceId as string;

    const [ready, setReady] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editingWidget, setEditingWidget] = useState<any>(null);
    const [configDrawer, setConfigDrawer] = useState(false);
    const [snippetModal, setSnippetModal] = useState<string | null>(null);
    const [createForm] = Form.useForm();
    const [configForm] = Form.useForm();

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    const { data: meData, isLoading: meLoading } = useGetMe(ready);
    const { data: wsRes } = useWorkspace(wsId, ready && !!wsId);
    const { data: totalUnreadCount = 0 } = useTotalUnreadCount(wsId, ready && !!wsId && !!meData);
    const { data: widgetsRes, isLoading: wLoading } = useWidgetsByWorkspace(wsId);
    const { mutateAsync: createWidget, isPending: creating } = useCreateWidget(wsId);
    const { mutateAsync: updateWidget, isPending: updating } = useUpdateWidget(wsId);
    const { mutateAsync: deleteWidget } = useDeleteWidget(wsId);

    const workspace = wsRes?.data;
    const widgets = widgetsRes?.data || [];

    const handleCreate = async (values: any) => {
        try {
            const res = await createWidget({ name: values.name });
            if (res.success) {
                message.success('Tạo widget thành công!');
                setShowCreate(false);
                createForm.resetFields();
            }
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
    };

    const openConfig = (widget: any) => {
        setEditingWidget(widget);
        const color = widget.config?.primaryColor || '#6366f1';
        configForm.setFieldsValue({
            name: widget.name,
            primaryColor: color,
            gradient: widget.config?.gradient || '',
            launcherStyle: widget.config?.launcherStyle || 'bubble',
            launcherText: widget.config?.launcherText || '',
            launcherIcon: widget.config?.launcherIcon || '',
            tooltipText: widget.config?.tooltipText || '',
            greeting: widget.config?.greeting,
            placeholder: widget.config?.placeholder,
            position: widget.config?.position || 'bottom-right',
            language: widget.config?.language || 'vi',
            offlineMessage: widget.config?.offlineMessage,
            autoReply: widget.config?.autoReply || '',
            showBranding: widget.config?.showBranding ?? true,
            preChatEnabled: widget.config?.preChatForm?.enabled ?? true,
            preChatTitle: widget.config?.preChatForm?.title || '',
            fieldName: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'name')?.enabled ?? true,
            fieldNameRequired: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'name')?.required ?? true,
            fieldEmail: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'email')?.enabled ?? true,
            fieldEmailRequired: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'email')?.required ?? false,
            fieldPhone: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'phone')?.enabled ?? true,
            fieldPhoneRequired: widget.config?.preChatForm?.fields?.find((f: any) => f.key === 'phone')?.required ?? false,
            // Load custom fields (non-builtin)
            customFields: (widget.config?.preChatForm?.fields || [])
                .filter((f: any) => !['name', 'email', 'phone'].includes(f.key))
                .map((f: any) => ({
                    key: f.key,
                    label: f.label,
                    type: f.type || 'text',
                    required: f.required || false,
                    options: f.type === 'select' ? (f.options || []).join('\n') : undefined,
                })),
            domainMode: widget.domainRules?.mode || 'allowlist',
            domains: widget.domainRules?.domains?.length ? widget.domainRules.domains.map((d: string) => ({ value: d })) : [],
        });
        setConfigDrawer(true);
    };

    const handleSaveConfig = async (values: any) => {
        try {
            let colorVal = values.primaryColor;
            if (typeof colorVal === 'object' && colorVal?.toHexString) colorVal = colorVal.toHexString();

            const domainList = (values.domains || []).map((d: any) => d.value).filter(Boolean);
            // Handle gradient: if user selected __custom__ but didn't pick colors, apply default gradient
            let gradientVal = values.gradient || '';
            if (gradientVal === '__custom__') {
                gradientVal = 'linear-gradient(135deg, #6366f1, #a855f7)';
            }
            const payload = {
                widgetId: editingWidget._id,
                name: values.name,
                config: {
                    primaryColor: colorVal,
                    gradient: gradientVal,
                    launcherStyle: values.launcherStyle,
                    launcherText: values.launcherText,
                    launcherIcon: values.launcherIcon,
                    tooltipText: values.tooltipText,
                    greeting: values.greeting,
                    placeholder: values.placeholder,
                    position: values.position,
                    language: values.language,
                    offlineMessage: values.offlineMessage,
                    autoReply: values.autoReply,
                    showBranding: values.showBranding,
                    preChatForm: {
                        enabled: values.preChatEnabled,
                        title: values.preChatTitle,
                        fields: [
                            { key: 'name', label: 'Họ và tên', type: 'text', required: values.fieldNameRequired, enabled: values.fieldName },
                            { key: 'email', label: 'Email', type: 'email', required: values.fieldEmailRequired, enabled: values.fieldEmail },
                            { key: 'phone', label: 'Số điện thoại', type: 'tel', required: values.fieldPhoneRequired, enabled: values.fieldPhone },
                            // Merge custom fields
                            ...((values.customFields || []).filter((cf: any) => cf?.label && cf?.key).map((cf: any) => ({
                                key: cf.key,
                                label: cf.label,
                                type: cf.type || 'text',
                                required: cf.required || false,
                                enabled: true,
                                options: cf.type === 'select' && typeof cf.options === 'string'
                                    ? cf.options.split('\n').filter(Boolean)
                                    : cf.options || [],
                            }))),
                        ],
                    },
                },
                domainRules: {
                    mode: values.domainMode || 'allowlist',
                    domains: domainList,
                },
            };
            const res = await updateWidget(payload);
            if (res.success) {
                message.success('Đã lưu cấu hình!');
                setConfigDrawer(false);
                setEditingWidget(null);
            }
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
    };

    const handleDelete = async (widgetId: string) => {
        Modal.confirm({
            title: 'Xoá widget này?',
            content: 'Widget sẽ bị vô hiệu hoá và không thể khôi phục.',
            okText: 'Xoá',
            cancelText: 'Huỷ',
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteWidget(widgetId);
                message.success('Đã xoá widget');
            },
        });
    };

    if (!ready || meLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <AppLayout headerTitle="Chat Widgets">
            <Head><title>{workspace?.name || 'Workspace'} | NemarChat</title></Head>

            {/* Content */}
            <main style={{ maxWidth: 1000, margin: '0px auto', padding: '40px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                    <div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                            Tạo và cấu hình các widget nhúng trên website của bạn.
                        </p>
                    </div>
                    <Button type="primary" icon={<Plus size={16} />}
                        onClick={() => setShowCreate(true)}
                        style={{
                            height: 40, borderRadius: 'var(--radius-full)',
                            background: 'var(--gradient-hero)', border: 'none', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: '0 4px 14px rgba(99,102,241,0.25)'
                        }}
                    >
                        Tạo Widget
                    </Button>
                </div>

                {wLoading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : widgets.length === 0 ? (
                    <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
                        <Empty description={<span style={{ color: 'var(--color-text-secondary)' }}>Chưa có widget nào.</span>} />
                        <Button type="primary" onClick={() => setShowCreate(true)} style={{
                            marginTop: 24, height: 40, borderRadius: 'var(--radius-full)',
                            background: 'var(--gradient-hero)', border: 'none', fontWeight: 600
                        }}>Tạo Widget đầu tiên</Button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                        {widgets.map((w: any) => (
                            <Card key={w._id} hoverable style={{ borderRadius: 12 }}
                                actions={[
                                    <Button key="cfg" type="text" icon={<Settings size={14} />} onClick={() => openConfig(w)}>Cấu hình</Button>,
                                    <Button key="code" type="text" icon={<Code size={14} />} onClick={() => setSnippetModal(w._id)}>Mã nhúng</Button>,
                                    <Button key="del" type="text" danger icon={<Trash2 size={14} />} onClick={() => handleDelete(w._id)} />,
                                ]}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: w.config?.primaryColor || '#6366f1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontWeight: 700, fontSize: 18
                                    }}>{w.name.charAt(0).toUpperCase()}</div>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{w.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                            {w.config?.position} · {w.config?.language || 'vi'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                                    {w.config?.greeting?.slice(0, 60)}{w.config?.greeting?.length > 60 ? '...' : ''}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <Tag color={w.config?.preChatForm?.enabled ? 'green' : 'default'} style={{ borderRadius: 8, fontSize: 11 }}>
                                        Pre-chat: {w.config?.preChatForm?.enabled ? 'Bật' : 'Tắt'}
                                    </Tag>
                                    <Tag style={{ borderRadius: 8, fontSize: 11 }}>
                                        Domains: {w.domainRules?.domains?.length || 0}
                                    </Tag>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            {/* ─── Create Widget Modal ─── */}
            <Modal title="Tạo Widget mới" open={showCreate}
                onCancel={() => { setShowCreate(false); createForm.resetFields(); }} footer={null} destroyOnClose>
                <Form form={createForm} layout="vertical" onFinish={handleCreate} requiredMark={false} style={{ marginTop: 16 }}>
                    <Form.Item label="Tên widget" name="name"
                        rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}>
                        <Input placeholder="VD: Widget hỗ trợ khách hàng" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Button onClick={() => { setShowCreate(false); createForm.resetFields(); }} style={{ marginRight: 8 }}>Huỷ</Button>
                        <Button type="primary" htmlType="submit" loading={creating}
                            style={{ background: 'var(--gradient-hero)', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-md)' }}>
                            Tạo widget
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* ─── Embed Snippet Modal ─── */}
            <Modal title="Mã nhúng widget" open={!!snippetModal} onCancel={() => setSnippetModal(null)} footer={null} width={600}>
                {snippetModal && <EmbedSnippet widgetId={snippetModal} />}
            </Modal>

            {/* ─── Config Drawer ─── */}
            <Drawer
                title="Cấu hình Widget"
                open={configDrawer}
                onClose={() => { setConfigDrawer(false); setEditingWidget(null); }}
                width={680}
                destroyOnClose
                extra={
                    <Button type="primary" loading={updating} onClick={() => configForm.submit()}
                        style={{ background: 'var(--gradient-hero)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                        Lưu cấu hình
                    </Button>
                }
            >
                {editingWidget && (
                    <div style={{ display: 'flex', gap: 24 }}>
                        {/* Form */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Form form={configForm} layout="vertical" onFinish={handleSaveConfig} requiredMark={false}>
                                <Tabs defaultActiveKey="general" items={[
                                    {
                                        key: 'general', label: 'Chung',
                                        children: (
                                            <>
                                                <Form.Item label="Tên widget" name="name">
                                                    <Input />
                                                </Form.Item>
                                                <Form.Item label="Màu chủ đạo" name="primaryColor">
                                                    <ColorPicker showText />
                                                </Form.Item>
                                                <Form.Item label="Lời chào" name="greeting">
                                                    <Input.TextArea rows={2} />
                                                </Form.Item>
                                                <Form.Item label="Placeholder" name="placeholder">
                                                    <Input />
                                                </Form.Item>
                                                <Form.Item label="Vị trí hiển thị" name="position">
                                                    <Select options={[
                                                        { value: 'bottom-right', label: 'Dưới phải (Mặc định)' },
                                                        { value: 'bottom-left', label: 'Dưới trái' },
                                                        { value: 'side-right', label: 'Gắn cạnh phải (Middle Right)' },
                                                        { value: 'side-left', label: 'Gắn cạnh trái (Middle Left)' },
                                                    ]} />
                                                </Form.Item>
                                                <Form.Item label="Ngôn ngữ" name="language">
                                                    <Select options={[
                                                        { value: 'vi', label: 'Tiếng Việt' },
                                                        { value: 'en', label: 'English' },
                                                    ]} />
                                                </Form.Item>
                                                <Form.Item label="Tin nhắn offline" name="offlineMessage">
                                                    <Input.TextArea rows={2} />
                                                </Form.Item>
                                                <Form.Item label="Tự động trả lời" name="autoReply">
                                                    <Input placeholder="Để trống nếu không cần" />
                                                </Form.Item>
                                                <Form.Item label="Hiện thương hiệu NemarChat" name="showBranding" valuePropName="checked">
                                                    <Switch />
                                                </Form.Item>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'appearance', label: 'Giao diện',
                                        children: (
                                            <>
                                                <Form.Item label="Kiểu nút bấm (Style)" name="launcherStyle">
                                                    <Select options={[
                                                        { value: 'bubble', label: 'Bong bóng tròn (Bubble)' },
                                                        { value: 'tab', label: 'Thẻ cạnh viền (Tab)' },
                                                        { value: 'pill', label: 'Hình viên thuốc (Pill)' },
                                                        { value: 'image', label: 'Ảnh tùy chỉnh (Image)' },
                                                    ]} />
                                                </Form.Item>
                                                
                                                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.launcherStyle !== cur.launcherStyle}>
                                                    {({ getFieldValue }) => {
                                                        const style = getFieldValue('launcherStyle') || 'bubble';
                                                        if (style === 'tab' || style === 'pill') {
                                                            return (
                                                                <Form.Item label="Văn bản trên nút" name="launcherText" extra="VD: Hỗ trợ, Text us...">
                                                                    <Input placeholder="Nhập chữ..." />
                                                                </Form.Item>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                </Form.Item>

                                                <Form.Item label="Icon / Ảnh đại diện nút" extra="Nhập URL ảnh hoặc tải ảnh lên để thay thế icon SVG mặc định.">
                                                    <Space.Compact style={{ width: '100%' }}>
                                                        <Form.Item name="launcherIcon" noStyle>
                                                            <Input placeholder="https://..." style={{ flex: 1 }} />
                                                        </Form.Item>
                                                        <Upload
                                                            showUploadList={false}
                                                            accept="image/*"
                                                            customRequest={async (options) => {
                                                                try {
                                                                    const res = await uploadService.uploadImage(options.file as File);
                                                                    if (res && res.url) {
                                                                        // The uploaded file is served from the backend (port 4010)
                                                                        const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4010';
                                                                        const fullUrl = apiBase + res.url;
                                                                        configForm.setFieldValue('launcherIcon', fullUrl);
                                                                        message.success('Tải ảnh thành công!');
                                                                        options.onSuccess?.(res);
                                                                    }
                                                                } catch (error) {
                                                                    message.error('Tải ảnh thất bại');
                                                                    options.onError?.(error as any);
                                                                }
                                                            }}
                                                        >
                                                            <Button icon={<UploadIcon size={16} />} title="Tải ảnh lên" />
                                                        </Upload>
                                                    </Space.Compact>
                                                    {configForm.getFieldValue('launcherIcon') && (
                                                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <img src={configForm.getFieldValue('launcherIcon')} alt="preview" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid #eee' }} />
                                                            <Button size="small" danger type="text" onClick={() => configForm.setFieldValue('launcherIcon', '')}>Xoá icon</Button>
                                                        </div>
                                                    )}
                                                </Form.Item>

                                                <Form.Item label="Tooltip (Trỏ chuột)" name="tooltipText" extra="VD: Liên hệ với chúng tôi">
                                                    <Input placeholder="Nhập chữ hiển thị khi hover..." />
                                                </Form.Item>

                                                <Form.Item label="Dải màu nền (Gradient)" extra="Ghi đè màu chủ đạo. Chọn mẫu có sẵn hoặc tự chọn 2 màu.">
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                        {/* Preset gradient selector */}
                                                        <Form.Item name="gradient" noStyle>
                                                            <Select allowClear placeholder="Chọn dải màu có sẵn..." onChange={(val) => {
                                                                if (val) configForm.setFieldValue('gradient', val);
                                                            }} options={[
                                                                { value: 'linear-gradient(135deg, #6366f1, #a855f7)', label: '💜 Indigo Purple' },
                                                                { value: 'linear-gradient(135deg, #3b82f6, #06b6d4)', label: '🌊 Ocean Blue' },
                                                                { value: 'linear-gradient(135deg, #ec4899, #f43f5e)', label: '💖 Love Pink' },
                                                                { value: 'linear-gradient(135deg, #f59e0b, #ed8936)', label: '🌅 Sunset Orange' },
                                                                { value: 'linear-gradient(135deg, #10b981, #3b82f6)', label: '🌿 Emerald Sea' },
                                                                { value: 'linear-gradient(135deg, #111827, #374151)', label: '🌑 Midnight Dark' },
                                                                { value: '__custom__', label: '🎨 Tuỳ chỉnh (chọn 2 màu)' },
                                                            ]} />
                                                        </Form.Item>
                                                        {/* Custom dual-color picker */}
                                                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.gradient !== cur.gradient}>
                                                            {({ getFieldValue }) => {
                                                                const g = getFieldValue('gradient') || '';
                                                                if (g === '__custom__' || (g && !g.startsWith('linear-gradient(135deg, #') || g === '__custom__')) {
                                                                    return null; // show below
                                                                }
                                                                return null;
                                                            }}
                                                        </Form.Item>
                                                        <Form.Item noStyle shouldUpdate>
                                                            {({ getFieldValue, setFieldValue }) => {
                                                                const g = getFieldValue('gradient') || '';
                                                                const isCustom = g === '__custom__' || (g && g.startsWith('linear-gradient') && ![
                                                                    'linear-gradient(135deg, #6366f1, #a855f7)',
                                                                    'linear-gradient(135deg, #3b82f6, #06b6d4)',
                                                                    'linear-gradient(135deg, #ec4899, #f43f5e)',
                                                                    'linear-gradient(135deg, #f59e0b, #ed8936)',
                                                                    'linear-gradient(135deg, #10b981, #3b82f6)',
                                                                    'linear-gradient(135deg, #111827, #374151)',
                                                                ].includes(g));
                                                                if (!isCustom && g !== '__custom__') return null;

                                                                // Parse existing gradient colors or use defaults
                                                                let c1 = '#6366f1', c2 = '#a855f7';
                                                                if (g && g !== '__custom__') {
                                                                    const match = g.match(/#[0-9a-fA-F]{6}/g);
                                                                    if (match && match.length >= 2) { c1 = match[0]; c2 = match[1]; }
                                                                }

                                                                return (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fafafa', borderRadius: 10, border: '1px solid #f0f0f0' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                                            <span style={{ fontSize: 11, color: '#888' }}>Màu 1</span>
                                                                            <ColorPicker value={c1} showText size="small" onChange={(color) => {
                                                                                const hex1 = color.toHexString();
                                                                                setFieldValue('gradient', `linear-gradient(135deg, ${hex1}, ${c2})`);
                                                                            }} />
                                                                        </div>
                                                                        <div style={{ flex: 1, height: 32, borderRadius: 8, background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
                                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                                            <span style={{ fontSize: 11, color: '#888' }}>Màu 2</span>
                                                                            <ColorPicker value={c2} showText size="small" onChange={(color) => {
                                                                                const hex2 = color.toHexString();
                                                                                setFieldValue('gradient', `linear-gradient(135deg, ${c1}, ${hex2})`);
                                                                            }} />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }}
                                                        </Form.Item>
                                                        {/* Preview swatch */}
                                                        <Form.Item noStyle shouldUpdate>
                                                            {({ getFieldValue }) => {
                                                                const g = getFieldValue('gradient');
                                                                if (!g || g === '__custom__') return null;
                                                                return (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        <div style={{ width: 120, height: 28, borderRadius: 6, background: g, border: '1px solid #e0e0e0' }} />
                                                                        <span style={{ fontSize: 11, color: '#999' }}>Xem trước</span>
                                                                    </div>
                                                                );
                                                            }}
                                                        </Form.Item>
                                                    </div>
                                                </Form.Item>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'prechat', label: 'Form Pre-chat',
                                        children: (
                                            <>
                                                <Form.Item label="Bật form pre-chat" name="preChatEnabled" valuePropName="checked">
                                                    <Switch />
                                                </Form.Item>
                                                <Form.Item label="Tiêu đề form" name="preChatTitle">
                                                    <Input />
                                                </Form.Item>
                                                <Divider style={{ fontSize: 13 }}>Trường mặc định</Divider>
                                                {/* Built-in fields: name/email/phone */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <Text strong style={{ fontSize: 13 }}>Họ và tên</Text>
                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                        <Form.Item name="fieldNameRequired" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bắt buộc" unCheckedChildren="Tuỳ chọn" />
                                                        </Form.Item>
                                                        <Form.Item name="fieldName" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bật" unCheckedChildren="Tắt" />
                                                        </Form.Item>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <Text strong style={{ fontSize: 13 }}>Email</Text>
                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                        <Form.Item name="fieldEmailRequired" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bắt buộc" unCheckedChildren="Tuỳ chọn" />
                                                        </Form.Item>
                                                        <Form.Item name="fieldEmail" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bật" unCheckedChildren="Tắt" />
                                                        </Form.Item>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <Text strong style={{ fontSize: 13 }}>Số điện thoại</Text>
                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                        <Form.Item name="fieldPhoneRequired" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bắt buộc" unCheckedChildren="Tuỳ chọn" />
                                                        </Form.Item>
                                                        <Form.Item name="fieldPhone" valuePropName="checked" noStyle>
                                                            <Switch size="small" checkedChildren="Bật" unCheckedChildren="Tắt" />
                                                        </Form.Item>
                                                    </div>
                                                </div>
                                                {/* Custom fields */}
                                                <Divider style={{ fontSize: 13 }}>Trường tuỳ chỉnh</Divider>
                                                <Form.List name="customFields">
                                                    {(fields, { add, remove }) => (
                                                        <>
                                                            {fields.map(({ key, name, ...restField }) => (
                                                                <Card key={key} size="small" style={{ marginBottom: 8 }}
                                                                    extra={<MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />}>
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                                        <Form.Item {...restField} name={[name, 'label']} label="Nhãn" rules={[{ required: true }]} style={{ marginBottom: 4 }}>
                                                                            <Input placeholder="Ví dụ: Công ty" size="small" />
                                                                        </Form.Item>
                                                                        <Form.Item {...restField} name={[name, 'key']} label="Key" rules={[{ required: true }]} style={{ marginBottom: 4 }}>
                                                                            <Input placeholder="vd: company" size="small" />
                                                                        </Form.Item>
                                                                        <Form.Item {...restField} name={[name, 'type']} label="Loại" initialValue="text" style={{ marginBottom: 4 }}>
                                                                            <Select size="small" options={[
                                                                                { value: 'text', label: 'Text' },
                                                                                { value: 'email', label: 'Email' },
                                                                                { value: 'tel', label: 'Điện thoại' },
                                                                                { value: 'textarea', label: 'Textarea' },
                                                                                { value: 'select', label: 'Select (dropdown)' },
                                                                            ]} />
                                                                        </Form.Item>
                                                                        <Form.Item {...restField} name={[name, 'required']} label="Bắt buộc" valuePropName="checked" style={{ marginBottom: 4 }}>
                                                                            <Switch size="small" />
                                                                        </Form.Item>
                                                                    </div>
                                                                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.customFields?.[name]?.type !== cur?.customFields?.[name]?.type}>
                                                                        {({ getFieldValue }) => {
                                                                            const type = getFieldValue(['customFields', name, 'type']);
                                                                            if (type === 'select') {
                                                                                return (
                                                                                    <Form.Item {...restField} name={[name, 'options']} label="Lựa chọn (mỗi dòng 1)" style={{ marginBottom: 0, marginTop: 4 }}>
                                                                                        <Input.TextArea rows={2} placeholder={'Tùy chọn 1\nTùy chọn 2\nTùy chọn 3'} />
                                                                                    </Form.Item>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        }}
                                                                    </Form.Item>
                                                                </Card>
                                                            ))}
                                                            <Button type="dashed" onClick={() => add({ type: 'text', required: false, enabled: true })} block icon={<PlusOutlined />} style={{ marginTop: 4 }}>
                                                                Thêm trường tuỳ chỉnh
                                                            </Button>
                                                        </>
                                                    )}
                                                </Form.List>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'domains', label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Globe size={13} /> Domains</span>,
                                        children: (
                                            <>
                                                <Form.Item label="Chế độ" name="domainMode">
                                                    <Select options={[
                                                        { value: 'allowlist', label: 'Allowlist — Chỉ cho phép các domain dưới đây' },
                                                        { value: 'blocklist', label: 'Blocklist — Chặn các domain dưới đây' },
                                                    ]} />
                                                </Form.Item>
                                                <Divider style={{ fontSize: 13 }}>Danh sách domain</Divider>
                                                <Form.List name="domains">
                                                    {(fields, { add, remove }) => (
                                                        <>
                                                            {fields.map(({ key, name, ...restField }) => (
                                                                <Space key={key} style={{ display: 'flex', marginBottom: 8, width: '100%' }} align="baseline">
                                                                    <Form.Item
                                                                        {...restField}
                                                                        name={[name, 'value']}
                                                                        style={{ flex: 1, marginBottom: 0, width: 260 }}
                                                                        rules={[{ required: true, message: 'Nhập domain' }]}
                                                                    >
                                                                        <Input placeholder="example.com hoặc *.example.com" />
                                                                    </Form.Item>
                                                                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                                                </Space>
                                                            ))}
                                                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 4 }}>
                                                                Thêm domain
                                                            </Button>
                                                        </>
                                                    )}
                                                </Form.List>
                                                <div style={{ marginTop: 16, padding: 12, background: '#f6f6f6', borderRadius: 8, fontSize: 12, color: '#666' }}>
                                                    <strong>Hướng dẫn:</strong><br />
                                                    • <code>example.com</code> — chỉ domain chính xác<br />
                                                    • <code>*.example.com</code> — tất cả subdomain<br />
                                                    • Nếu allowlist trống → widget hiển thị mọi nơi
                                                </div>
                                            </>
                                        ),
                                    },
                                ]} />
                            </Form>
                        </div>
                        {/* Live preview — updates in real-time */}
                        <div style={{ width: 340, flexShrink: 0 }}>
                            <div style={{ position: 'sticky', top: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Eye size={14} /> Xem trước (realtime)
                                </div>
                                <LivePreview form={configForm} />
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>
        </AppLayout>
    );
}
