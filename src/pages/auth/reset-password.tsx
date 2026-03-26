import Head from 'next/head';
import AuthLayout from '../../components/layout/AuthLayout';
import { Form, Input, Button, Alert, message } from 'antd';
import { Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useResetPassword } from '../../domains/auth/auth.hooks';
import { useRouter } from 'next/router';

export default function ResetPasswordPage() {
    const router = useRouter();
    const { token } = router.query;
    const { mutateAsync: resetPassword, isPending } = useResetPassword();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // If no token exists, maybe show error or redirect
    useEffect(() => {
        if (router.isReady && !token) {
            setErrorMsg('Token không hợp lệ hoặc đã hết hạn.');
        }
    }, [router.isReady, token]);

    const onFinish = async (values: any) => {
        try {
            setErrorMsg(null);
            const res = await resetPassword({ token: token as string, newPassword: values.password });
            if (res.success) {
                message.success('Cập nhật mật khẩu thành công. Vui lòng đăng nhập lại.');
                router.push('/auth/login');
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
        }
    };

    return (
        <AuthLayout>
            <Head>
                <title>Khôi phục mật khẩu | NemarkChat</title>
            </Head>

            <div
                className="card animate-fade-in-up"
                style={{
                    width: '100%',
                    maxWidth: 440,
                    padding: '48px 32px'
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                        Tạo mật khẩu mới
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>
                        Vui lòng nhập mật khẩu mới cho tài khoản của bạn.
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
                    name="auth-reset-password"
                    layout="vertical"
                    onFinish={onFinish}
                    requiredMark={false}
                    size="large"
                >
                    <Form.Item
                        label="Mật khẩu mới"
                        name="password"
                        rules={[
                            { required: true, message: 'Vui lòng nhập mật khẩu mới!' },
                            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' }
                        ]}
                    >
                        <Input.Password
                            prefix={<Lock size={16} color="var(--color-text-muted)" />}
                            placeholder="Mật khẩu mới"
                            disabled={!token}
                            style={{ borderRadius: 'var(--radius-md)' }}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            block
                            disabled={!token}
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
                            Cập nhật mật khẩu
                        </Button>
                    </Form.Item>
                </Form>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <a href="/auth/login" style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                        Quay lại đăng nhập
                    </a>
                </div>
            </div>
        </AuthLayout>
    );
}
