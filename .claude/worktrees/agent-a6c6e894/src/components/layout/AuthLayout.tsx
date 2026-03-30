import React from 'react';
import Link from 'next/link';

interface AuthLayoutProps {
    children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-soft)',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            {/* Header */}
            <header
                style={{
                    padding: '20px 40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                    zIndex: 10
                }}
            >
                <div>
                    <Link href="/">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: 'var(--gradient-hero)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: 18
                            }}>
                                N
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--color-text)' }}>
                                NemarChat
                            </span>
                        </div>
                    </Link>
                </div>
                <div>
                    <Link href="/" style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>
                        Về trang chủ
                    </Link>
                </div>
            </header>

            {/* Main Content Area */}
            <main
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    position: 'relative',
                    zIndex: 10
                }}
            >
                {children}
            </main>

            {/* Background Decorations */}
            <div
                style={{
                    position: 'absolute',
                    top: -200,
                    right: -200,
                    width: 600,
                    height: 600,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
                    pointerEvents: 'none',
                    zIndex: 0
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: -100,
                    left: -200,
                    width: 500,
                    height: 500,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)',
                    pointerEvents: 'none',
                    zIndex: 0
                }}
            />
        </div>
    );
}
