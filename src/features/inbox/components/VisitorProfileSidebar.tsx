import React, { useState, useEffect } from 'react';
import { Spin, Button, Form, Input, Empty, message, Tag, Select, Mentions } from 'antd';
import { Edit2, Mail, Phone, User, MonitorSmartphone, MapPin, Tag as TagIcon, StickyNote, Star, Target, Facebook, Image, FileText, Link as LinkIcon, ChevronDown, MessageCircle, Copy, Clock, Eye, Sparkles, Hash, Globe, Shield } from 'lucide-react';
import { useGetVisitor, useUpdateVisitor } from '../hooks/useVisitor';

const LEAD_STAGES = [
    { key: 'intake', label: 'Intake', color: '#1a73e8', bg: '#e8f0fe', icon: '📥' },
    { key: 'qualified', label: 'Qualified', color: '#0d652d', bg: '#e6f4ea', icon: '✅' },
    { key: 'potential', label: 'Tiềm năng', color: '#e37400', bg: '#fef7e0', icon: '🔥' },
    { key: 'purchased', label: 'Đã mua', color: '#137333', bg: '#ceead6', icon: '🛒' },
    { key: 'skipped', label: 'Bỏ qua', color: '#5f6368', bg: '#f1f3f4', icon: '⏭️' },
];

const SUGGESTED_LABELS = [
    { name: 'Khách hàng mới', color: '#1a73e8', icon: '🆕' },
    { name: `Hôm nay (${new Date().toLocaleDateString('vi-VN')})`, color: '#e37400', icon: '📅' },
    { name: 'Tiếp nhận', color: '#0d652d', icon: '📋' },
    { name: 'Đã giao', color: '#7c4dff', icon: '📦' },
];

/* ─── Google-style Section ─── */
const Section: React.FC<{
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
    count?: number | string;
    children: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, count, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ marginBottom: 2 }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '13px 20px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#5f6368',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    transition: 'background 0.15s',
                    borderRadius: 12,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                <span style={{ display: 'flex', color: '#5f6368' }}>{icon}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
                {count !== undefined && (
                    <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: '#1a73e8',
                        background: '#e8f0fe',
                        padding: '1px 8px',
                        borderRadius: 100,
                        lineHeight: '18px',
                    }}>{count}</span>
                )}
                <ChevronDown
                    size={16}
                    color="#9aa0a6"
                    style={{
                        transition: 'transform 0.2s ease',
                        transform: open ? 'rotate(0)' : 'rotate(-90deg)',
                    }}
                />
            </button>
            <div style={{
                overflow: 'hidden',
                maxHeight: open ? 800 : 0,
                transition: 'max-height 0.25s ease',
                padding: open ? '0 20px 12px' : '0 20px 0',
            }}>
                {children}
            </div>
        </div>
    );
};

