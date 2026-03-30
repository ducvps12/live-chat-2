import { useState } from 'react';
import { Form, Input, Button, Alert, message } from 'antd';
import { Mail, Lock } from 'lucide-react';
import { useLogin } from '../../domains/auth/auth.hooks';
import { useRouter } from 'next/router';

export default function AuthLoginFeature() {
    const { mutateAsync: login, isPending } = useLogin();
    const router = useRouter();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const onFinish = async (values: any) => {
        try {
            setErrorMsg(null);
            const res = await login(values);
            if (res.success) {
                message.success('Đăng nhập thành công');
                // Redirect to admin or workspace depending on role
                router.push('/workspace');
            }
        } catch (err: any) {
            const serverMsg = err.response?.data?.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.';
            setErrorMsg(serverMsg);
        }
    };

    return (
        <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    Chào mừng trở lại
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>
                    Đăng nhập để tiếp tục với NemarChat
                </p>
            </div>

            {errorMsg && (
                <Alert
                    message={errorMsg}
                    type="error"
                    showIcon
                    style={{ marginBottom: 24, borderRadius: 'var(--radius-md)' }}
                />
            )}

            <Form
                name="auth-login"
                layout="vertical"
                onFinish={onFinish}
                requiredMark={false}
                size="large"
            >
                <Form.Item
                    label="Email"
                    name="email"
                    rules={[
                        { required: true, message: 'Vui lòng nhập email!' },
                        { type: 'email', message: 'Email không đúng định dạng!' }
                    ]}
                >
                    <Input 
                        prefix={<Mail size={16} color="var(--color-text-muted)" />} 
                        placeholder="admin@nemark.io"
                        style={{ borderRadius: 'var(--radius-md)' }}
                    />
                </Form.Item>

                <Form.Item
                    label="Mật khẩu"
                    name="password"
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
                >
                    <Input.Password 
                        prefix={<Lock size={16} color="var(--color-text-muted)" />}
                        placeholder="••••••••"
                        style={{ borderRadius: 'var(--radius-md)' }}
                    />
                </Form.Item>

                <Form.Item style={{ marginTop: 32 }}>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        block 
                        loading={isPending}
                        style={{
                            height: 48,
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--gradient-hero)',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 15,
                            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)'
                        }}
                    >
                        Đăng nhập
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );
}
