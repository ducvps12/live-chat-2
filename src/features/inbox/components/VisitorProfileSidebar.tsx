import React, { useState, useEffect } from 'react';
import { Spin, Button, Form, Input, Divider, Typography, Empty, message, Tag, Select, Mentions } from 'antd';
import { Edit2, ExternalLink, Mail, Phone, User, MonitorSmartphone, MapPin, Tag as TagIcon, StickyNote } from 'lucide-react';
import { useGetVisitor, useUpdateVisitor } from '../hooks/useVisitor';

const { Text, Title } = Typography;

interface VisitorProfileSidebarProps {
    workspaceId: string;
    visitorId: string | null;
    conversationTags?: string[];
    workspaceTags?: string[];
    workspaceMembers?: Array<{ _id: string; name: string; email?: string }>;
    onAddTag?: (tag: string) => void;
    onRemoveTag?: (tag: string) => void;
    onAddNote?: (content: string, mentionedUserIds?: string[]) => void;
}

export const VisitorProfileSidebar: React.FC<VisitorProfileSidebarProps> = ({
    workspaceId, visitorId, conversationTags = [], workspaceTags = [], workspaceMembers = [],
    onAddTag, onRemoveTag, onAddNote,
}) => {
    const { data: visitor, isLoading, refetch } = useGetVisitor(workspaceId, visitorId || undefined);
    const { mutate: updateVisitor, isPending: isUpdating } = useUpdateVisitor();

    const [isEditing, setIsEditing] = useState(false);
    const [noteText, setNoteText] = useState('');
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
                                {conversationTags.map(t => (
                                    <Tag
                                        key={t}
                                        closable
                                        color="blue"
                                        onClose={() => onRemoveTag?.(t)}
                                        style={{ borderRadius: 8, margin: 0 }}
                                    >
                                        {t}
                                    </Tag>
                                ))}
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

                        {/* ── Internal Note ── */}
                        <div style={styles.section}>
                            <Title level={5} style={styles.sectionTitle}>
                                <StickyNote size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Ghi chú nội bộ
                            </Title>
                            <div style={{
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                                padding: 10,
                            }}>
                                <Mentions
                                    rows={3}
                                    placeholder="Viết ghi chú nội bộ (thêm @ để tag đồng nghiệp)..."
                                    value={noteText}
                                    onChange={setNoteText}
                                    style={{ borderColor: '#fde68a', background: 'transparent', marginBottom: 6, width: '100%' }}
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
                                        style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
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
        width: 320,
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
    },
    emptyContainer: {
        width: 320,
        height: '100%',
        background: '#fafafa',
        borderLeft: '1px solid #e8e8e8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    loadingContainer: {
        width: 320,
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #e8e8e8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    header: {
        padding: '32px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        background: 'linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)',
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
        padding: '24px 20px',
        flex: 1,
    },
    section: {
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#111',
        marginBottom: 12,
    },
    infoList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
