import React from 'react';
import { Card, Button, Typography, Space, Spin, Alert, Avatar } from 'antd';
import { QrcodeOutlined, DisconnectOutlined, SyncOutlined, CheckCircleFilled, MessageOutlined } from '@ant-design/icons';
import { useZaloStatus, useGenerateZaloQR, useDisconnectZalo } from '../../../domains/zalo/zalo.hooks';

const { Title, Text } = Typography;

export default function ZaloIntegrationSettings({ workspaceId }: { workspaceId: string }) {
    const { data: res, isLoading, refetch } = useZaloStatus(workspaceId);
    const { mutate: generateQR, isPending: isGenerating } = useGenerateZaloQR();
    const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectZalo();

    const statusObj = res?.data;
    const status = statusObj?.status || 'disconnected';
    const account = statusObj?.account;
    const qrUrl = statusObj?.qrUrl; // Server might return qrUrl if status is pending

    const handleConnect = () => {
        generateQR(workspaceId);
    };

    const handleDisconnect = () => {
        disconnect(workspaceId);
    };

    return (
        <Card style={{ marginTop: 24 }} bodyStyle={{ padding: '32px' }}>
            <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageOutlined style={{ color: '#0068ff' }} />
                Tích hợp Zalo Cá Nhân
            </Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                Kết nối tài khoản Zalo cá nhân của bạn để nhận và trả lời tin nhắn Zalo trực tiếp từ NemarChat.
                Lưu ý: Bạn chỉ có thể kết nối 1 tài khoản Zalo cho mỗi Workspace.
            </Text>

            {isLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Spin />
                </div>
            ) : (
                <div style={{ background: 'var(--color-bg-base)', padding: 24, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    {status === 'connected' && account ? (
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Alert
                                message="Đã kết nối thành công"
                                description="Tài khoản Zalo của bạn đã được kết nối và đang sẵn sàng nhận tin nhắn."
                                type="success"
                                showIcon
                                icon={<CheckCircleFilled />}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                                <Space size="large">
                                    <Avatar src={account.avatar} size={64}>{account.name?.charAt(0)}</Avatar>
                                    <div>
                                        <Text strong style={{ fontSize: 18, display: 'block' }}>{account.name}</Text>
                                        <Text type="secondary">Đang hoạt động</Text>
                                    </div>
                                </Space>
                                <Button 
                                    danger 
                                    icon={<DisconnectOutlined />} 
                                    loading={isDisconnecting}
                                    onClick={handleDisconnect}
                                >
                                    Ngắt Kết Nối
                                </Button>
                            </div>
                        </Space>
                    ) : status === 'pending' && qrUrl ? (
                        <div style={{ textAlign: 'center' }}>
                            <Text strong style={{ display: 'block', marginBottom: 16 }}>
                                Quét mã QR bằng ứng dụng Zalo trên điện thoại
                            </Text>
                            <div style={{ 
                                display: 'inline-block', 
                                padding: 16, 
                                background: '#fff', 
                                borderRadius: 12,
                                border: '1px solid #d9d9d9',
                                marginBottom: 16
                            }}>
                                <img src={qrUrl} alt="Zalo QR Code" style={{ width: 256, height: 256 }} />
                            </div>
                            <div>
                                <Space>
                                    <Button icon={<SyncOutlined />} onClick={() => refetch()} loading={isLoading}>
                                        Làm mới trạng thái
                                    </Button>
                                    <Button onClick={handleConnect} loading={isGenerating}>
                                        Tạo mã mới
                                    </Button>
                                </Space>
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
                                Trạng thái sẽ tự động cập nhật sau khi bạn quét mã thành công.
                            </Text>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Button 
                                type="primary" 
                                size="large" 
                                icon={<QrcodeOutlined />} 
                                onClick={handleConnect}
                                loading={isGenerating}
                                style={{ background: '#0068ff', borderColor: '#0068ff' }}
                            >
                                Kết Nối Bằng Mã QR
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
