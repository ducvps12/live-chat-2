import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Button, Modal, Form, Input, message, Empty, Spin } from 'antd';
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
} from 'lucide-react';
import { useGetMe } from '../../domains/auth/auth.hooks';
import { useMyWorkspaces, useCreateWorkspace } from '../../domains/workspace/workspace.hooks';
import AppLayout from '../../components/layout/AppLayout';

/* ─── Gradient palette per card index ─── */
const CARD_GRADIENTS = [
    { bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', glow: 'rgba(99,102,241,0.18)' },
    { bg: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)', glow: 'rgba(139,92,246,0.18)' },
    { bg: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)', glow: 'rgba(6,182,212,0.18)' },
    { bg: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', glow: 'rgba(245,158,11,0.18)' },
    { bg: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', glow: 'rgba(16,185,129,0.18)' },
    { bg: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', glow: 'rgba(236,72,153,0.18)' },
];

const PLAN_STYLES: Record<string, { bg: string; text: string; border: string; icon: boolean }> = {
    free: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', icon: false },
    pro: { bg: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', text: '#4f46e5', border: '#c7d2fe', icon: true },
    business: { bg: 'linear-gradient(135deg, #fefce8, #fef3c7)', text: '#b45309', border: '#fcd34d', icon: true },
};

export default function WorkspacePage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [form] = Form.useForm();

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
                message.success('Tạo workspace thành công!');
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
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (meError || !meData?.data?.user) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <div className="card" style={{ padding: 40, textAlign: 'center', maxWidth: 400 }}>
                    <h2 style={{ marginBottom: 12 }}>Phiên đăng nhập hết hạn</h2>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>Vui lòng đăng nhập lại.</p>
                    <a href="/auth/login" className="btn btn-primary" style={{ display: 'inline-block' }}>Đăng nhập</a>
                </div>
            </div>
        );
    }

    const workspaces = wsData?.data || [];

    return (
        <AppLayout headerTitle="Workspace của bạn">
            <Head><title>Workspace | NemarChat</title></Head>

            <main style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 24px 72px' }}>
                {/* ─── Page Header ─── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 36, flexWrap: 'wrap', gap: 16,
                }}>
                    <div>
                        <h1 style={{
                            fontSize: 28, fontWeight: 800, marginBottom: 6,
                            letterSpacing: '-0.02em', color: '#0f172a',
                        }}>
                            Workspace của bạn
                        </h1>
                        <p style={{ color: '#64748b', fontSize: 15, margin: 0, lineHeight: 1.6 }}>
                            Quản lý các workspace và cấu hình live-chat cho từng dự án.
                        </p>
                    </div>

                    <button
                        onClick={() => setShowCreate(true)}
                        style={{
                            height: 44,
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                            border: 'none',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 22px',
                            cursor: 'pointer',
                            boxShadow: '0 6px 20px rgba(99,102,241,0.3), 0 1px 3px rgba(99,102,241,0.2)',
                            transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 10px 28px rgba(99,102,241,0.4), 0 2px 6px rgba(99,102,241,0.25)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.3), 0 1px 3px rgba(99,102,241,0.2)';
                        }}
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Tạo Workspace
                    </button>
                </div>

                {/* ─── Workspace Grid ─── */}
                {wsLoading ? (
                    <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                ) : workspaces.length === 0 ? (
                    <div style={{
                        padding: '72px 40px', textAlign: 'center',
                        background: '#fff', borderRadius: 24,
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
                    }}>
                        <Empty
                            description={
                                <span style={{ color: '#64748b', fontSize: 15 }}>
                                    Bạn chưa có workspace nào. Hãy tạo workspace đầu tiên!
                                </span>
                            }
                        />
                        <button
                            onClick={() => setShowCreate(true)}
                            style={{
                                marginTop: 28, height: 44, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', color: '#fff', fontWeight: 600,
                                fontSize: 14, padding: '0 28px', cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
                            }}
                        >
                            <Sparkles size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Tạo Workspace đầu tiên
                        </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 24,
                    }}>
                        {workspaces.map((ws: any, idx: number) => {
                            const palette = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
                            const planKey = ((ws.plan as string) || 'free').toLowerCase();
                            const planStyle = PLAN_STYLES[planKey] || PLAN_STYLES.free;
                            const members = (ws.members as unknown[]) || [];
                            const settings = (ws.settings as Record<string, string>) || {};

                            return (
                                <div
                                    key={ws._id as string}
                                    style={{
                                        position: 'relative',
                                        borderRadius: 22,
                                        background: '#fff',
                                        border: '1px solid #e8ecf2',
                                        padding: 0,
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                                        overflow: 'hidden',
                                    }}
                                    onMouseEnter={e => {
                                        const el = e.currentTarget;
                                        el.style.transform = 'translateY(-4px)';
                                        el.style.boxShadow = `0 20px 48px ${palette.glow}, 0 4px 12px rgba(15,23,42,0.06)`;
                                        el.style.borderColor = '#c7d2fe';
                                    }}
                                    onMouseLeave={e => {
                                        const el = e.currentTarget;
                                        el.style.transform = 'translateY(0)';
                                        el.style.boxShadow = '0 1px 3px rgba(15,23,42,0.04)';
                                        el.style.borderColor = '#e8ecf2';
                                    }}
                                >
                                    {/* ─ Gradient accent top bar ─ */}
                                    <div style={{
                                        height: 4,
                                        background: palette.bg,
                                        borderRadius: '22px 22px 0 0',
                                    }} />

                                    <div style={{ padding: '24px 28px 28px' }}>
                                        {/* ─ Header row ─ */}
                                        <div style={{
                                            display: 'flex', alignItems: 'flex-start',
                                            justifyContent: 'space-between', marginBottom: 24,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                {/* Avatar */}
                                                <div style={{
                                                    width: 56, height: 56, borderRadius: 16,
                                                    background: `linear-gradient(135deg, ${palette.bg}, #ffffff)`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: palette.bg, fontWeight: 800, fontSize: 24,
                                                    boxShadow: `0 8px 20px ${palette.glow}, inset 0 2px 4px rgba(255,255,255,0.6)`,
                                                    border: `1px solid ${palette.glow}`,
                                                    flexShrink: 0,
                                                }}>
                                                    {(ws.name as string).charAt(0).toUpperCase()}
                                                </div>

                                                {/* Name + slug */}
                                                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <h3 style={{
                                                        fontSize: 19, fontWeight: 700, margin: 0,
                                                        color: '#0f172a', lineHeight: 1.3,
                                                        letterSpacing: '-0.02em',
                                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {ws.name as string}
                                                    </h3>
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center',
                                                        background: '#f1f5f9', padding: '2px 8px', borderRadius: 6,
                                                        fontSize: 12, color: '#64748b', fontWeight: 600, fontFamily: 'monospace',
                                                        width: 'fit-content'
                                                    }}>
                                                        /{ws.slug as string}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Plan badge */}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '5px 12px', borderRadius: 10,
                                                background: planStyle.bg,
                                                border: `1px solid ${planStyle.border}`,
                                                color: planStyle.text,
                                                fontSize: 11, fontWeight: 700,
                                                letterSpacing: '0.04em',
                                                textTransform: 'uppercase',
                                                flexShrink: 0,
                                            }}>
                                                {planStyle.icon && <Crown size={12} />}
                                                {((ws.plan as string) || 'free').toUpperCase()}
                                            </span>
                                        </div>

                                        {/* ─ Info pills ─ */}
                                        <div style={{
                                            display: 'flex', flexWrap: 'wrap', gap: 10,
                                            marginBottom: 22,
                                        }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '7px 14px', borderRadius: 10,
                                                background: '#f8fafc', border: '1px solid #f1f5f9',
                                                fontSize: 13, color: '#475569', fontWeight: 500,
                                            }}>
                                                <Users size={14} color="#6366f1" />
                                                {members.length} thành viên
                                            </span>

                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '7px 14px', borderRadius: 10,
                                                background: '#f8fafc', border: '1px solid #f1f5f9',
                                                fontSize: 13, color: '#475569', fontWeight: 500,
                                            }}>
                                                <Globe size={14} color="#06b6d4" />
                                                {settings.language || 'vi'}
                                            </span>

                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '7px 14px', borderRadius: 10,
                                                background: '#f0fdf4', border: '1px solid #dcfce7',
                                                fontSize: 13, color: '#16a34a', fontWeight: 500,
                                            }}>
                                                <span style={{
                                                    width: 7, height: 7, borderRadius: '50%',
                                                    background: '#22c55e', flexShrink: 0,
                                                }} />
                                                Hoạt động
                                            </span>
                                        </div>

                                        {/* ─ Action buttons ─ */}
                                        <div style={{
                                            display: 'flex', gap: 12,
                                            paddingTop: 20,
                                            borderTop: '1px solid #f1f5f9',
                                        }}>
                                            <button
                                                onClick={() => router.push(`/workspace/${ws._id}`)}
                                                style={{
                                                    flex: 1.5, height: 44, borderRadius: 14,
                                                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                    border: 'none', color: '#fff',
                                                    fontSize: 14, fontWeight: 600, letterSpacing: '0.01em',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                    cursor: 'pointer',
                                                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                                                    transition: 'all 0.25s ease-out',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.4)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(79, 70, 229, 0.3)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <ExternalLink size={16} strokeWidth={2.5} />
                                                Mở Workspace
                                                <ArrowRight size={16} strokeWidth={2.5} />
                                            </button>

                                            <button
                                                onClick={() => router.push(`/workspace/${ws._id}/teams`)}
                                                style={{
                                                    flex: 1, height: 44, borderRadius: 14,
                                                    background: '#fff',
                                                    border: '1px solid #e2e8f0',
                                                    color: '#334155',
                                                    fontSize: 14, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#c7d2fe';
                                                    e.currentTarget.style.color = '#4f46e5';
                                                    e.currentTarget.style.background = '#f8fafc';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                    e.currentTarget.style.color = '#334155';
                                                    e.currentTarget.style.background = '#fff';
                                                }}
                                            >
                                                <Users size={16} />
                                                Nhân sự
                                            </button>

                                            <button
                                                onClick={() => router.push(`/workspace/${ws._id}/settings`)}
                                                style={{
                                                    flex: 1, height: 44, borderRadius: 14,
                                                    background: '#fff',
                                                    border: '1px solid #e2e8f0',
                                                    color: '#334155',
                                                    fontSize: 14, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#c7d2fe';
                                                    e.currentTarget.style.color = '#4f46e5';
                                                    e.currentTarget.style.background = '#f8fafc';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                    e.currentTarget.style.color = '#334155';
                                                    e.currentTarget.style.background = '#fff';
                                                }}
                                            >
                                                <Settings size={16} />
                                                Cài đặt
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ─── Create Workspace Modal ─── */}
            <Modal
                title={null}
                open={showCreate}
                onCancel={() => { setShowCreate(false); form.resetFields(); }}
                footer={null}
                destroyOnClose
                styles={{
                    body: { padding: '28px 28px 24px' },
                    header: { display: 'none' },
                }}
                width={480}
            >
                <div style={{ marginBottom: 24 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <MessageSquare size={18} color="#fff" />
                        </div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                            Tạo Workspace mới
                        </h2>
                    </div>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        Thiết lập workspace để bắt đầu hỗ trợ khách hàng.
                    </p>
                </div>

                <Form form={form} layout="vertical" onFinish={handleCreate} requiredMark={false}>
                    <Form.Item
                        label={<span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Tên workspace</span>}
                        name="name"
                        rules={[{ required: true, message: 'Vui lòng nhập tên workspace!' }]}
                    >
                        <Input
                            placeholder="VD: Công ty ABC"
                            onChange={handleNameChange}
                            style={{ height: 42, borderRadius: 12, fontSize: 14 }}
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Slug (URL)</span>}
                        name="slug"
                        rules={[
                            { required: true, message: 'Vui lòng nhập slug!' },
                            { pattern: /^[a-z0-9-]+$/, message: 'Slug chỉ chấp nhận chữ thường, số và dấu gạch ngang' }
                        ]}
                    >
                        <Input
                            placeholder="cong-ty-abc"
                            addonBefore="/"
                            style={{ borderRadius: 12, fontSize: 14 }}
                        />
                    </Form.Item>

                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: 10,
                        marginTop: 28, paddingTop: 20,
                        borderTop: '1px solid #f1f5f9',
                    }}>
                        <Button
                            onClick={() => { setShowCreate(false); form.resetFields(); }}
                            style={{ height: 42, borderRadius: 12, fontSize: 14, fontWeight: 500, padding: '0 20px' }}
                        >
                            Huỷ
                        </Button>
                        <button
                            type="submit"
                            disabled={creating}
                            style={{
                                height: 42, borderRadius: 12,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', color: '#fff',
                                fontWeight: 600, fontSize: 14,
                                padding: '0 24px',
                                cursor: creating ? 'not-allowed' : 'pointer',
                                opacity: creating ? 0.7 : 1,
                                boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            onClick={() => form.submit()}
                        >
                            {creating ? <Spin size="small" /> : <Sparkles size={16} />}
                            Tạo workspace
                        </button>
                    </div>
                </Form>
            </Modal>

            {/* ─── Responsive: 1 col on small screens ─── */}
            <style jsx>{`
                @media (max-width: 768px) {
                    main > div:last-of-type {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </AppLayout>
    );
}
