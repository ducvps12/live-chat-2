import React, { useState, useEffect } from 'react';
import { Spin, Button, Form, Input, Divider, Typography, Empty, message, Tag, Select, Mentions } from 'antd';
import { Edit2, ExternalLink, Mail, Phone, User, MonitorSmartphone, MapPin, Tag as TagIcon, StickyNote, Star, Target, Facebook, Image, FileText, Link as LinkIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useGetVisitor, useUpdateVisitor } from '../hooks/useVisitor';

const { Text, Title } = Typography;

const LEAD_STAGES = [
    { key: 'intake', label: 'Intake', color: '#94a3b8', bg: '#f1f5f9' },
    { key: 'qualified', label: 'Qualified', color: '#3b82f6', bg: '#eff6ff' },
    { key: 'potential', label: 'Tiềm năng', color: '#f59e0b', bg: '#fffbeb' },
    { key: 'purchased', label: 'Đã mua', color: '#10b981', bg: '#ecfdf5' },
    { key: 'skipped', label: 'Bỏ qua', color: '#6b7280', bg: '#f9fafb' },
];

const SUGGESTED_LABELS = [
    { name: 'Khách hàng mới', color: '#3b82f6' },
    { name: `Ngày hôm nay (${new Date().toLocaleDateString('vi-VN')})`, color: '#f59e0b' },
    { name: 'Tiếp nhận', color: '#10b981' },
    { name: 'Đã giao', color: '#8b5cf6' },
];

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
    // Meta Business Suite features
    conversationMetadata?: any;
    conversationChannel?: string;
    onUpdateMetadata?: (data: { leadStage?: string; isStarred?: boolean }) => void;
    // Chat messages for media extraction
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
    const [expandMedia, setExpandMedia] = useState(false);
    const [expandFiles, setExpandFiles] = useState(false);
    const [expandLinks, setExpandLinks] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        if (visitor && isEditing) {
            form.setFieldsValue({
                name: visitor.name || '',
                email: visitor.email || '',
                phone: visitor.phone || '',
                notes: visitor.attributes?.notes || '',
                tags: visitor.attributes?.tags || [],
            });
        }
    }, [visitor, isEditing, form]);

    if (!visitorId) {
        return (
            <div style={styles.emptyContainer}>
                <Empty description="Chọn cuộc hội thoại để xem hồ sơ" />
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={styles.loadingContainer}>
                <Spin />
            </div>
        );
    }

    if (!visitor) {
        return (
            <div style={styles.emptyContainer}>
                <Empty description="Không tìm thấy hồ sơ visitor" />
            </div>
        );
    }

    const handleSave = async (values: any) => {
        updateVisitor(
            {
                workspaceId,
                visitorId,
                data: {
                    name: values.name,
                    email: values.email,
                    phone: values.phone,
                    attributes: {
                        ...visitor.attributes,
                        notes: values.notes,
                        tags: values.tags,
                    },
                },
            },
            {
                onSuccess: () => {
                    message.success('Đã cập nhật hồ sơ visitor');
                    setIsEditing(false);
                    refetch();
                },
                onError: () => {
                    message.error('Lỗi khi cập nhật hồ sơ');
                },
            }
        );
    };

    const hasContactInfo = visitor.email || visitor.phone;

    // Attributes derived values
    const lastPageUrl = visitor.attributes?.lastPageUrl || visitor.attributes?.pageUrl;
    const notes = visitor.attributes?.notes;
    const locationInfo = visitor.attributes?.location;
    const tags = visitor.attributes?.tags || [];

    return (
        <div style={styles.container}>
            {/* Header section */}
            <div style={styles.header}>
                <div style={styles.avatarLarge}>
                    <User size={32} color="#fff" />
                </div>
                <Title level={5} style={{ margin: '12px 0 4px', fontSize: 16 }}>
                    {visitor.name || visitor.email || `Khách ${visitor.visitorId.slice(0, 8)}`}
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                    Online {new Date(visitor.lastSeenAt).toLocaleString('vi-VN')}
                </Text>

                {!isEditing && (
                    <Button
                        size="small"
                        icon={<Edit2 size={14} />}
                        onClick={() => setIsEditing(true)}
                        style={{ marginTop: 16, borderRadius: 16 }}
                    >
                        Chỉnh sửa
                    </Button>
                )}
            </div>

            <Divider style={{ margin: '0' }} />

            {/* Content Body */}
            <div style={styles.body}>
                {isEditing ? (
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <Form.Item name="name" label="Tên">
                            <Input placeholder="Nhập họ tên" prefix={<User size={14} color="#aaa" />} />
                        </Form.Item>
                        <Form.Item name="email" label="Email">
                            <Input placeholder="Nhập email" prefix={<Mail size={14} color="#aaa" />} />
                        </Form.Item>
                        <Form.Item name="phone" label="Số điện thoại">
                            <Input placeholder="Nhập số điện thoại" prefix={<Phone size={14} color="#aaa" />} />
                        </Form.Item>
                        <Form.Item name="tags" label="Thẻ (Tags)">
                            <Select mode="tags" style={{ width: '100%' }} placeholder="Thêm thẻ, nhấn enter" />
                        </Form.Item>
                        <Form.Item name="notes" label="Ghi chú">
                            <Input.TextArea placeholder="Ghi chú nội bộ về khách hàng này..." rows={4} />
                        </Form.Item>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
                            <Button onClick={() => setIsEditing(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit" loading={isUpdating}>
                                Lưu
                            </Button>
                        </div>
                    </Form>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Contact Info */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>Thông tin liên hệ</Title>
                            {!hasContactInfo && !visitor.name ? (
                                <Text type="secondary" style={{ fontSize: 13, fontStyle: 'italic' }}>Chưa có thông tin</Text>
                            ) : (
                                <div style={styles.infoList}>
                                    {visitor.name && (
                                        <div style={styles.infoRow}>
                                            <User size={14} style={styles.infoIcon} />
                                            <Text>{visitor.name}</Text>
                                        </div>
                                    )}
                                    {visitor.email && (
                                        <div style={styles.infoRow}>
                                            <Mail size={14} style={styles.infoIcon} />
                                            <Text copyable={{ text: visitor.email }}>{visitor.email}</Text>
                                        </div>
                                    )}
                                    {visitor.phone && (
                                        <div style={styles.infoRow}>
                                            <Phone size={14} style={styles.infoIcon} />
                                            <Text copyable={{ text: visitor.phone }}>{visitor.phone}</Text>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {notes && (
                            <div style={styles.section}>
                                <Title level={5} style={styles.sectionTitle}>Ghi chú visitor</Title>
                                <div style={styles.noteBox}>
                                    <Text style={{ fontSize: 13 }}>{notes}</Text>
                                </div>
                            </div>
                        )}

                        {/* ── Conversation Tags ── */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>
                                <TagIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Tags hội thoại
                            </Title>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {conversationTags.map(t => {
                                    const lb = workspaceLabels.find(l => l.name === t);
                                    return (
                                        <Tag
                                            key={t}
                                            closable
                                            color={lb ? undefined : 'blue'}
                                            onClose={() => onRemoveTag?.(t)}
                                            style={{
                                                borderRadius: 8, margin: 0,
                                                ...(lb ? {
                                                    background: lb.color + '18',
                                                    color: lb.color,
                                                    border: `1px solid ${lb.color}40`,
                                                } : {}),
                                            }}
                                        >
                                            {lb && <span style={{ width: 8, height: 8, borderRadius: '50%', background: lb.color, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />}
                                            {t}
                                        </Tag>
                                    );
                                })}
                            </div>
                            <Select
                                size="small"
                                mode="tags"
                                placeholder="+ Nhập tag mới hoặc chọn..."
                                style={{ width: '100%' }}
                                value={[]}
                                onChange={(vals: string[]) => {
                                    // Only add the last typed/selected value
                                    const newTag = vals[vals.length - 1];
                                    if (newTag && !conversationTags.includes(newTag)) {
                                        onAddTag?.(newTag.trim());
                                    }
                                }}
                                options={workspaceTags
                                    .filter(t => !conversationTags.includes(t))
                                    .map(t => ({ label: t, value: t }))}
                                popupMatchSelectWidth={true}
                                allowClear={false}
                                tokenSeparators={[',']}
                            />
                        </div>

                        {/* ── Facebook Page Info ── */}
                        {conversationChannel === 'facebook' && conversationMetadata?.pageName && (
                            <div style={styles.section}>
                                <Title level={5} style={styles.sectionTitle}>
                                    <Facebook size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: '#1877F2' }} />
                                    Trang cá nhân trên Facebook
                                </Title>
                                <div style={{ padding: '10px 12px', background: '#f0f7ff', borderRadius: 10, border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                                        {conversationMetadata.pageName?.charAt(0) || 'F'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1e3a5f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {conversationMetadata.pageName}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>Fanpage gốc</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Lead Stages (Giai đoạn KH tiềm năng) ── */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>
                                <Target size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Giai đoạn khách hàng tiềm năng
                            </Title>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {LEAD_STAGES.map(stage => {
                                    const isActive = conversationMetadata?.leadStage === stage.key;
                                    return (
                                        <button
                                            key={stage.key}
                                            onClick={() => onUpdateMetadata?.({ leadStage: isActive ? '' : stage.key })}
                                            style={{
                                                padding: '4px 12px',
                                                borderRadius: 14,
                                                border: `1.5px solid ${isActive ? stage.color : '#e2e8f0'}`,
                                                background: isActive ? stage.bg : '#fff',
                                                color: isActive ? stage.color : '#94a3b8',
                                                fontWeight: isActive ? 600 : 500,
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                        >
                                            {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color }} />}
                                            {stage.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => onUpdateMetadata?.({ leadStage: 'potential' })}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '1.5px solid #fde68a',
                                    background: conversationMetadata?.leadStage === 'potential' ? '#fffbeb' : '#fff',
                                    color: '#92400e',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                }}
                            >
                                <Star size={13} fill={conversationMetadata?.leadStage === 'potential' ? '#f59e0b' : 'none'} color="#f59e0b" />
                                Đánh dấu là khách hàng tiềm năng
                            </button>
                        </div>

                        {/* ── Suggested Labels (Nhãn gợi ý) ── */}
                        <div style={styles.section}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Title level={5} style={{ ...styles.sectionTitle, marginBottom: 0 }}>Nhãn gợi ý</Title>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {SUGGESTED_LABELS.map(sl => {
                                    const isApplied = conversationTags.includes(sl.name);
                                    return (
                                        <button
                                            key={sl.name}
                                            onClick={() => {
                                                if (isApplied) {
                                                    onRemoveTag?.(sl.name);
                                                } else {
                                                    onAddTag?.(sl.name);
                                                }
                                            }}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: 14,
                                                border: `1.5px solid ${isApplied ? sl.color : sl.color + '40'}`,
                                                background: isApplied ? sl.color + '15' : '#fff',
                                                color: isApplied ? sl.color : '#64748b',
                                                fontWeight: 500,
                                                fontSize: 11,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                        >
                                            {isApplied ? '✓' : '○'} {sl.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Star / Bookmark ── */}
                        <div style={styles.section}>
                            <button
                                onClick={() => onUpdateMetadata?.({ isStarred: !conversationMetadata?.isStarred })}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: `1.5px solid ${conversationMetadata?.isStarred ? '#fbbf24' : '#e2e8f0'}`,
                                    background: conversationMetadata?.isStarred ? '#fffbeb' : '#fff',
                                    color: conversationMetadata?.isStarred ? '#92400e' : '#64748b',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                }}
                            >
                                <Star size={14} fill={conversationMetadata?.isStarred ? '#fbbf24' : 'none'} color={conversationMetadata?.isStarred ? '#fbbf24' : '#94a3b8'} />
                                {conversationMetadata?.isStarred ? 'Đã đánh dấu quan trọng' : 'Đánh dấu quan trọng'}
                            </button>
                        </div>

                        {/* ── Ảnh/Video ── */}
                        {(() => {
                            const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i;
                            const mediaItems = messages
                                .filter(m => {
                                    if (m.attachments?.some(a => a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/') || IMAGE_REGEX.test(a.url || a.data || ''))) return true;
                                    if (m.content && /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i.test(m.content)) return true;
                                    return false;
                                })
                                .flatMap(m => {
                                    const results: Array<{ url: string; date: string }> = [];
                                    m.attachments?.forEach(a => {
                                        const src = a.url || a.data || '';
                                        if (a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/') || IMAGE_REGEX.test(src)) {
                                            results.push({ url: src, date: new Date(m.createdAt).toLocaleDateString('vi-VN') });
                                        }
                                    });
                                    const urlMatches = m.content?.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)[^\s]*/gi) || [];
                                    urlMatches.forEach(u => results.push({ url: u, date: new Date(m.createdAt).toLocaleDateString('vi-VN') }));
                                    return results;
                                })
                                .reverse();
                            const showMedia = expandMedia ? mediaItems : mediaItems.slice(0, 6);
                            return (
                                <div style={styles.section}>
                                    <div onClick={() => setExpandMedia(!expandMedia)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
                                        <Title level={5} style={{ ...styles.sectionTitle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Image size={14} /> Ảnh/Video
                                            {mediaItems.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>({mediaItems.length})</span>}
                                        </Title>
                                        {mediaItems.length > 0 && (
                                            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>Xem tất cả</span>
                                        )}
                                    </div>
                                    {mediaItems.length === 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>Chưa có ảnh/video</Text>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {showMedia.map((item, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        width: 72, height: 72, borderRadius: 8,
                                                        overflow: 'hidden', cursor: 'pointer',
                                                        background: '#f3f4f6', flexShrink: 0,
                                                    }}
                                                    onClick={() => window.open(item.url, '_blank')}
                                                >
                                                    <img
                                                        src={item.url}
                                                        alt=""
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ── File ── */}
                        {(() => {
                            const fileItems = messages
                                .filter(m => m.attachments?.some(a => a.filename && !a.mimeType?.startsWith('image/') && !a.mimeType?.startsWith('video/')))
                                .flatMap(m =>
                                    (m.attachments || []).filter(a => a.filename && !a.mimeType?.startsWith('image/') && !a.mimeType?.startsWith('video/')).map(a => ({
                                        name: a.filename || 'file',
                                        url: a.url || a.data || '#',
                                        size: '',
                                        date: new Date(m.createdAt).toLocaleDateString('vi-VN'),
                                    }))
                                )
                                .reverse();
                            const showFiles = expandFiles ? fileItems : fileItems.slice(0, 3);
                            return (
                                <div style={styles.section}>
                                    <div onClick={() => setExpandFiles(!expandFiles)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
                                        <Title level={5} style={{ ...styles.sectionTitle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <FileText size={14} /> File
                                            {fileItems.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>({fileItems.length})</span>}
                                        </Title>
                                        {fileItems.length > 0 && (
                                            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>Xem tất cả</span>
                                        )}
                                    </div>
                                    {fileItems.length === 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>Chưa có file</Text>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {showFiles.map((f, i) => (
                                                <a
                                                    key={i}
                                                    href={f.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 8px', borderRadius: 8,
                                                        background: '#f9fafb', textDecoration: 'none',
                                                        border: '1px solid #f0f0f0', transition: 'background 0.15s',
                                                    }}
                                                >
                                                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <FileText size={16} color="#3b82f6" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{f.date}</div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ── Link ── */}
                        {(() => {
                            const URL_RE = /https?:\/\/[^\s<>"']+/gi;
                            const IMG_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
                            const linkItems = messages
                                .filter(m => m.content && URL_RE.test(m.content))
                                .flatMap(m => {
                                    URL_RE.lastIndex = 0;
                                    const urls = m.content.match(URL_RE) || [];
                                    return urls
                                        .filter(u => !IMG_EXT.test(u))
                                        .map(u => ({
                                            url: u,
                                            domain: (() => { try { return new URL(u).hostname; } catch { return u; } })(),
                                            date: new Date(m.createdAt).toLocaleDateString('vi-VN'),
                                            sender: m.sender.name || (m.sender.type === 'agent' ? 'Bạn' : 'Khách'),
                                        }));
                                })
                                .reverse();
                            // Deduplicate by URL
                            const seen = new Set<string>();
                            const uniqueLinks = linkItems.filter(l => {
                                if (seen.has(l.url)) return false;
                                seen.add(l.url);
                                return true;
                            });
                            const showLinks = expandLinks ? uniqueLinks : uniqueLinks.slice(0, 3);
                            return (
                                <div style={styles.section}>
                                    <div onClick={() => setExpandLinks(!expandLinks)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
                                        <Title level={5} style={{ ...styles.sectionTitle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <LinkIcon size={14} /> Link
                                            {uniqueLinks.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>({uniqueLinks.length})</span>}
                                        </Title>
                                        {uniqueLinks.length > 0 && (
                                            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>Xem tất cả</span>
                                        )}
                                    </div>
                                    {uniqueLinks.length === 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>Chưa có link</Text>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {showLinks.map((l, i) => (
                                                <a
                                                    key={i}
                                                    href={l.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 8px', borderRadius: 8,
                                                        background: '#f9fafb', textDecoration: 'none',
                                                        border: '1px solid #f0f0f0', transition: 'background 0.15s',
                                                    }}
                                                >
                                                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <LinkIcon size={16} color="#6366f1" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>
                                                        <div style={{ fontSize: 10, color: '#6366f1' }}>{l.domain} · {l.sender}</div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ── Internal Note ── */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>
                                <StickyNote size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Ghi chú nội bộ
                            </Title>
                            <div style={{
                                background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10,
                                padding: 12,
                            }}>
                                <Mentions
                                    rows={2}
                                    placeholder="Viết ghi chú nội bộ (thêm @ để tag đồng nghiệp)..."
                                    value={noteText}
                                    onChange={setNoteText}
                                    style={{ borderColor: '#fde68a', background: 'rgba(255,255,255,0.6)', marginBottom: 8, width: '100%', borderRadius: 8 }}
                                    onPressEnter={e => {
                                        if (!e.shiftKey) {
                                            e.preventDefault();
                                            if (noteText.trim()) {
                                                const mentionedIds = workspaceMembers
                                                    .filter(m => noteText.includes(`@${m.name.replace(/\s+/g, '')}`))
                                                    .map(m => m._id);
                                                onAddNote?.(noteText.trim(), mentionedIds);
                                                setNoteText('');
                                            }
                                        }
                                    }}
                                    options={workspaceMembers.map(m => ({
                                        value: m.name.replace(/\s+/g, ''), // Mentions defaults to no-space values
                                        label: m.name,
                                        key: m._id,
                                        'data-id': m._id
                                    }))}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        size="small"
                                        type="primary"
                                        style={{ background: '#d97706', borderColor: '#d97706', borderRadius: 8, fontWeight: 500 }}
                                        disabled={!noteText.trim()}
                                        onClick={() => {
                                            if (noteText.trim()) {
                                                const mentionedIds = workspaceMembers
                                                    .filter(m => noteText.includes(`@${m.name.replace(/\s+/g, '')}`))
                                                    .map(m => m._id);
                                                onAddNote?.(noteText.trim(), mentionedIds);
                                                setNoteText('');
                                            }
                                        }}
                                    >
                                        📝 Gửi ghi chú
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Context / Meta Attributes */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>Bối cảnh (Context)</Title>

                            <div style={styles.infoList}>
                                {lastPageUrl && (
                                    <div style={{ ...styles.infoRow, alignItems: 'flex-start' }}>
                                        <MonitorSmartphone size={14} style={{ ...styles.infoIcon, marginTop: 4 }} />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <Text style={{ fontSize: 12, display: 'block', color: '#888' }}>Trang hiện tại</Text>
                                            <a href={lastPageUrl} target="_blank" rel="noreferrer" style={styles.truncateLink}>
                                                {lastPageUrl} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {locationInfo && (
                                    <div style={{ ...styles.infoRow, alignItems: 'flex-start' }}>
                                        <MapPin size={14} style={{ ...styles.infoIcon, marginTop: 4 }} />
                                        <div style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 12, display: 'block', color: '#888' }}>Vị trí</Text>
                                            <Text style={{ fontSize: 13 }}>{locationInfo.city}, {locationInfo.country}</Text>
                                        </div>
                                    </div>
                                )}

                                <div style={{ ...styles.infoRow, alignItems: 'flex-start' }}>
                                    <TagIcon size={14} style={{ ...styles.infoIcon, marginTop: 4 }} />
                                    <div style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 12, display: 'block', color: '#888' }}>Tổng lần trò chuyện</Text>
                                        <Text style={{ fontSize: 13, fontWeight: 500 }}>{visitor.totalConversations}</Text>
                                    </div>
                                </div>
                            </div>

                            {/* Tags */}
                            {tags && tags.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    {tags.map((t: string) => (
                                        <Tag key={t} color="blue" style={{ marginBottom: 4 }}>{t}</Tag>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Technical Information */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>Thông tin hệ thống</Title>
                            <div style={styles.infoList}>
                                <div style={styles.infoRow}>
                                    <Text type="secondary" style={styles.metaLabel}>ID Khách</Text>
                                    <Text type="secondary" style={styles.metaValue} copyable={{ text: visitor.visitorId }}>
                                        {visitor.visitorId.slice(0, 10)}...
                                    </Text>
                                </div>
                                <div style={styles.infoRow}>
                                    <Text type="secondary" style={styles.metaLabel}>Tham gia lúc</Text>
                                    <Text type="secondary" style={styles.metaValue}>{new Date(visitor.firstSeenAt).toLocaleDateString('vi-VN')}</Text>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        width: '100%',
        height: '100%',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
    },
    emptyContainer: {
        width: '100%',
        height: '100%',
        background: '#fafafa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    loadingContainer: {
        width: '100%',
        height: '100%',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    header: {
        padding: '28px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        background: 'linear-gradient(180deg, #f0f1ff 0%, #ffffff 100%)',
    },
    avatarLarge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        background: '#6366f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
    },
    body: {
        padding: '16px 18px',
        flex: 1,
    },
    section: {
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        marginBottom: 10,
        letterSpacing: '0.01em',
    },
    infoList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    infoRow: {
        display: 'flex',
        alignItems: 'center',
        fontSize: 13,
        color: '#333',
    },
    infoIcon: {
        color: '#888',
        marginRight: 12,
        flexShrink: 0,
    },
    truncateLink: {
        display: 'block',
        color: '#6366f1',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
    },
    metaLabel: {
        fontSize: 12,
        flex: 1,
    },
    metaValue: {
        fontSize: 12,
        textAlign: 'right',
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    noteBox: {
        background: '#fcfcfc',
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: 12,
        whiteSpace: 'pre-wrap',
    }
};
