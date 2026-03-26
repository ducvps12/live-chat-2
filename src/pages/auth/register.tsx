import Head from 'next/head';
import AuthLayout from '../../components/layout/AuthLayout';
import { Form, Input, Button, Alert, message } from 'antd';
import { Mail, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { httpClient } from '../../lib/http/client';

export default function RegisterPage() {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const onFinish = async (values: any) => {
        try {
            setIsPending(true);
            setErrorMsg(null);

            // Post directly to the setup endpoint for MVP
            const res = await httpClient.post('/auth/setup-admin', {
                email: values.email,
                password: values.password,
                name: values.name
            });

            if (res.data.success) {
                message.success('Đăng ký thành công! Vui lòng đăng nhập.');
                router.push('/auth/login');
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <AuthLayout>
            <Head>
                <title>Đăng ký | NemarkChat</title>
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
                        Tạo tài khoản mới
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>
                        Bắt đầu sử dụng NemarkChat miễn phí
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
                    name="auth-register"
                    layout="vertical"
                    onFinish={onFinish}
                    requiredMark={false}
                    size="large"
                >
                    <Form.Item
                        label="Họ và tên"
                        name="name"
                        rules={[
                            { required: true, message: 'Vui lòng nhập họ tên!' }
                        ]}
                    >
                        <Input
                            prefix={<User size={16} color="var(--color-text-muted)" />}
                            placeholder="Nguyễn Văn A"
                            style={{ borderRadius: 'var(--radius-md)' }}
                        />
                    </Form.Item>

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
                        rules={[
                            { required: true, message: 'Vui lòng nhập mật khẩu!' },
                            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' }
                        ]}
                    >
                        <Input.Password
                            prefix={<Lock size={16} color="var(--color-text-muted)" />}
                            placeholder="••••••••"
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
                            Đăng ký ngay
                        </Button>
                    </Form.Item>
                </Form>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                        Đã có tài khoản?{' '}
                    </span>
                    <a href="/auth/login" style={{ color: 'var(--color-primary)', fontSize: 14, fontWeight: 500 }}>
                        Đăng nhập
                    </a>
                </div>
            </div>
        </AuthLayout>
    );
}
