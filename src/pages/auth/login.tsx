import Head from 'next/head';
import AuthLoginFeature from '../../features/auth/index';
import AuthLayout from '../../components/layout/AuthLayout';

export default function LoginPage() {
    return (
        <AuthLayout>
            <Head>
                <title>Đăng nhập | NemarkChat</title>
            </Head>

            <div
                className="card animate-fade-in-up"
                style={{
                    width: '100%',
                    maxWidth: 440,
                    padding: '48px 32px'
                }}
            >
                <AuthLoginFeature />

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <a href="/auth/forgot-password" style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                        Quên mật khẩu?
                    </a>
                </div>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                        Chưa có tài khoản?{' '}
                    </span>
                    <a href="/auth/register" style={{ color: 'var(--color-primary)', fontSize: 14, fontWeight: 600 }}>
                        Đăng ký ngay
                    </a>
                </div>
            </div>
        </AuthLayout>
    );
}
