import React from 'react';
import Link from 'next/link';
import { MessageCircle, Shield, Zap, Users } from 'lucide-react';

interface AuthLayoutProps {
    children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "var(--font-sans, 'Inter', sans-serif)" }}>
            {/* ─── Left Panel: Branding ─── */}
            <div
                className="auth-left-panel"
                style={{
                    width: '50%',
                    background: 'linear-gradient(160deg, #4f46e5 0%, #6366f1 35%, #8b5cf6 65%, #a78bfa 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '60px 48px',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Decorative circles */}
                <div style={{ position: 'absolute', top: -120, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -100, left: -60, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
                <div className="animate-float" style={{ position: 'absolute', top: '30%', right: '15%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, textAlign: 'center' }}>
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                        }}>
                            <MessageCircle size={26} color="white" />
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 28, color: 'white', letterSpacing: '-0.02em' }}>
                            NemarChat
                        </span>
                    </div>

                    <h2 style={{ fontSize: 32, fontWeight: 800, color: 'white', lineHeight: 1.3, marginBottom: 16, letterSpacing: '-0.02em' }}>
                        Nền tảng Live Chat<br />thế hệ mới
                    </h2>
                    <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: 48 }}>
                        Kết nối khách hàng tức thì, quản lý đa kênh thông minh và tự động hoá hỗ trợ.
                    </p>

                    {/* Feature list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
                        {[
                            { icon: Zap, text: 'Chat realtime dưới 200ms' },
                            { icon: Users, text: 'Team management & RBAC đa workspace' },
                            { icon: Shield, text: 'Bảo mật enterprise-grade' },
                        ].map(({ icon: Icon, text }) => (
                            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    background: 'rgba(255,255,255,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Icon size={18} color="white" />
                                </div>
                                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: 500 }}>
                                    {text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── Right Panel: Auth Form ─── */}
            <div
                className="auth-right-panel"
                style={{
                    width: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--color-bg, #fff)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Top bar */}
                <header style={{
                    padding: '20px 40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    position: 'relative',
                    zIndex: 10,
                }}>
                    <Link href="/" style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                        ← Về trang chủ
                    </Link>
                </header>

                {/* Form container */}
                <main style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px 40px',
                    position: 'relative',
                    zIndex: 10,
                }}>
                    {children}
                </main>

                {/* Subtle background decoration */}
                <div style={{
                    position: 'absolute', bottom: -180, right: -180,
                    width: 400, height: 400, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
                    pointerEvents: 'none', zIndex: 0,
                }} />
            </div>

            {/* Responsive: mobile collapses */}
            <style jsx global>{`
                @media (max-width: 768px) {
                    .auth-left-panel { display: none !important; }
                    .auth-right-panel { width: 100% !important; }
                }
            `}</style>
        </div>
    );
}
