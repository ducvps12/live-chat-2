import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Button, Modal, Form, Input, Select, Table, Tag, Space, Popconfirm, Avatar, Spin, message, Typography, Badge } from 'antd';
import { Users, Plus, Trash2, ArrowLeft, Mail, MessageSquare } from 'lucide-react';
import { useGetMe } from '../../../domains/auth/auth.hooks';
import { useWorkspace, useWorkspaceMembers, useAddWorkspaceMember, useRemoveWorkspaceMember } from '../../../domains/workspace/workspace.hooks';
import { useTotalUnreadCount } from '../../../domains/conversation';
import AppLayout from '../../../components/layout/AppLayout';

const { Text } = Typography;

export function TeamManagement({ workspaceId }: { workspaceId: string }) {
    const router = useRouter();
    const [form] = Form.useForm();
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

    const { data: meData, isLoading: meLoading } = useGetMe(true);
    const { data: wsData, isLoading: wsLoading } = useWorkspace(workspaceId, !!workspaceId);
    const { data: membersData, isLoading: membersLoading } = useWorkspaceMembers(workspaceId);
    const { data: totalUnreadCount = 0 } = useTotalUnreadCount(workspaceId, !!workspaceId && !!meData);

    const { mutateAsync: addMember, isPending: isAdding } = useAddWorkspaceMember();
    const { mutateAsync: removeMember, isPending: isRemoving } = useRemoveWorkspaceMember();

    const workspace = wsData?.data;
    const members = membersData?.data || [];
    const me = meData?.data;

    const myId = me?.user?.id || (me?.user as any)?._id || (me as any)?._id;
    const myRole = members.find((m: any) => {
        const mId = m.userId?._id || m.userId?.id || m.userId;
        return mId === myId;
    })?.role;
    const canManage = myRole === 'admin' || myRole === 'owner';

    const handleInvite = async (values: { email: string; role: string }) => {
        try {
            const res = await addMember({ workspaceId, email: values.email, role: values.role });
            if (res.success) {
                message.success('Đã mời thành viên thành công');
                setIsInviteModalOpen(false);
                form.resetFields();
            }
        } catch (error: any) {
            message.error(error.response?.data?.error?.message || 'Lỗi khi mời thành viên');
        }
    };

    const handleRemove = async (userId: string) => {
        try {
            const res = await removeMember({ workspaceId, userId });
            if (res.success) {
                message.success('Đã xoá thành viên khỏi workspace');
            }
        } catch (error: any) {
            message.error(error.response?.data?.error?.message || 'Lỗi khi xoá thành viên');
        }
    };

    const columns = [
        {
            title: 'Thành viên',
            key: 'user',
            render: (_: any, record: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar style={{ backgroundColor: '#6366f1' }}>
                        {record.userId?.fullName?.charAt(0)?.toUpperCase() || record.userId?.email?.charAt(0)?.toUpperCase()}
                    </Avatar>
                    <div>
                        <div style={{ fontWeight: 500 }}>{record.userId?.fullName || 'Chưa cập nhật tên'}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{record.userId?.email}</div>
                    </div>
                </div>
            )
        },
        {
            title: 'Vai trò',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => {
                const color = role === 'admin' || role === 'owner' ? 'red' : role === 'agent' ? 'blue' : 'default';
                const label = role === 'admin' ? 'Quản trị viên' : role === 'owner' ? 'Chủ sở hữu' : role === 'agent' ? 'Nhân viên hỗ trợ' : 'Thành viên';
                return <Tag color={color}>{label.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'Ngày tham gia',
            dataIndex: 'joinedAt',
            key: 'joinedAt',
            render: (date: string) => new Date(date).toLocaleDateString('vi-VN')
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: any, record: any) => {
                const mId = record.userId?._id || record.userId?.id || record.userId;
                const myId = me?.user?.id || (me?.user as any)?._id || (me as any)?._id;
                if (!canManage || record.role === 'owner' || mId === myId) return null;
                return (
                    <Popconfirm
                        title="Xoá thành viên"
                        description="Bạn có chắc chắn muốn xoá thành viên này khỏi workspace?"
                        onConfirm={() => handleRemove(mId)}
                        okText="Xoá"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true, loading: isRemoving }}
                    >
                        <Button danger type="text" icon={<Trash2 size={16} />} />
                    </Popconfirm>
                );
            }
        }
    ];

    if (wsLoading || meLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <AppLayout headerTitle="Đội ngũ hỗ trợ (Teams)">
            <Head><title>Quản lý thành viên | NemarChat</title></Head>

            {/* Content */}
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                    <div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                            Quản lý các thành viên trong workspace và phân quyền trả lời tin nhắn.
                        </p>
                    </div>
                    {canManage && (
                        <Button type="primary" icon={<Plus size={16} />}
                            onClick={() => setIsInviteModalOpen(true)}
                            style={{
                                height: 40, borderRadius: 'var(--radius-full)',
                                background: 'var(--gradient-hero)', border: 'none', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 6,
                                boxShadow: '0 4px 14px rgba(99,102,241,0.25)'
                            }}
                        >
                            Thêm thành viên
                        </Button>
                    )}
                </div>

                <div className="card" style={{ padding: 24, borderRadius: 12, background: 'var(--color-bg)' }}>
                    <Table
                        dataSource={members}
                        columns={columns}
                        rowKey={(record) => record.userId?._id}
                        loading={membersLoading}
                        pagination={false}
                    />
                </div>
            </main>

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={20} className="text-primary" />
                        <span>Mời thành viên mới</span>
                    </div>
                }
                open={isInviteModalOpen}
                onCancel={() => { setIsInviteModalOpen(false); form.resetFields(); }}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleInvite}
                    initialValues={{ role: 'agent' }}
                    style={{ marginTop: 24 }}
                >
                    <Form.Item
                        name="email"
                        label="Email thành viên"
                        rules={[
                            { required: true, message: 'Vui lòng nhập email!' },
                            { type: 'email', message: 'Email không hợp lệ!' }
                        ]}
                    >
                        <Input prefix={<Mail size={16} className="text-muted" />} placeholder="Nhập địa chỉ email đăng ký trên hệ thống" size="large" />
                    </Form.Item>

                    <Form.Item
                        name="role"
                        label="Vai trò"
                        rules={[{ required: true, message: 'Vui lòng chọn vai trò!' }]}
                    >
                        <Select size="large">
                            <Select.Option value="admin">Quản trị viên (Toàn quyền)</Select.Option>
                            <Select.Option value="agent">Nhân viên hỗ trợ (Chỉ trả lời tin nhắn)</Select.Option>
                            <Select.Option value="member">Thành viên (Chỉ xem)</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, marginTop: 32, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsInviteModalOpen(false)} size="large">Hủy</Button>
                            <Button type="primary" htmlType="submit" loading={isAdding} size="large" style={{ background: 'var(--gradient-hero)', border: 'none' }}>
                                Mời tham gia
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </AppLayout>
    );
}
