import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Spin, Typography, Tag, Empty, Tooltip, message, Input, Divider } from 'antd';
import {
    Phone, Mail, User, MessageSquare, Edit2, Copy, ExternalLink,
    Calendar, MapPin, Globe, Users, Image as ImageIcon, Shield, Clock,
    Tag as TagIcon, X, Check, UserPlus, BarChart3
} from 'lucide-react';
import { httpClient } from '../../../lib/http/client';

const { Text, Title } = Typography;

interface ContactProfileModalProps {
    open: boolean;
    onClose: () => void;
    workspaceId: string;
    conversation: any; // Conversation object
    onSendMessage?: () => void;
}

interface VisitorProfile {
    _id?: string;
    visitorId: string;
    name?: string;
    email?: string;
    phone?: string;
    firstSeenAt?: string;
    lastSeenAt?: string;
    totalConversations?: number;
    attributes?: Record<string, any>;
}

interface ConvImage {
    url: string;
    timestamp: string;
}

export default function ContactProfileModal({
    open, onClose, workspaceId, conversation, onSendMessage
}: ContactProfileModalProps) {
    const [visitor, setVisitor] = useState<VisitorProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [images, setImages] = useState<ConvImage[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [saving, setSaving] = useState(false);

    const visitorId = conversation?.visitorId;
    const visitorInfo = conversation?.visitorInfo;
    const channel = (conversation as any)?.channel || 'widget';
    const metadata = conversation?.metadata;

    const displayName = visitorInfo?.name || visitorInfo?.email || visitorId?.slice(0, 10) || 'Khách';

    // Fetch full visitor profile
    const fetchProfile = useCallback(async () => {
        if (!workspaceId || !visitorId) return;
        setLoading(true);
        try {
            const res = await httpClient.get(`/visitors/workspace/${workspaceId}/${visitorId}`);
            if (res.data?.success) {
                setVisitor(res.data.data);
            }
        } catch { /* visitor may not exist as a separate document */ }
        finally { setLoading(false); }
    }, [workspaceId, visitorId]);

    // Fetch shared images from conversation messages
    const fetchImages = useCallback(async () => {
        if (!workspaceId || !conversation?._id) return;
        setLoadingImages(true);
        try {
            const res = await httpClient.get(`/conversations/workspace/${workspaceId}/${conversation._id}/messages`, {
                params: { page: 1, limit: 100 }
            });
            if (res.data?.success) {
                const msgs = res.data.data.items || [];
                const imgUrls: ConvImage[] = [];
                for (const msg of msgs) {
                    const content = msg.content || '';
                    // Extract image URLs
                    const urlMatches = content.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi) || [];
                    for (const url of urlMatches) {
                        if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /photo-stal[\w-]*\.zdn\.vn\//i.test(url)) {
                            imgUrls.push({ url, timestamp: msg.createdAt });
                        }
                    }
                    // Check for explicit image type
                    if (msg.type === 'image' && msg.fileUrl) {
                        imgUrls.push({ url: msg.fileUrl, timestamp: msg.createdAt });
                    }
                }
                setImages(imgUrls.slice(0, 12));
            }
        } catch { /* silent */ }
        finally { setLoadingImages(false); }
    }, [workspaceId, conversation?._id]);

    useEffect(() => {
        if (open) {
            fetchProfile();
            fetchImages();
        } else {
            setVisitor(null);
            setImages([]);
            setEditing(false);
        }
    }, [open, fetchProfile, fetchImages]);

    const handleSave = async () => {
        if (!visitorId) return;
        setSaving(true);
        try {
            await httpClient.patch(`/visitors/workspace/${workspaceId}/${visitorId}`, {
                name: editName || undefined,
                email: editEmail || undefined,
                phone: editPhone || undefined,
            });
            message.success('Đã cập nhật thông tin');
            setEditing(false);
            fetchProfile();
        } catch {
            message.error('Lỗi khi cập nhật');
        }
        finally { setSaving(false); }
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        message.success(`Đã sao chép ${label}`);
    };

    const channelLabel = channel === 'zalo' ? '💬 Zalo' : channel === 'facebook' ? '📘 Facebook' : '🌐 Website';
    const channelColor = channel === 'zalo' ? '#0068ff' : channel === 'facebook' ? '#1877f2' : '#6366f1';

    const avatarUrl = visitorInfo?.avatar;
    const initial = displayName.charAt(0).toUpperCase();
    const hue = (displayName.charCodeAt(0) * 37) % 360;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={420}
            centered
            styles={{
                body: { padding: 0 },
            }}
            className="contact-profile-modal"
            closable={false}
        >
            {loading ? (
                <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
            ) : (
                <>
                    {/* ── Cover + Avatar Header ── */}
                    <div style={{
                        position: 'relative',
                        height: 120,
                        background: `linear-gradient(135deg, hsl(${hue}, 60%, 50%) 0%, hsl(${(hue + 40) % 360}, 55%, 45%) 100%)`,
                        overflow: 'hidden',
                    }}>
                        {/* Pattern overlay */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 40%)',
                        }} />
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            style={{
                                position: 'absolute', top: 12, right: 12,
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.3)', border: 'none',
                                color: '#fff', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Avatar overlapping cover */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        marginTop: -44, position: 'relative', zIndex: 2,
                    }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: 24,
                            border: '4px solid #fff',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                            overflow: 'hidden',
                            background: avatarUrl ? '#fff' : `hsl(${hue}, 55%, 55%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                                <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{initial}</span>
                            )}
                        </div>

                        {/* Name + Edit */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                            {editing ? (
                                <Input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Tên"
                                    style={{ width: 200, textAlign: 'center', fontWeight: 600, fontSize: 16 }}
                                    autoFocus
                                />
                            ) : (
                                <Title level={4} style={{ margin: 0, fontSize: 18 }}>{displayName}</Title>
                            )}
                            {!editing && (
                                <Tooltip title="Chỉnh sửa">
                                    <button
                                        onClick={() => {
                                            setEditing(true);
                                            setEditName(visitor?.name || visitorInfo?.name || '');
                                            setEditPhone(visitor?.phone || visitorInfo?.phone || '');
                                            setEditEmail(visitor?.email || visitorInfo?.email || '');
                                        }}
                                        style={{
                                            border: 'none', background: 'none', cursor: 'pointer',
                                            color: '#9ca3af', padding: 4,
                                        }}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                </Tooltip>
                            )}
                        </div>

                        {/* Channel badge */}
                        <Tag color={channelColor} style={{ marginTop: 6, borderRadius: 12, fontSize: 12 }}>
                            {channelLabel}
                        </Tag>
                    </div>

                    {/* ── Action Buttons ── */}
                    <div style={{
                        display: 'flex', gap: 12, justifyContent: 'center',
                        padding: '16px 20px 12px',
                    }}>
                        <button
                            onClick={() => { onClose(); onSendMessage?.(); }}
                            style={{
                                flex: 1, maxWidth: 160, height: 40,
                                borderRadius: 10, border: '1px solid #e5e7eb',
                                background: '#fff', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                fontWeight: 600, fontSize: 13, color: '#374151',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                            <MessageSquare size={16} color={channelColor} />
                            Nhắn tin
                        </button>
                        {(visitor?.phone || visitorInfo?.phone) && (
                            <button
                                onClick={() => window.open(`tel:${visitor?.phone || visitorInfo?.phone}`)}
                                style={{
                                    flex: 1, maxWidth: 160, height: 40,
                                    borderRadius: 10, border: '1px solid #e5e7eb',
                                    background: '#fff', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    fontWeight: 600, fontSize: 13, color: '#374151',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                            >
                                <Phone size={16} color="#10b981" />
                                Gọi điện
                            </button>
                        )}
                    </div>

                    <Divider style={{ margin: '0 20px' }} />

                    {/* ── Personal Info ── */}
                    <div style={{ padding: '16px 24px' }}>
                        <Text strong style={{ fontSize: 13, color: '#374151', marginBottom: 12, display: 'block' }}>
                            Thông tin cá nhân
                        </Text>

                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Mail size={14} color="#9ca3af" />
                                    <Input
                                        value={editEmail}
                                        onChange={e => setEditEmail(e.target.value)}
                                        placeholder="Email"
                                        size="small"
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Phone size={14} color="#9ca3af" />
                                    <Input
                                        value={editPhone}
                                        onChange={e => setEditPhone(e.target.value)}
                                        placeholder="Số điện thoại"
                                        size="small"
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                                    <Button size="small" onClick={() => setEditing(false)}>Hủy</Button>
                                    <Button size="small" type="primary" loading={saving} onClick={handleSave}
                                        style={{ background: '#6366f1', borderColor: '#6366f1' }}>
                                        <Check size={12} /> Lưu
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {/* Email */}
                                <InfoRow
                                    icon={<Mail size={14} />}
                                    label="Email"
                                    value={visitor?.email || visitorInfo?.email}
                                    onCopy={handleCopy}
                                />
                                {/* Phone */}
                                <InfoRow
                                    icon={<Phone size={14} />}
                                    label="Điện thoại"
                                    value={visitor?.phone || visitorInfo?.phone}
                                    onCopy={handleCopy}
                                />
                                {/* Channel */}
                                <InfoRow
                                    icon={<Globe size={14} />}
                                    label="Kênh"
                                    value={channelLabel}
                                />
                                {/* First seen */}
                                <InfoRow
                                    icon={<Calendar size={14} />}
                                    label="Tham gia"
                                    value={visitor?.firstSeenAt ? new Date(visitor.firstSeenAt).toLocaleDateString('vi-VN') : (conversation?.createdAt ? new Date(conversation.createdAt).toLocaleDateString('vi-VN') : undefined)}
                                />
                                {/* Total conversations */}
                                <InfoRow
                                    icon={<BarChart3 size={14} />}
                                    label="Tổng hội thoại"
                                    value={visitor?.totalConversations?.toString()}
                                />
                                {/* Domain */}
                                {metadata?.domain && (
                                    <InfoRow
                                        icon={<ExternalLink size={14} />}
                                        label="Website"
                                        value={metadata.domain}
                                        onCopy={handleCopy}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <Divider style={{ margin: '0 20px' }} />

                    {/* ── Shared Images ── */}
                    <div style={{ padding: '16px 24px' }}>
                        <Text strong style={{ fontSize: 13, color: '#374151', marginBottom: 10, display: 'block' }}>
                            <ImageIcon size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                            Hình ảnh ({images.length})
                        </Text>
                        {loadingImages ? (
                            <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
                        ) : images.length === 0 ? (
                            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                                Chưa có ảnh nào được chia sẻ
                            </Text>
                        ) : (
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
                            }}>
                                {images.map((img, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            width: '100%', paddingBottom: '100%', position: 'relative',
                                            borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                                            background: '#f3f4f6',
                                        }}
                                        onClick={() => window.open(img.url, '_blank')}
                                    >
                                        <img
                                            src={img.url}
                                            alt=""
                                            style={{
                                                position: 'absolute', inset: 0,
                                                width: '100%', height: '100%', objectFit: 'cover',
                                            }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <Divider style={{ margin: '0 20px' }} />

                    {/* ── Quick Actions ── */}
                    <div style={{ padding: '12px 24px 20px' }}>
                        {[
                            ...(conversation?.tags?.length ? [{
                                icon: <TagIcon size={15} />,
                                label: `Tags: ${conversation.tags.join(', ')}`,
                                color: '#6366f1',
                            }] : []),
                            { icon: <Clock size={15} />, label: `Lần cuối: ${visitor?.lastSeenAt ? new Date(visitor.lastSeenAt).toLocaleString('vi-VN') : 'N/A'}`, color: '#6b7280' },
                            { icon: <Shield size={15} />, label: `ID: ${visitorId?.slice(0, 16)}...`, color: '#6b7280', copyable: visitorId },
                        ].map((item, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 0',
                                    borderBottom: i < 2 ? '1px solid #f3f4f6' : 'none',
                                    cursor: item.copyable ? 'pointer' : 'default',
                                }}
                                onClick={() => item.copyable && handleCopy(item.copyable, 'ID')}
                            >
                                <span style={{ color: item.color, flexShrink: 0 }}>{item.icon}</span>
                                <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>{item.label}</Text>
                                {item.copyable && <Copy size={12} color="#9ca3af" />}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Modal>
    );
}

// ── Helper: Info Row ──
function InfoRow({ icon, label, value, onCopy }: {
    icon: React.ReactNode; label: string; value?: string;
    onCopy?: (text: string, label: string) => void;
}) {
    if (!value) return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.5 }}>
            <span style={{ color: '#9ca3af', flexShrink: 0 }}>{icon}</span>
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>{label}: —</Text>
        </div>
    );

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#9ca3af', flexShrink: 0 }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>{value}</Text>
            </div>
            {onCopy && (
                <Tooltip title="Sao chép">
                    <button
                        onClick={(e) => { e.stopPropagation(); onCopy(value, label); }}
                        style={{
                            border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db',
                            padding: 4, flexShrink: 0,
                        }}
                    >
                        <Copy size={12} />
                    </button>
                </Tooltip>
            )}
        </div>
    );
}