/* ─── Info Row (Google Contacts style) ─── */
const InfoRow: React.FC<{
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    value: string;
    copyable?: boolean;
    isLink?: boolean;
}> = ({ icon, iconBg, label, value, copyable, isLink }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: '#fff',
        border: '1px solid #e8eaed',
        transition: 'all 0.15s',
        cursor: copyable ? 'pointer' : 'default',
    }}
    onClick={() => {
        if (copyable) {
            navigator.clipboard.writeText(value);
            message.success('Đã sao chép');
        }
    }}
    onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = '#f8f9fa';
        (e.currentTarget as HTMLElement).style.borderColor = '#dadce0';
    }}
    onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = '#fff';
        (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed';
    }}
    >
        <div style={{
            width: 36, height: 36, borderRadius: 10, background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#9aa0a6', fontWeight: 500, letterSpacing: '0.03em', marginBottom: 1 }}>{label}</div>
            {isLink ? (
                <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1a73e8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textDecoration: 'none' }}>{value}</a>
            ) : (
                <div style={{ fontSize: 13, color: '#202124', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
            )}
        </div>
        {copyable && <Copy size={14} color="#9aa0a6" style={{ flexShrink: 0 }} />}
    </div>
);

interface VisitorProfileSidebarProps {
    workspaceId: string;
    visitorId: string | null;
    conversationTags?: string[];
    workspaceTags?: string[];
    workspaceLabels?: Array<{ name: string; color: string }>;
    workspaceMembers?: Array<{ _id: string; name: string; email?: string }>;
    onAddTag?: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
    onAddNote?: (content: string, mentionedUserIds?: string[]) => void;
    conversationMetadata?: any;
    conversationChannel?: string;
    onUpdateMetadata?: (data: { leadStage?: string; isStarred?: boolean }) => void;
    messages?: Array<{
        _id: string;
        content: string;
        createdAt: string;
        attachments?: Array<{ url?: string; data?: string; filename?: string; mimeType?: string }>;
        sender: { type: string; name?: string };
    }>;
}

export const VisitorProfileSidebar: React.FC<VisitorProfileSidebarProps> = ({
    workspaceId, visitorId, conversationTags = [], workspaceTags = [], workspaceLabels = [], workspaceMembers = [],
    onAddTag, onRemoveTag, onAddNote,
    conversationMetadata, conversationChannel, onUpdateMetadata,
    messages = [],
}) => {
    const { data: visitor, isLoading, refetch } = useGetVisitor(workspaceId, visitorId || undefined);
    const { mutate: updateVisitor, isPending: isUpdating } = useUpdateVisitor();

    const [isEditing, setIsEditing] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [showAllMedia, setShowAllMedia] = useState(false);
    const [showAllFiles, setShowAllFiles] = useState(false);
    const [showAllLinks, setShowAllLinks] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        if (visitor && isEditing) {
            form.setFieldsValue({
                name: visitor.name || '', email: visitor.email || '',
                phone: visitor.phone || '', notes: visitor.attributes?.notes || '',
            });
        }
    }, [visitor, isEditing, form]);

    // ── Empty / Loading states (Google style) ──
    if (!visitorId) {
        return (
            <div style={{ width: '100%', height: '100%', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={28} color="#9aa0a6" />
                </div>
                <div style={{ fontSize: 14, color: '#5f6368', fontWeight: 500, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
                    Chọn cuộc hội thoại để xem hồ sơ
                </div>
            </div>
        );
    }
    if (isLoading) {
        return <div style={{ width: '100%', height: '100%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>;
    }
    if (!visitor) {
        return <div style={{ width: '100%', height: '100%', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="Không tìm thấy hồ sơ" /></div>;
    }

    const handleSave = async (values: any) => {
        updateVisitor({ workspaceId, visitorId, data: { name: values.name, email: values.email, phone: values.phone, attributes: { ...visitor.attributes, notes: values.notes } } }, {
            onSuccess: () => { message.success('Đã cập nhật'); setIsEditing(false); refetch(); },
            onError: () => message.error('Lỗi cập nhật'),
        });
    };

    const displayName = visitor.name || visitor.email || `Khách ${visitor.visitorId.slice(0, 8)}`;
    const lastPageUrl = visitor.attributes?.lastPageUrl || visitor.attributes?.pageUrl;
    const notes = visitor.attributes?.notes;
    const locationInfo = visitor.attributes?.location;
    const isStarred = conversationMetadata?.isStarred;

    // ── Media extraction ──
    const IMG_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i;
    const mediaItems = messages.flatMap(m => {
        const results: Array<{ url: string; date: string }> = [];
        m.attachments?.forEach(a => {
            const src = a.url || a.data || '';
            if (a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/') || IMG_RE.test(src))
                results.push({ url: src, date: new Date(m.createdAt).toLocaleDateString('vi-VN') });
        });
        const urlMatches = m.content?.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)[^\s]*/gi) || [];
        urlMatches.forEach(u => results.push({ url: u, date: new Date(m.createdAt).toLocaleDateString('vi-VN') }));
        return results;
    }).reverse();

    const fileItems = messages.flatMap(m =>
        (m.attachments || []).filter(a => a.filename && !a.mimeType?.startsWith('image/') && !a.mimeType?.startsWith('video/')).map(a => ({
            name: a.filename || 'file', url: a.url || a.data || '#', date: new Date(m.createdAt).toLocaleDateString('vi-VN'),
        }))
    ).reverse();

    const URL_RE = /https?:\/\/[^\s<>"']+/gi;
    const IMG_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
    const seen = new Set<string>();
    const linkItems = messages.flatMap(m => {
        URL_RE.lastIndex = 0;
        return (m.content?.match(URL_RE) || []).filter(u => !IMG_EXT.test(u)).map(u => ({
            url: u, domain: (() => { try { return new URL(u).hostname; } catch { return u; } })(),
            date: new Date(m.createdAt).toLocaleDateString('vi-VN'),
            sender: m.sender.name || (m.sender.type === 'agent' ? 'Bạn' : 'Khách'),
        }));
    }).reverse().filter(l => { if (seen.has(l.url)) return false; seen.add(l.url); return true; });

    // ── Google Contacts-style avatar color ──
    const avatarColors = ['#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7c4dff', '#e91e63'];
    const avatarColor = avatarColors[displayName.charCodeAt(0) % avatarColors.length];

    return (
        <div style={{
            width: '100%', height: '100%', background: '#fff',
            display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
            fontFamily: "'Google Sans', 'Segoe UI', Roboto, -apple-system, sans-serif",
        }}>
            <style>{`
                .goog-sidebar::-webkit-scrollbar { width: 4px; }
                .goog-sidebar::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 4px; }
                .goog-sidebar::-webkit-scrollbar-thumb:hover { background: #bdc1c6; }
            `}</style>

            {/* ═══════ PROFILE HEADER ═══════ */}
            <div style={{
                padding: '28px 20px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center',
                borderBottom: '1px solid #e8eaed',
                background: '#fff',
            }}>
                {/* Avatar — Google Contacts style */}
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 34, fontWeight: 400, color: '#fff',
                        fontFamily: "'Google Sans', sans-serif",
                        letterSpacing: '-0.02em',
                    }}>
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    {/* Online indicator */}
                    <div style={{
                        position: 'absolute', bottom: 2, right: 2,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#34a853', border: '2.5px solid #fff',
                    }} />
                </div>

                {/* Name */}
                <h2 style={{
                    margin: 0, fontSize: 22, fontWeight: 400, color: '#202124',
                    fontFamily: "'Google Sans', sans-serif", lineHeight: 1.3,
                    letterSpacing: '-0.01em',
                }}>
                    {displayName}
                </h2>

                {/* Status */}
                <div style={{ fontSize: 12, color: '#5f6368', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34a853' }} />
                    Online · {new Date(visitor.lastSeenAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </div>

                {/* Action buttons — Apple/Google pill style */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            style={{
                                height: 36, padding: '0 20px',
                                borderRadius: 18, border: '1px solid #dadce0',
                                background: '#fff', color: '#1a73e8',
                                fontSize: 13, fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                                fontFamily: "'Google Sans', sans-serif",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.borderColor = '#1a73e8'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#dadce0'; }}
                        >
                            <Edit2 size={14} /> Chỉnh sửa
                        </button>
                    )}
                    <button
                        onClick={() => onUpdateMetadata?.({ isStarred: !isStarred })}
                        style={{
                            height: 36, padding: '0 20px',
                            borderRadius: 18,
                            border: isStarred ? '1px solid #fdd663' : '1px solid #dadce0',
                            background: isStarred ? '#fef7e0' : '#fff',
                            color: isStarred ? '#e37400' : '#5f6368',
                            fontSize: 13, fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.15s',
                            fontFamily: "'Google Sans', sans-serif",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = isStarred ? '#feefc3' : '#f8f9fa'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isStarred ? '#fef7e0' : '#fff'; }}
                    >
                        <Star size={14} fill={isStarred ? '#e37400' : 'none'} /> {isStarred ? 'Quan trọng' : 'Đánh dấu'}
                    </button>
                </div>
            </div>

            {/* ═══════ BODY ═══════ */}
            <div style={{ flex: 1, paddingTop: 4, paddingBottom: 24 }}>

                {isEditing ? (
                    <div style={{ padding: '16px 20px' }}>
                        <Form form={form} layout="vertical" onFinish={handleSave}>
                            <Form.Item name="name" label={<span style={{ fontSize: 12, fontWeight: 500, color: '#5f6368' }}>Tên</span>} style={{ marginBottom: 14 }}>
                                <Input placeholder="Họ tên" prefix={<User size={14} color="#9aa0a6" />} style={{ borderRadius: 8, height: 40 }} />
                            </Form.Item>
                            <Form.Item name="email" label={<span style={{ fontSize: 12, fontWeight: 500, color: '#5f6368' }}>Email</span>} style={{ marginBottom: 14 }}>
                                <Input placeholder="Email" prefix={<Mail size={14} color="#9aa0a6" />} style={{ borderRadius: 8, height: 40 }} />
                            </Form.Item>
                            <Form.Item name="phone" label={<span style={{ fontSize: 12, fontWeight: 500, color: '#5f6368' }}>SĐT</span>} style={{ marginBottom: 14 }}>
                                <Input placeholder="Số điện thoại" prefix={<Phone size={14} color="#9aa0a6" />} style={{ borderRadius: 8, height: 40 }} />
                            </Form.Item>
                            <Form.Item name="notes" label={<span style={{ fontSize: 12, fontWeight: 500, color: '#5f6368' }}>Ghi chú</span>} style={{ marginBottom: 16 }}>
                                <Input.TextArea placeholder="Ghi chú..." rows={3} style={{ borderRadius: 8 }} />
                            </Form.Item>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <Button onClick={() => setIsEditing(false)} style={{ borderRadius: 20, height: 36, fontWeight: 500 }}>Hủy</Button>
                                <Button type="primary" htmlType="submit" loading={isUpdating} style={{ borderRadius: 20, height: 36, fontWeight: 500, background: '#1a73e8' }}>Lưu thay đổi</Button>
                            </div>
                        </Form>
                    </div>
                ) : (
                    <>
                        {/* ── Contact Info ── */}
                        <Section title="Thông tin liên hệ" icon={<User size={15} />}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {visitor.name && <InfoRow icon={<User size={16} color="#1a73e8" />} iconBg="#e8f0fe" label="Tên" value={visitor.name} />}
                                {visitor.email && <InfoRow icon={<Mail size={16} color="#ea4335" />} iconBg="#fce8e6" label="Email" value={visitor.email} copyable />}
                                {visitor.phone && <InfoRow icon={<Phone size={16} color="#34a853" />} iconBg="#e6f4ea" label="Số điện thoại" value={visitor.phone} copyable />}
                                {!visitor.name && !visitor.email && !visitor.phone && (
                                    <div style={{ padding: '20px 16px', textAlign: 'center', background: '#f8f9fa', borderRadius: 12 }}>
                                        <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 10 }}>Chưa có thông tin liên hệ</div>
                                        <button onClick={() => setIsEditing(true)} style={{
                                            padding: '8px 20px', borderRadius: 20, border: '1px solid #dadce0',
                                            background: '#fff', color: '#1a73e8', fontSize: 13, fontWeight: 500,
                                            cursor: 'pointer', fontFamily: "'Google Sans', sans-serif",
                                        }}>+ Thêm thông tin</button>
                                    </div>
                                )}
                            </div>
                        </Section>

                        {/* ── Tags ── */}
                        <Section title="Tags hội thoại" icon={<TagIcon size={15} />} count={conversationTags.length || undefined}>
                            {conversationTags.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                                    {conversationTags.map(t => {
                                        const lb = workspaceLabels.find(l => l.name === t);
                                        return (
                                            <Tag key={t} closable onClose={() => onRemoveTag?.(t)} style={{
                                                borderRadius: 16, margin: 0, fontSize: 12, fontWeight: 500,
                                                padding: '2px 12px', border: 'none',
                                                background: lb ? lb.color + '18' : '#e8f0fe',
                                                color: lb ? lb.color : '#1a73e8',
                                                height: 28, display: 'inline-flex', alignItems: 'center',
                                            }}>
                                                {lb && <span style={{ width: 6, height: 6, borderRadius: '50%', background: lb.color, marginRight: 6, display: 'inline-block' }} />}
                                                {t}
                                            </Tag>
                                        );
                                    })}
                                </div>
                            )}
                            <Select
                                size="small"
                                mode="tags"
                                placeholder="+ Thêm tag..."
                                style={{ width: '100%' }}
                                value={[]}
                                onChange={(vals: string[]) => {
                                    const newTag = vals[vals.length - 1];
                                    if (newTag && !conversationTags.includes(newTag)) onAddTag?.(newTag.trim());
                                }}
                                options={workspaceTags.filter(t => !conversationTags.includes(t)).map(t => ({ label: t, value: t }))}
                                tokenSeparators={[',']}
                            />
                        </Section>

                        {/* ── Zalo/Facebook Source ── */}
                        {(conversationChannel === 'facebook' || conversationChannel === 'zalo') && conversationMetadata?.pageName && (
                            <Section
                                title={conversationChannel === 'facebook' ? 'Trang Facebook' : 'Tài khoản Zalo'}
                                icon={conversationChannel === 'facebook' ? <Facebook size={15} /> : <MessageCircle size={15} />}
                            >
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 12,
                                    background: '#f8f9fa', border: '1px solid #e8eaed',
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: conversationChannel === 'facebook' ? '#1877F2' : '#0068ff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 500, fontSize: 16, flexShrink: 0,
                                    }}>
                                        {conversationMetadata.pageName?.charAt(0) || 'Z'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, fontSize: 13, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {conversationMetadata.pageName}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 2 }}>
                                            {conversationChannel === 'facebook' ? 'Fanpage' : 'Tài khoản Zalo'}
                                        </div>
                                    </div>
                                </div>
                            </Section>
                        )}

                        {/* ── Lead Stage (Material Design chips) ── */}
                        <Section title="Giai đoạn khách hàng" icon={<Target size={15} />}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {LEAD_STAGES.map(s => {
                                    const active = conversationMetadata?.leadStage === s.key;
                                    return (
                                        <button key={s.key}
                                            onClick={() => onUpdateMetadata?.({ leadStage: active ? '' : s.key })}
                                            style={{
                                                height: 32, padding: '0 14px',
                                                borderRadius: 16,
                                                border: active ? `1.5px solid ${s.color}` : '1px solid #dadce0',
                                                background: active ? s.bg : '#fff',
                                                color: active ? s.color : '#3c4043',
                                                fontWeight: active ? 600 : 400,
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                transition: 'all 0.15s',
                                                fontFamily: "'Google Sans', sans-serif",
                                            }}
                                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f8f9fa'; }}
                                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff'; }}
                                        >
                                            <span style={{ fontSize: 14 }}>{s.icon}</span> {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Quick "Tiềm năng" CTA */}
                            <button
                                onClick={() => onUpdateMetadata?.({ leadStage: conversationMetadata?.leadStage === 'potential' ? '' : 'potential' })}
                                style={{
                                    width: '100%', marginTop: 10, height: 40,
                                    borderRadius: 20,
                                    border: conversationMetadata?.leadStage === 'potential' ? '1.5px solid #e37400' : '1px solid #fdd663',
                                    background: conversationMetadata?.leadStage === 'potential' ? '#fef7e0' : '#fff',
                                    color: '#e37400', fontWeight: 500, fontSize: 13,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 0.15s',
                                    fontFamily: "'Google Sans', sans-serif",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fef7e0')}
                                onMouseLeave={e => (e.currentTarget.style.background = conversationMetadata?.leadStage === 'potential' ? '#fef7e0' : '#fff')}
                            >
                                <Sparkles size={15} />
                                {conversationMetadata?.leadStage === 'potential' ? '✓ Khách tiềm năng' : 'Đánh dấu khách tiềm năng'}
                            </button>
                        </Section>

                        {/* ── Suggested Labels ── */}
                        <Section title="Nhãn gợi ý" icon={<Shield size={15} />} defaultOpen={false}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {SUGGESTED_LABELS.map(sl => {
                                    const isApplied = conversationTags.includes(sl.name);
                                    return (
                                        <button key={sl.name}
                                            onClick={() => isApplied ? onRemoveTag?.(sl.name) : onAddTag?.(sl.name)}
                                            style={{
                                                height: 30, padding: '0 12px', borderRadius: 15,
                                                border: `1px solid ${isApplied ? sl.color : '#dadce0'}`,
                                                background: isApplied ? sl.color + '12' : '#fff',
                                                color: isApplied ? sl.color : '#5f6368',
                                                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {sl.icon} {isApplied ? '✓ ' : ''}{sl.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </Section>

                        {/* ── Visitor Notes ── */}
                        {notes && (
                            <Section title="Ghi chú visitor" icon={<StickyNote size={15} />} defaultOpen={false}>
                                <div style={{
                                    padding: '12px 14px', borderRadius: 12,
                                    background: '#fef7e0', border: '1px solid #fdd663',
                                    fontSize: 13, color: '#3c4043', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                }}>{notes}</div>
                            </Section>
                        )}

                        {/* ── Media ── */}
                        <Section title="Ảnh / Video" icon={<Image size={15} />} count={mediaItems.length || undefined} defaultOpen={false}>
                            {mediaItems.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#9aa0a6', textAlign: 'center', padding: '12px 0' }}>Chưa có ảnh/video</div>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                                        {(showAllMedia ? mediaItems : mediaItems.slice(0, 9)).map((item, i) => (
                                            <div key={i} style={{
                                                aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                                                cursor: 'pointer', position: 'relative', background: '#f1f3f4',
                                            }} onClick={() => window.open(item.url, '_blank')}>
                                                <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            </div>
                                        ))}
                                    </div>
                                    {mediaItems.length > 9 && !showAllMedia && (
                                        <button onClick={() => setShowAllMedia(true)} style={{
                                            width: '100%', marginTop: 8, padding: '8px', borderRadius: 20,
                                            border: '1px solid #dadce0', background: '#fff', color: '#1a73e8',
                                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        }}>Xem tất cả {mediaItems.length} ảnh</button>
                                    )}
                                </>
                            )}
                        </Section>

                        {/* ── Files ── */}
                        <Section title="File" icon={<FileText size={15} />} count={fileItems.length || undefined} defaultOpen={false}>
                            {fileItems.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#9aa0a6', textAlign: 'center', padding: '12px 0' }}>Chưa có file</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {(showAllFiles ? fileItems : fileItems.slice(0, 3)).map((f, i) => (
                                        <a key={i} href={f.url} target="_blank" rel="noreferrer" style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 12, textDecoration: 'none',
                                            background: '#fff', border: '1px solid #e8eaed', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                        >
                                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <FileText size={16} color="#1a73e8" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, color: '#202124', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                                                <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 1 }}>{f.date}</div>
                                            </div>
                                        </a>
                                    ))}
                                    {fileItems.length > 3 && !showAllFiles && (
                                        <button onClick={() => setShowAllFiles(true)} style={{
                                            width: '100%', padding: '8px', borderRadius: 20,
                                            border: '1px solid #dadce0', background: '#fff', color: '#1a73e8',
                                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        }}>Xem tất cả {fileItems.length} file</button>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* ── Links ── */}
                        <Section title="Link" icon={<LinkIcon size={15} />} count={linkItems.length || undefined} defaultOpen={false}>
                            {linkItems.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#9aa0a6', textAlign: 'center', padding: '12px 0' }}>Chưa có link</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {(showAllLinks ? linkItems : linkItems.slice(0, 3)).map((l, i) => (
                                        <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 12, textDecoration: 'none',
                                            background: '#fff', border: '1px solid #e8eaed', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                        >
                                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3e8fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Globe size={16} color="#7c4dff" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, color: '#1a73e8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.domain}</div>
                                                <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 1 }}>{l.sender} · {l.date}</div>
                                            </div>
                                        </a>
                                    ))}
                                    {linkItems.length > 3 && !showAllLinks && (
                                        <button onClick={() => setShowAllLinks(true)} style={{
                                            width: '100%', padding: '8px', borderRadius: 20,
                                            border: '1px solid #dadce0', background: '#fff', color: '#1a73e8',
                                            fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        }}>Xem tất cả {linkItems.length} link</button>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* ── Internal Notes ── */}
                        <Section title="Ghi chú nội bộ" icon={<StickyNote size={15} />}>
                            <div style={{
                                background: '#fff', border: '1px solid #e8eaed',
                                borderRadius: 12, padding: 12,
                            }}>
                                <Mentions
                                    rows={2}
                                    placeholder="Viết ghi chú (@ để tag)..."
                                    value={noteText}
                                    onChange={setNoteText}
                                    style={{ border: 'none', background: '#fff', boxShadow: 'none', fontSize: 13, width: '100%' }}
                                    onPressEnter={e => {
                                        if (!e.shiftKey) {
                                            e.preventDefault();
                                            if (noteText.trim()) {
                                                const ids = workspaceMembers.filter(m => noteText.includes(`@${m.name.replace(/\s+/g, '')}`)).map(m => m._id);
                                                onAddNote?.(noteText.trim(), ids);
                                                setNoteText('');
                                            }
                                        }
                                    }}
                                    options={workspaceMembers.map(m => ({ value: m.name.replace(/\s+/g, ''), label: m.name, key: m._id }))}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid #f1f3f4', paddingTop: 8 }}>
                                    <button
                                        disabled={!noteText.trim()}
                                        onClick={() => {
                                            if (noteText.trim()) {
                                                const ids = workspaceMembers.filter(m => noteText.includes(`@${m.name.replace(/\s+/g, '')}`)).map(m => m._id);
                                                onAddNote?.(noteText.trim(), ids);
                                                setNoteText('');
                                            }
                                        }}
                                        style={{
                                            height: 32, padding: '0 20px', borderRadius: 16,
                                            border: 'none',
                                            background: noteText.trim() ? '#1a73e8' : '#e8eaed',
                                            color: noteText.trim() ? '#fff' : '#9aa0a6',
                                            fontSize: 12, fontWeight: 500, cursor: noteText.trim() ? 'pointer' : 'default',
                                            fontFamily: "'Google Sans', sans-serif",
                                            transition: 'all 0.15s',
                                        }}
                                    >Gửi ghi chú</button>
                                </div>
                            </div>
                        </Section>

                        {/* ── System Info ── */}
                        <Section title="Thông tin hệ thống" icon={<MonitorSmartphone size={15} />} defaultOpen={false}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {lastPageUrl && <InfoRow icon={<Globe size={16} color="#34a853" />} iconBg="#e6f4ea" label="Trang hiện tại" value={lastPageUrl} isLink />}
                                {locationInfo && <InfoRow icon={<MapPin size={16} color="#ea4335" />} iconBg="#fce8e6" label="Vị trí" value={`${locationInfo.city || ''}, ${locationInfo.country || ''}`} />}
                                <InfoRow icon={<MessageCircle size={16} color="#7c4dff" />} iconBg="#f3e8fd" label="Tổng hội thoại" value={String(visitor.totalConversations || 0)} />
                                <InfoRow icon={<Hash size={16} color="#5f6368" />} iconBg="#f1f3f4" label="Visitor ID" value={visitor.visitorId.slice(0, 16) + '...'} copyable />
                                <InfoRow icon={<Clock size={16} color="#e37400" />} iconBg="#fef7e0" label="Lần đầu truy cập" value={new Date(visitor.firstSeenAt).toLocaleDateString('vi-VN')} />
                            </div>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
};
