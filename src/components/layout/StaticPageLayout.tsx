import Head from 'next/head';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { type ReactNode } from 'react';

interface StaticPageLayoutProps {
    title: string;
    description?: string;
    children: ReactNode;
}

export default function StaticPageLayout({ title, description, children }: StaticPageLayoutProps) {
    return (
        <>
            <Head>
                <title>{title} | NemarkChat</title>
                {description && <meta name="description" content={description} />}
                <link rel="icon" href="/images/favicon.png" type="image/png" />
            </Head>

            {/* Header */}
            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                    background: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid var(--color-border)',
                }}
            >
                <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
                    <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <img src="/images/logo.png" alt="NemarkChat" style={{ width: 36, height: 36, borderRadius: 10 }} />
                        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--color-text)' }}>
                            Nemark<span style={{ color: 'var(--color-primary)' }}>Chat</span>
                        </span>
                    </a>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                            <ArrowLeft size={16} />
                            Trang chủ
                        </a>
                        <a href="/auth/login" className="btn btn-sm btn-outline">Đăng nhập</a>
                        <a href="/auth/register" className="btn btn-sm btn-primary">Dùng thử miễn phí</a>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={{ minHeight: 'calc(100vh - 200px)' }}>
                <div className="container" style={{ padding: '64px 20px 80px', maxWidth: 800 }}>
                    {children}
                </div>
            </main>

            {/* Simple Footer */}
            <footer style={{ borderTop: '1px solid var(--color-border)', padding: '24px 0' }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
                        © 2026 NemarkChat. Mọi quyền được bảo lưu.
                    </p>
                    <div style={{ display: 'flex', gap: 24 }}>
                        {[
                            { label: 'Điều khoản', href: '/terms' },
                            { label: 'Bảo mật', href: '/privacy' },
                        ].map((item) => (
                            <a key={item.label} href={item.href} style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: 13 }}>
                                {item.label}
                            </a>
                        ))}
                    </div>
                </div>
            </footer>
        </>
    );
}
