import React, { useEffect, useState } from 'react';
import { Tabs, Form, Input, Button, Upload, message, Avatar, List, Spin } from 'antd';
import { UserOutlined, UploadOutlined, LockOutlined, DesktopOutlined } from '@ant-design/icons';
import { useGetMe, useUpdateProfile, useChangePassword, useGetSessions, useRevokeOtherSessions } from '../../../domains/auth/auth.hooks';

export default function ProfileManagement() {
    const { data: meData, isLoading: meLoading } = useGetMe();
    const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateProfile();
    const { mutateAsync: changePassword, isPending: isChangingPassword } = useChangePassword();
    const { data: sessionsData, isLoading: sessionsLoading } = useGetSessions();
    const { mutateAsync: revokeSessions, isPending: isRevoking } = useRevokeOtherSessions();

    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

    const user = meData?.data?.user;

    useEffect(() => {
        if (user) {
            profileForm.setFieldsValue({
                name: user.name,
                email: user.email, // readonly
            });
            if (user.avatarUrl) {
                setAvatarBase64(user.avatarUrl);
            }
        }
    }, [user, profileForm]);

    // Handle Image Upload -> Base64
    const handleAvatarChange = (info: any) => {
        const file = info.file.originFileObj || info.file;
        if (!file) return;

        const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
        if (!isJpgOrPng) {
            message.error('Bạn chỉ có thể tải lên file JPG/PNG!');
            return;
        }

        const isLt2M = file.size / 1024 / 1024 < 2;
        if (!isLt2M) {
            message.error('Ảnh tải lên phải nhỏ hơn 2MB!');
            return;
        }

        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setAvatarBase64(reader.result as string);
        });
        reader.readAsDataURL(file);
    };

    const onUpdateProfile = async (values: any) => {
        try {
            await updateProfile({
                name: values.name,
                avatarUrl: avatarBase64 || undefined
            });
            message.success('Cập nhật hồ sơ thành công!');
        } catch (error: any) {
            message.error(error.response?.data?.error?.message || 'Có lỗi xảy ra khi cập nhật hồ sơ');
        }
    };

    const onChangePassword = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Mật khẩu xác nhận không khớp!');
            return;
        }
        try {
            await changePassword({
                oldPassword: values.oldPassword,
                newPassword: values.newPassword
            });
            message.success('Đổi mật khẩu thành công!');
            passwordForm.resetFields();
        } catch (error: any) {
            message.error(error.response?.data?.error?.message || 'Có lỗi xảy ra khi đổi mật khẩu');
        }
    };

    const onRevokeSessions = async () => {
        try {
            await revokeSessions();
            message.success('Đã đăng xuất tất cả các thiết bị khác thành công!');
        } catch (error: any) {
            message.error('Có lỗi xảy ra khi thu hồi phiên đăng nhập');
        }
    };

    if (meLoading) return <div style={{ textAlign: 'center', padding: '50px 0' }}><Spin size="large" /></div>;

    const items = [
        {
            key: '1',
            label: <span><UserOutlined /> Hồ sơ cá nhân</span>,
            children: (
                <div style={{ maxWidth: 600, padding: '20px 0' }}>
                    <Form form={profileForm} layout="vertical" onFinish={onUpdateProfile}>
                        <Form.Item label="Ảnh đại diện" style={{ textAlign: 'center' }}>
                            <div style={{ marginBottom: 16 }}>
                                <Avatar size={100} icon={<UserOutlined />} src={avatarBase64} />
                            </div>
                            <Upload
                                showUploadList={false}
                                beforeUpload={() => false}
                                onChange={handleAvatarChange}
                            >
                                <Button icon={<UploadOutlined />}>Đổi ảnh đại diện</Button>
                            </Upload>
                        </Form.Item>

                        <Form.Item label="Email" name="email">
                            <Input disabled />
                        </Form.Item>

                        <Form.Item label="Họ và tên" name="name" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}>
                            <Input placeholder="Nhập họ và tên" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={isUpdating}>Lưu thay đổi</Button>
                        </Form.Item>
                    </Form>
                </div>
            )
        },
        {
            key: '2',
            label: <span><LockOutlined /> Đổi mật khẩu</span>,
            children: (
                <div style={{ maxWidth: 600, padding: '20px 0' }}>
                    <Form form={passwordForm} layout="vertical" onFinish={onChangePassword}>
                        <Form.Item label="Mật khẩu cũ" name="oldPassword" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu cũ' }]}>
                            <Input.Password placeholder="Nhập mật khẩu cũ" />
                        </Form.Item>

                        <Form.Item label="Mật khẩu mới" name="newPassword" rules={[
                            { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' }
                        ]}>
                            <Input.Password placeholder="Nhập mật khẩu mới" />
                        </Form.Item>

                        <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" rules={[{ required: true, message: 'Vui lòng xác nhận mật khẩu mới' }]}>
                            <Input.Password placeholder="Nhập lại mật khẩu mới" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={isChangingPassword}>Cập nhật mật khẩu</Button>
                        </Form.Item>
                    </Form>
                </div>
            )
        },
        {
            key: '3',
            label: <span><DesktopOutlined /> Thiết bị đăng nhập</span>,
            children: (
                <div style={{ padding: '20px 0' }}>
                    <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Quản lý thiết bị</h3>
                            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Xem và đăng xuất khỏi các thiết bị khác đang đăng nhập tài khoản của bạn.</p>
                        </div>
                        <Button type="primary" danger onClick={onRevokeSessions} loading={isRevoking}>
                            Đăng xuất các thiết bị khác
                        </Button>
                    </div>

                    <List
                        loading={sessionsLoading}
                        itemLayout="horizontal"
                        dataSource={sessionsData?.data || []}
                        renderItem={(session: any) => (
                            <List.Item>
                                <List.Item.Meta
                                    avatar={<Avatar icon={<DesktopOutlined />} style={{ background: session.isCurrent ? '#52c41a' : '#1890ff' }} />}
                                    title={
                                        <span>
                                            {session.userAgent || 'Thiết bị không xác định'}
                                            {session.isCurrent && <span style={{ color: '#52c41a', marginLeft: 8, fontSize: 12 }}>(Hiện tại)</span>}
                                        </span>
                                    }
                                    description={
                                        <div>
                                            <div>IP: {session.ipAddress || 'Unknown'}</div>
                                            <div>Đăng nhập lần cuối: {new Date(session.lastActivity || session.createdAt).toLocaleString()}</div>
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </div>
            )
        }
    ];

    return (
        <div style={{ background: 'var(--color-bg)', padding: '24px 32px', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 600 }}>Cài đặt tài khoản</h2>
            <Tabs defaultActiveKey="1" items={items} />
        </div>
    );
}
