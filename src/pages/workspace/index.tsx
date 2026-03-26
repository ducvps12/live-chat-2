import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Modal, Form, Input, message, Spin } from 'antd';
import {
    Plus,
    Settings,
    Users,
    ExternalLink,
    Globe,
    ArrowRight,
    Sparkles,
    MessageSquare,
    Crown,
    LayoutDashboard,
    Zap,
    ChevronRight,
} from 'lucide-react';
import { useGetMe } from '../../domains/auth/auth.hooks';
import { useMyWorkspaces, useCreateWorkspace } from '../../domains/workspace/workspace.hooks';
import AppLayout from '../../components/layout/AppLayout';

/* ─── Google/Apple-Inspired Minimal Color System ─── */
const ACCENT_COLORS = [
    { accent: '#1a73e8', soft: '#e8f0fe', glow: 'rgba(26,115,232,0.08)' },
    { accent: '#34a853', soft: '#e6f4ea', glow: 'rgba(52,168,83,0.08)' },
    { accent: '#ea4335', soft: '#fce8e6', glow: 'rgba(234,67,53,0.08)' },
    { accent: '#fbbc04', soft: '#fef7e0', glow: 'rgba(251,188,4,0.08)' },
    { accent: '#9334e6', soft: '#f3e8fd', glow: 'rgba(147,52,230,0.08)' },
    { accent: '#00acc1', soft: '#e0f7fa', glow: 'rgba(0,172,193,0.08)' },
];

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string; icon: boolean }> = {
    free:     { label: 'Free',     color: '#5f6368', bg: '#f1f3f4', icon: false },
    pro:      { label: 'Pro',      color: '#1a73e8', bg: '#e8f0fe', icon: true },
    business: { label: 'Business', color: '#e37400', bg: '#fef7e0', icon: true },
};

