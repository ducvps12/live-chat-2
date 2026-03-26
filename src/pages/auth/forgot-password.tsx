import Head from 'next/head';
import AuthLayout from '../../components/layout/AuthLayout';
import { Form, Input, Button, Alert, message } from 'antd';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForgotPassword } from '../../domains/auth/auth.hooks';

export default function ForgotPasswordPage() {
    const { mutateAsync: forgotPassword, isPending } = useForgotPassword();
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const onFinish = async (values: any) => {
        try {
            setErrorMsg(null);
            setSuccessMsg(null);
            const res = await forgotPassword(values.email);
            if (res.success) {
                setSuccessMsg('Nếu email tồn tại trong hệ thống, chúng tôi đã gửi một liên kết khôi phục.');
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
        }
    };

    return (
        <AuthLayout>
            <Head>
                <title>Quên mật khẩu | NemarkChat</title>
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
                        Quên mật khẩu?
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>
                        Nhập email của bạn và chúng tôi sẽ gửi liên kết khôi phục.
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

                {successMsg && (
                    <Alert
                        message={successMsg}
                        type="success"
                        showIcon
                        style={{ marginBottom: 24, borderRadius: 'var(--radius-md)' }}
                    />
                )}

                {!successMsg && (
                    <Form
                        name="auth-forgot-password"
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
                                placeholder="Nhập địa chỉ email"
                                style={{ borderRadius: 'var(--radius-md)' }}
                            />
                        </Form.Item>

                        <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
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
                                Gửi yêu cầu
                            </Button>
                        </Form.Item>
                    </Form>
                )}

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <a href="/auth/login" style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                        Quay lại đăng nhập
                    </a>
                </div>
            </div>
        </AuthLayout>
    );
}