export default function WorkspacePage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [form] = Form.useForm();
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem('nemark_token');
        setReady(true);
        if (!stored) router.replace('/auth/login');
    }, [router]);

    const { data: meData, isLoading: meLoading, isError: meError } = useGetMe(ready);
    const { data: wsData, isLoading: wsLoading } = useMyWorkspaces();
    const { mutateAsync: createWs, isPending: creating } = useCreateWorkspace();

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
        form.setFieldValue('slug', slug);
    };

    const handleCreate = async (values: any) => {
        try {
            const res = await createWs(values);
            if (res.success) {
                message.success('Workspace đã được tạo thành công');
                setShowCreate(false);
                form.resetFields();
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            message.error(error.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
    };

    if (!ready || meLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (meError || !meData?.data?.user) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
                <div style={{
                    padding: '48px 40px', textAlign: 'center', maxWidth: 400,
                    background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                    <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: '#202124' }}>Phiên đăng nhập hết hạn</h2>
                    <p style={{ color: '#5f6368', marginBottom: 24, fontSize: 14 }}>Vui lòng đăng nhập lại để tiếp tục.</p>
                    <a href="/auth/login" style={{
                        display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 24px',
                        background: '#1a73e8', color: '#fff', borderRadius: 20, fontWeight: 500, fontSize: 14,
                        textDecoration: 'none',
                    }}>Đăng nhập</a>
                </div>
            </div>
        );
    }

    const workspaces = wsData?.data || [];

    return (
        <AppLayout headerTitle="Workspace">
            <Head><title>Workspace | NemarkChat</title></Head>

            <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 32px 80px' }}>
                {/* ─── Page Header ─── */}
                <div style={{
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    marginBottom: 40, gap: 16,
                }}>
                    <div>
                        <h1 style={{
                            fontSize: 24, fontWeight: 600, margin: '0 0 4px',
                            color: '#202124', letterSpacing: '-0.01em',
                            fontFamily: "'Google Sans', 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                        }}>
                            Workspace
                        </h1>
                        <p style={{
                            color: '#5f6368', fontSize: 14, margin: 0, lineHeight: 1.5,
                        }}>
                            Quản lý các workspace và cấu hình live-chat cho từng dự án
                        </p>
                    </div>

                    <button
                        onClick={() => setShowCreate(true)}
                        style={{
                            height: 36,
                            borderRadius: 18,
                            background: '#1a73e8',
                            border: 'none',
                            color: '#fff',
                            fontWeight: 500,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '0 20px 0 16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = '#1765cc';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15), 0 4px 8px rgba(26,115,232,0.2)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = '#1a73e8';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)';
                        }}
                    >
                        <Plus size={18} strokeWidth={2} />
                        Tạo mới
                    </button>
                </div>

                {/* ─── Content ─── */}
                {wsLoading ? (
                    <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                ) : workspaces.length === 0 ? (
                    /* Empty State — Apple-style centered card */
                    <div style={{
                        padding: '80px 40px', textAlign: 'center',
                        background: '#fff', borderRadius: 16,
                        border: '1px solid #e0e0e0',
                    }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 16,
                            background: '#e8f0fe', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px',
                        }}>
                            <LayoutDashboard size={28} color="#1a73e8" strokeWidth={1.5} />
                        </div>
                        <h3 style={{
                            fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: '#202124',
                        }}>Chưa có workspace nào</h3>
                        <p style={{
                            color: '#5f6368', fontSize: 14, margin: '0 0 28px', maxWidth: 340,
                            marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5,
                        }}>
                            Tạo workspace đầu tiên để bắt đầu quản lý hỗ trợ khách hàng.
                        </p>
                        <button
                            onClick={() => setShowCreate(true)}
                            style={{
                                height: 40, borderRadius: 20,
                                background: '#1a73e8', border: 'none', color: '#fff',
                                fontWeight: 500, fontSize: 14, padding: '0 28px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }}
                        >
                            <Plus size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Tạo workspace
                        </button>
                    </div>
                ) : (
                    /* Workspace Cards */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {workspaces.map((ws: any, idx: number) => {
                            const palette = ACCENT_COLORS[idx % ACCENT_COLORS.length];
                            const planKey = ((ws.plan as string) || 'free').toLowerCase();
                            const plan = PLAN_CONFIG[planKey] || PLAN_CONFIG.free;
                            const members = (ws.members as unknown[]) || [];
                            const settings = (ws.settings as Record<string, string>) || {};
                            const isHovered = hoveredCard === ws._id;

                            return (
                                <div
                                    key={ws._id as string}
                                    onClick={() => router.push(`/workspace/${ws._id}`)}
                                    onMouseEnter={() => setHoveredCard(ws._id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 20,
                                        padding: '20px 24px',
                                        background: isHovered ? '#f8f9fa' : '#fff',
                                        borderRadius: 12,
                                        border: '1px solid #e0e0e0',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: isHovered
                                            ? '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)'
                                            : '0 1px 2px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12,
                                        background: palette.soft,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: palette.accent, fontWeight: 600, fontSize: 20,
                                        flexShrink: 0,
                                        transition: 'transform 0.15s ease',
                                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                                    }}>
                                        {(ws.name as string).charAt(0).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                            <h3 style={{
                                                fontSize: 15, fontWeight: 600, margin: 0,
                                                color: '#202124', lineHeight: 1.3,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {ws.name as string}
                                            </h3>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 4,
                                                background: plan.bg, color: plan.color,
                                                fontSize: 11, fontWeight: 600,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.02em',
                                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                                flexShrink: 0,
                                            }}>
                                                {plan.icon && <Crown size={10} />}
                                                {plan.label}
                                            </span>
                                        </div>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 16,
                                            fontSize: 13, color: '#5f6368',
                                        }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Users size={13} color="#9aa0a6" />
                                                {members.length} thành viên
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Globe size={13} color="#9aa0a6" />
                                                {settings.language || 'vi'}
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{
                                                    width: 6, height: 6, borderRadius: '50%',
                                                    background: '#34a853', flexShrink: 0,
                                                }} />
                                                Đang hoạt động
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        opacity: isHovered ? 1 : 0,
                                        transition: 'opacity 0.15s ease',
                                    }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${ws._id}/teams`); }}
                                            title="Nhân sự"
                                            style={{
                                                width: 36, height: 36, borderRadius: 18,
                                                background: 'transparent', border: 'none',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#5f6368',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#e8eaed'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Users size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${ws._id}/settings`); }}
                                            title="Cài đặt"
                                            style={{
                                                width: 36, height: 36, borderRadius: 18,
                                                background: 'transparent', border: 'none',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#5f6368',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#e8eaed'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Settings size={18} />
                                        </button>
                                        <ChevronRight size={20} color="#9aa0a6" style={{ marginLeft: 4 }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ─── Create Modal — Apple-style clean sheet ─── */}
            <Modal
                title={null}
                open={showCreate}
                onCancel={() => { setShowCreate(false); form.resetFields(); }}
                footer={null}
                destroyOnClose
                styles={{
                    body: { padding: '32px 32px 28px' },
                    header: { display: 'none' },
                }}
                width={440}
            >
                <div style={{ marginBottom: 28 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: '#e8f0fe',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 16,
                    }}>
                        <Zap size={22} color="#1a73e8" strokeWidth={2} />
                    </div>
                    <h2 style={{
                        fontSize: 20, fontWeight: 600, margin: '0 0 6px', color: '#202124',
                        fontFamily: "'Google Sans', 'SF Pro Display', -apple-system, sans-serif",
                    }}>
                        Tạo workspace mới
                    </h2>
                    <p style={{ fontSize: 14, color: '#5f6368', margin: 0, lineHeight: 1.5 }}>
                        Thiết lập workspace để bắt đầu hỗ trợ khách hàng.
                    </p>
                </div>

                <Form form={form} layout="vertical" onFinish={handleCreate} requiredMark={false}>
                    <Form.Item
                        label={<span style={{ fontWeight: 500, fontSize: 13, color: '#202124' }}>Tên workspace</span>}
                        name="name"
                        rules={[{ required: true, message: 'Vui lòng nhập tên workspace' }]}
                    >
                        <Input
                            placeholder="VD: Công ty ABC"
                            onChange={handleNameChange}
                            style={{ height: 44, borderRadius: 8, fontSize: 14, border: '1px solid #dadce0' }}
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 500, fontSize: 13, color: '#202124' }}>Slug (URL)</span>}
                        name="slug"
                        rules={[
                            { required: true, message: 'Vui lòng nhập slug' },
                            { pattern: /^[a-z0-9-]+$/, message: 'Chỉ chấp nhận chữ thường, số và dấu gạch ngang' }
                        ]}
                    >
                        <Input
                            placeholder="cong-ty-abc"
                            addonBefore="/"
                            style={{ borderRadius: 8, fontSize: 14 }}
                        />
                    </Form.Item>

                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: 12,
                        marginTop: 28, paddingTop: 20,
                        borderTop: '1px solid #e0e0e0',
                    }}>
                        <button
                            type="button"
                            onClick={() => { setShowCreate(false); form.resetFields(); }}
                            style={{
                                height: 36, borderRadius: 18, padding: '0 20px',
                                background: 'transparent', border: '1px solid #dadce0',
                                color: '#1a73e8', fontSize: 14, fontWeight: 500,
                                cursor: 'pointer', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            Huỷ
                        </button>
                        <button
                            type="button"
                            disabled={creating}
                            onClick={() => form.submit()}
                            style={{
                                height: 36, borderRadius: 18, padding: '0 24px',
                                background: '#1a73e8', border: 'none',
                                color: '#fff', fontSize: 14, fontWeight: 500,
                                cursor: creating ? 'not-allowed' : 'pointer',
                                opacity: creating ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: 6,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!creating) e.currentTarget.style.background = '#1765cc'; }}
                            onMouseLeave={e => { if (!creating) e.currentTarget.style.background = '#1a73e8'; }}
                        >
                            {creating && <Spin size="small" />}
                            Tạo workspace
                        </button>
                    </div>
                </Form>
            </Modal>
        </AppLayout>
    );
}
