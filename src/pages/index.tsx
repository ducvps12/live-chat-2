import Head from 'next/head';
import {
    MessageCircle,
    Zap,
    Shield,
    Users,
    Globe,
    BarChart3,
    Bot,
    Headphones,
    ArrowRight,
    Check,
    Star,
    ChevronRight,
    Layers,
    Lock,
    Clock,
    Search,
    FileText,
    Bell,
    Settings,
    Workflow,
    Sparkles,
    MonitorSmartphone,
    type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useRef, type ReactNode } from 'react';

/* ============================================
   Intersection Observer Hook
   ============================================ */
function useInView(threshold = 0.15) {
    const ref = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setInView(true); },
            { threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);

    return { ref, inView };
}

/* ============================================
   Section Wrapper
   ============================================ */
function AnimatedSection({
    children,
    className = '',
    id,
    style: extraStyle,
}: {
    children: ReactNode;
    className?: string;
    id?: string;
    style?: React.CSSProperties;
}) {
    const { ref, inView } = useInView();
    return (
        <section
            ref={ref}
            id={id}
            className={className}
            style={{
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(40px)',
                transition: 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                ...extraStyle,
            }}
        >
            {children}
        </section>
    );
}

/* ============================================
   Header / Navbar
   ============================================ */
function Header() {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
                backdropFilter: scrolled ? 'blur(20px)' : 'none',
                borderBottom: scrolled ? '1px solid var(--color-border)' : 'none',
                transition: 'all var(--transition-base)',
            }}
        >
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                        src="/images/nemarkchat-logo.png"
                        alt="NemarkChat"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            objectFit: 'contain',
                        }}
                    />
                    <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--color-text)' }}>
                        Nemark<span style={{ color: 'var(--color-primary)' }}>Chat</span>
                    </span>
                </div>

                {/* Nav Links */}
                <nav
                    style={{
                        display: menuOpen ? 'flex' : undefined,
                        gap: 32,
                        alignItems: 'center',
                    }}
                    className="nav-desktop"
                >
                    {[
                        { label: 'Tính năng', href: '#features' },
                        { label: 'Cách hoạt động', href: '#how-it-works' },
                        { label: 'Phases', href: '#phases' },
                        { label: 'Báo giá', href: '#pricing' },
                    ].map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            style={{
                                textDecoration: 'none',
                                color: 'var(--color-text-secondary)',
                                fontWeight: 500,
                                fontSize: 14,
                                transition: 'color var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                        >
                            {item.label}
                        </a>
                    ))}
                </nav>

                {/* CTA */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <a href="/auth/login" className="btn btn-sm btn-outline nav-cta-login">
                        Đăng nhập
                    </a>
                    <a href="/auth/register" className="btn btn-sm btn-primary">
                        Dùng thử miễn phí
                    </a>
                </div>
            </div>

            {/* Responsive styles in <style> tag at bottom */}
        </header>
    );
}

/* ============================================
   Hero Dashboard Mockup (Pure CSS/JSX)
   ============================================ */
function HeroDashboardMockup() {
    const sidebarItems = [
        { icon: MessageCircle, label: 'Inbox', active: true, badge: 3 },
        { icon: Users, label: 'Visitors', active: false },
        { icon: BarChart3, label: 'Analytics', active: false },
        { icon: Settings, label: 'Settings', active: false },
    ];

    const messages = [
        { from: 'visitor', text: 'Xin chào, tôi muốn hỏi về gói Professional', time: '14:02', delay: 0 },
        { from: 'agent', text: 'Chào bạn! Mình sẵn sàng hỗ trợ. Gói Pro bao gồm 20 agents, widget tuỳ chỉnh đầy đủ 🎉', time: '14:02', delay: 0.3 },
        { from: 'visitor', text: 'Có hỗ trợ tích hợp Zalo OA không?', time: '14:03', delay: 0.6 },
        { from: 'agent', text: 'Có ạ! NemarkChat hỗ trợ tích hợp Zalo OA, Facebook Messenger và nhiều kênh khác 💬', time: '14:03', delay: 0.9 },
    ];

    const mockupBase: React.CSSProperties = {
        background: '#0f172a',
        borderRadius: 'calc(var(--radius-xl) - 3px)',
        display: 'grid',
        gridTemplateColumns: '56px 1fr 220px',
        height: 420,
        overflow: 'hidden',
        fontSize: 12,
        fontFamily: 'var(--font-sans)',
    };

    return (
        <div style={mockupBase}>
            {/* === Sidebar === */}
            <div style={{
                background: '#1e293b',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 16,
                gap: 4,
            }}>
                {/* Logo icon */}
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--gradient-hero)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                }}>
                    <MessageCircle size={14} color="white" />
                </div>
                {sidebarItems.map((item) => (
                    <div
                        key={item.label}
                        style={{
                            width: 40, height: 40,
                            borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative',
                            background: item.active ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: item.active ? '#818cf8' : '#64748b',
                            transition: 'all 0.2s',
                        }}
                    >
                        <item.icon size={18} />
                        {item.badge && (
                            <div style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 16, height: 16, borderRadius: '50%',
                                background: '#ef4444', color: 'white',
                                fontSize: 9, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {item.badge}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* === Chat Area === */}
            <div style={{
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Chat header */}
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 13, fontWeight: 700,
                    }}>K</div>
                    <div>
                        <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>Khách hàng #1024</div>
                        <div style={{ color: '#22c55e', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                            Online
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className="hero-msg-bubble"
                            style={{
                                alignSelf: msg.from === 'agent' ? 'flex-end' : 'flex-start',
                                maxWidth: '75%',
                                padding: '8px 14px',
                                borderRadius: msg.from === 'agent' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                background: msg.from === 'agent'
                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                    : 'rgba(255,255,255,0.08)',
                                color: msg.from === 'agent' ? 'white' : '#cbd5e1',
                                fontSize: 12,
                                lineHeight: 1.5,
                                animationDelay: `${msg.delay + 0.5}s`,
                            }}
                        >
                            {msg.text}
                            <div style={{
                                fontSize: 9, marginTop: 4,
                                opacity: 0.6, textAlign: msg.from === 'agent' ? 'right' : 'left',
                            }}>{msg.time}</div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    <div style={{
                        alignSelf: 'flex-start',
                        padding: '10px 16px',
                        borderRadius: '14px 14px 14px 4px',
                        background: 'rgba(255,255,255,0.08)',
                        display: 'flex', gap: 4, alignItems: 'center',
                        animation: 'fadeIn 0.3s ease-out forwards',
                        animationDelay: '1.8s',
                        opacity: 0,
                    }}>
                        <span className="typing-dot" style={{ animationDelay: '0s' }} />
                        <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                        <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                    </div>
                </div>

                {/* Input bar */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{
                        flex: 1, padding: '8px 14px',
                        borderRadius: 20, background: 'rgba(255,255,255,0.06)',
                        color: '#64748b', fontSize: 12,
                    }}>
                        Nhập tin nhắn...
                    </div>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--gradient-hero)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ArrowRight size={14} color="white" />
                    </div>
                </div>
            </div>

            {/* === Right Panel — Visitor Profile === */}
            <div className="hero-mockup-right" style={{
                background: '#1e293b',
                padding: '20px 16px',
                display: 'flex', flexDirection: 'column', gap: 16,
                overflowY: 'auto',
            }}>
                {/* Profile */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 8px', color: 'white', fontWeight: 700, fontSize: 18,
                    }}>K</div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>Khách hàng #1024</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>Hồ Chí Minh, VN</div>
                </div>

                {/* Details */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 }}>
                    <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Thông tin</div>
                    {[
                        { label: 'Device', value: 'Chrome / Windows' },
                        { label: 'Lần truy cập', value: '3 lần' },
                        { label: 'Trang hiện tại', value: '/pricing' },
                    ].map((d) => (
                        <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                            <span style={{ color: '#64748b' }}>{d.label}</span>
                            <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{d.value}</span>
                        </div>
                    ))}
                </div>

                {/* Tags */}
                <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tags</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {['VIP', 'Pricing', 'Potential'].map((tag) => (
                            <span key={tag} style={{
                                padding: '3px 8px', borderRadius: 6,
                                background: tag === 'VIP' ? 'rgba(99,102,241,0.15)' : tag === 'Potential' ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.15)',
                                color: tag === 'VIP' ? '#818cf8' : tag === 'Potential' ? '#4ade80' : '#22d3ee',
                                fontSize: 10, fontWeight: 600,
                            }}>{tag}</span>
                        ))}
                    </div>
                </div>

                {/* Activity Timeline */}
                <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Hoạt động</div>
                    {[
                        { action: 'Xem trang /pricing', time: '2 phút trước' },
                        { action: 'Bắt đầu chat', time: '1 phút trước' },
                    ].map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'flex-start' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', marginTop: 5, flexShrink: 0 }} />
                            <div>
                                <div style={{ color: '#cbd5e1', fontSize: 11 }}>{a.action}</div>
                                <div style={{ color: '#475569', fontSize: 9 }}>{a.time}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ============================================
   Hero Section
   ============================================ */
function Hero() {
    return (
        <section
            style={{
                position: 'relative',
                paddingTop: 140,
                paddingBottom: 100,
                overflow: 'hidden',
            }}
        >
            {/* Background decorations */}
            <div
                style={{
                    position: 'absolute',
                    top: -200,
                    right: -200,
                    width: 600,
                    height: 600,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
                    pointerEvents: 'none',
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
                    background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }}
            />

            <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                {/* Badge */}
                <div
                    className="animate-fade-in"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 16px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-primary-50)',
                        border: '1px solid var(--color-primary-100)',
                        marginBottom: 24,
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                    }}
                >
                    <Sparkles size={14} />
                    Nền tảng Live Chat thế hệ mới
                </div>

                {/* Headline */}
                <h1
                    className="animate-fade-in-up"
                    style={{
                        fontSize: 'clamp(36px, 5.5vw, 64px)',
                        fontWeight: 900,
                        lineHeight: 1.1,
                        marginBottom: 24,
                        letterSpacing: '-0.03em',
                    }}
                >
                    Kết nối khách hàng{' '}
                    <span className="text-gradient">ngay lập tức</span>
                    <br />
                    với hệ thống chat thông minh
                </h1>

                {/* Subheadline */}
                <p
                    className="animate-fade-in-up animate-delay-2"
                    style={{
                        fontSize: 'clamp(16px, 2vw, 20px)',
                        color: 'var(--color-text-secondary)',
                        maxWidth: 640,
                        margin: '0 auto 40px',
                        lineHeight: 1.7,
                    }}
                >
                    NemarkChat giúp doanh nghiệp quản lý hội thoại đa kênh, phân quyền team linh hoạt,
                    và tự động hoá hỗ trợ khách hàng — tất cả trong một nền tảng duy nhất.
                </p>

                {/* CTA Buttons */}
                <div
                    className="animate-fade-in-up animate-delay-3"
                    style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
                >
                    <a href="#" className="btn btn-lg btn-primary">
                        Bắt đầu miễn phí
                        <ArrowRight size={18} />
                    </a>
                    <a href="#how-it-works" className="btn btn-lg btn-outline">
                        Xem cách hoạt động
                    </a>
                </div>

                {/* Stats */}
                <div
                    className="animate-fade-in-up animate-delay-4"
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 48,
                        marginTop: 60,
                        flexWrap: 'wrap',
                    }}
                >
                    {[
                        { stat: '18', label: 'Phases phát triển' },
                        { stat: '164+', label: 'Luồng xử lý' },
                        { stat: '99.9%', label: 'Uptime cam kết' },
                        { stat: '<200ms', label: 'Phản hồi realtime' },
                    ].map(({ stat, label }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary)' }}>
                                {stat}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                {label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Hero Visual — CSS Dashboard Mockup */}
                <div
                    className="animate-fade-in-up animate-delay-5"
                    style={{
                        marginTop: 64,
                        borderRadius: 'var(--radius-xl)',
                        background: 'var(--gradient-dark)',
                        padding: 3,
                        boxShadow: 'var(--shadow-xl), var(--shadow-glow)',
                        maxWidth: 960,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        overflow: 'hidden',
                    }}
                >
                    {/* Browser chrome dots */}
                    <div style={{
                        padding: '10px 16px',
                        display: 'flex',
                        gap: 8,
                        background: '#0f172a',
                        borderRadius: 'calc(var(--radius-xl) - 3px) calc(var(--radius-xl) - 3px) 0 0',
                    }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308' }} />
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
                        <div style={{
                            flex: 1, marginLeft: 16,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 6, padding: '3px 12px',
                            color: '#475569', fontSize: 11,
                            display: 'flex', alignItems: 'center',
                        }}>
                            app.nemarkchat.com/inbox
                        </div>
                    </div>
                    <HeroDashboardMockup />
                </div>
            </div>
        </section>
    );
}

/* ============================================
   Features Section
   ============================================ */
interface FeatureItem {
    icon: LucideIcon;
    title: string;
    desc: string;
    iconClass: string;
    image: string;
}

const features: FeatureItem[] = [
    {
        icon: Zap,
        title: 'Chat Realtime',
        desc: 'Tin nhắn gửi-nhận tức thì qua WebSocket. Typing indicator, read receipt, delivered — đầy đủ như Messenger.',
        iconClass: 'card-icon-primary',
        image: '/images/feature-realtime.png',
    },
    {
        icon: Globe,
        title: 'Widget nhúng dễ dàng',
        desc: 'Chỉ cần 1 dòng script. Widget tự động tải config, pre-chat form, business hours, và giao diện tuỳ chỉnh.',
        iconClass: 'card-icon-accent',
        image: '/images/feature-widget.png',
    },
    {
        icon: Users,
        title: 'Quản lý Team & RBAC',
        desc: 'Phân quyền chi tiết theo Role → Permission → Scope. Hỗ trợ multi-workspace, invite, assign, transfer.',
        iconClass: 'card-icon-violet',
        image: '/images/feature-team.png',
    },
    {
        icon: Shield,
        title: 'Bảo mật Enterprise',
        desc: 'Rate limit, anti-spam, audit log, GDPR compliance, soft delete & retention policy, DSAR request.',
        iconClass: 'card-icon-primary',
        image: '/images/feature-security.png',
    },
    {
        icon: Bot,
        title: 'AI & Tự động hoá',
        desc: 'Chatbot AI với RAG, auto-reply thông minh, confidence threshold, và tự động handover sang agent.',
        iconClass: 'card-icon-accent',
        image: '/images/feature-ai.png',
    },
    {
        icon: BarChart3,
        title: 'Analytics & CSAT',
        desc: 'Đo lường hiệu suất team, khảo sát CSAT sau mỗi hội thoại, báo cáo chi tiết realtime.',
        iconClass: 'card-icon-violet',
        image: '/images/feature-analytics.png',
    },
];

function Features() {
    return (
        <AnimatedSection id="features" className="section" style={{ background: 'var(--color-bg-soft)' }}>
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 64 }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-primary-50)',
                            color: 'var(--color-primary)',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 16,
                        }}
                    >
                        Tính năng nổi bật
                    </span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16 }}>
                        Mọi thứ bạn cần để{' '}
                        <span className="text-gradient">hỗ trợ khách hàng</span>
                    </h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
                        Từ chat realtime đến AI tự động — NemarkChat cung cấp giải pháp toàn diện cho doanh nghiệp mọi quy mô.
                    </p>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                        gap: 24,
                    }}
                >
                    {features.map((item, i) => {
                        const gradients: Record<string, string> = {
                            'card-icon-primary': 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.18) 100%)',
                            'card-icon-accent': 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(6,182,212,0.18) 100%)',
                            'card-icon-violet': 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(139,92,246,0.18) 100%)',
                        };
                        const glowColors: Record<string, string> = {
                            'card-icon-primary': 'rgba(99,102,241,0.3)',
                            'card-icon-accent': 'rgba(6,182,212,0.3)',
                            'card-icon-violet': 'rgba(139,92,246,0.3)',
                        };
                        return (
                            <div key={item.title} className="card" style={{ animationDelay: `${i * 0.1}s`, overflow: 'hidden', padding: 0 }}>
                                <div style={{
                                    height: 160,
                                    overflow: 'hidden',
                                    background: gradients[item.iconClass] || gradients['card-icon-primary'],
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                }}>
                                    {/* Decorative circles */}
                                    <div style={{
                                        position: 'absolute', top: -30, right: -30,
                                        width: 100, height: 100, borderRadius: '50%',
                                        background: glowColors[item.iconClass] || glowColors['card-icon-primary'],
                                        filter: 'blur(30px)', opacity: 0.5,
                                    }} />
                                    <div style={{
                                        position: 'absolute', bottom: -20, left: -20,
                                        width: 80, height: 80, borderRadius: '50%',
                                        background: glowColors[item.iconClass] || glowColors['card-icon-primary'],
                                        filter: 'blur(25px)', opacity: 0.3,
                                    }} />
                                    {/* Large icon */}
                                    <div className="feature-icon-hero" style={{
                                        width: 72, height: 72, borderRadius: 18,
                                        background: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: `0 8px 30px ${glowColors[item.iconClass] || glowColors['card-icon-primary']}`,
                                        transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                                        position: 'relative', zIndex: 1,
                                    }}>
                                        <item.icon size={32} color={item.iconClass === 'card-icon-accent' ? '#06b6d4' : item.iconClass === 'card-icon-violet' ? '#8b5cf6' : '#6366f1'} />
                                    </div>
                                </div>
                                <div style={{ padding: '24px' }}>
                                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
                                        {item.desc}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AnimatedSection>
    );
}

/* ============================================
   How It Works
   ============================================ */
function HowItWorks() {
    const steps = [
        {
            step: '01',
            icon: Settings,
            title: 'Thiết lập workspace',
            desc: 'Tạo workspace, cấu hình widget và phân quyền team chỉ trong vài phút.',
        },
        {
            step: '02',
            icon: MonitorSmartphone,
            title: 'Nhúng widget vào website',
            desc: 'Copy 1 dòng script vào website. Widget tự động tải giao diện, pre-chat form theo cấu hình.',
        },
        {
            step: '03',
            icon: MessageCircle,
            title: 'Bắt đầu trò chuyện',
            desc: 'Khách hàng nhắn tin qua widget, agent nhận và trả lời realtime từ Inbox portal.',
        },
        {
            step: '04',
            icon: BarChart3,
            title: 'Phân tích & tối ưu',
            desc: 'Theo dõi metrics, CSAT, SLA. AI gợi ý trả lời và tự động xử lý câu hỏi thường gặp.',
        },
    ];

    return (
        <AnimatedSection id="how-it-works" className="section">
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 64 }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full)',
                            background: '#ecfeff',
                            color: 'var(--color-accent)',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 16,
                        }}
                    >
                        Cách hoạt động
                    </span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16 }}>
                        Bắt đầu trong{' '}
                        <span className="text-gradient-accent">4 bước đơn giản</span>
                    </h2>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 32,
                        position: 'relative',
                    }}
                >
                    {steps.map((item, i) => (
                        <div
                            key={item.step}
                            style={{
                                textAlign: 'center',
                                padding: '40px 24px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)',
                                position: 'relative',
                                transition: 'all var(--transition-base)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                                e.currentTarget.style.transform = 'translateY(-4px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {/* Step number */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: -16,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    background: 'var(--gradient-hero)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: 12,
                                }}
                            >
                                {item.step}
                            </div>

                            <div
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--color-primary-50)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 20,
                                    color: 'var(--color-primary)',
                                }}
                            >
                                <item.icon size={28} />
                            </div>

                            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                                {item.desc}
                            </p>

                            {/* Arrow between steps */}
                            {i < steps.length - 1 && (
                                <div
                                    className="step-arrow"
                                    style={{
                                        position: 'absolute',
                                        right: -20,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-primary-light)',
                                    }}
                                >
                                    <ChevronRight size={24} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </AnimatedSection>
    );
}

/* ============================================
   Phases Roadmap
   ============================================ */
function PhasesRoadmap() {
    const phases = [
        { phase: 0, title: 'Nền tảng hệ thống', desc: 'Workspace, Widget, Permission, Error Handling', icon: Layers, color: '#6366f1' },
        { phase: 1, title: 'Auth Portal', desc: 'Login, Logout, Token rotation, Invite', icon: Lock, color: '#8b5cf6' },
        { phase: 2, title: 'Widget nhúng', desc: 'Script loader, Pre-chat form, Business hours', icon: MonitorSmartphone, color: '#06b6d4' },
        { phase: 3, title: 'Conversation HTTP', desc: 'Tạo/resume conversation, Metadata session', icon: MessageCircle, color: '#6366f1' },
        { phase: 4, title: 'Realtime Gateway', desc: 'WebSocket, Room management, Event sync', icon: Zap, color: '#8b5cf6' },
        { phase: 5, title: 'Messaging Core', desc: 'Gửi/nhận tin nhắn, ACK, Fanout, Pagination', icon: MessageCircle, color: '#06b6d4' },
        { phase: 6, title: 'Agent Inbox', desc: 'Danh sách hội thoại, Filter, Sort, Detail', icon: Headphones, color: '#6366f1' },
        { phase: 7, title: 'Read/Unread', desc: 'Typing, Delivered, Seen, Unread count', icon: Check, color: '#8b5cf6' },
        { phase: 8, title: 'Vòng đời hội thoại', desc: 'Assign, Transfer, Close, SLA, Queue', icon: Workflow, color: '#06b6d4' },
        { phase: 9, title: 'Tag/Note/Macro', desc: 'CRUD tag, Internal note, Quick replies', icon: FileText, color: '#6366f1' },
        { phase: 10, title: 'Presence', desc: 'Online/Offline/Away, Agent status', icon: Users, color: '#8b5cf6' },
        { phase: 11, title: 'Offline & Notify', desc: 'Email/Slack notify, Desktop notification', icon: Bell, color: '#06b6d4' },
        { phase: 12, title: 'File/Attachment', desc: 'Upload, Validate, Signed URL, Retention', icon: FileText, color: '#6366f1' },
        { phase: 13, title: 'Search', desc: 'Full-text search, Filter, Highlight', icon: Search, color: '#8b5cf6' },
        { phase: 14, title: 'Audit & Privacy', desc: 'Audit log, Soft delete, GDPR, DSAR', icon: Shield, color: '#06b6d4' },
        { phase: 15, title: 'Admin Console', desc: 'User CRUD, Role matrix, Config đầy đủ', icon: Settings, color: '#6366f1' },
        { phase: 16, title: 'Security', desc: 'Rate limit, Spam detection, Observability', icon: Shield, color: '#8b5cf6' },
        { phase: 17, title: 'Integrations', desc: 'Webhooks, Job queue, CRM connector', icon: Globe, color: '#06b6d4' },
        { phase: 18, title: 'AI + CSAT', desc: 'AI auto-reply, RAG, Survey, Analytics', icon: Bot, color: '#6366f1' },
    ];

    const [activeTab, setActiveTab] = useState<'mvp' | 'prod' | 'enterprise'>('mvp');

    const tabFilters = {
        mvp: { max: 8, label: 'MVP', desc: 'Live chat đúng nghĩa' },
        prod: { max: 16, label: 'Production', desc: 'Vận hành ổn định' },
        enterprise: { max: 18, label: 'Enterprise', desc: 'Đầy đủ tính năng' },
    };

    const filtered = phases.filter((p) => p.phase <= tabFilters[activeTab].max);

    return (
        <AnimatedSection id="phases" className="section" style={{ background: 'var(--color-bg-soft)' }}>
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full)',
                            background: '#f5f3ff',
                            color: 'var(--color-violet)',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 16,
                        }}
                    >
                        Lộ trình phát triển
                    </span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16 }}>
                        <span className="text-gradient">18 Phases</span> xây dựng hoàn chỉnh
                    </h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
                        Kiến trúc được thiết kế từ nền tảng, mở rộng dần từng phase theo nhu cầu thực tế.
                    </p>
                </div>

                {/* Tab buttons */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
                    {(['mvp', 'prod', 'enterprise'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '10px 24px',
                                borderRadius: 'var(--radius-full)',
                                border: activeTab === tab ? 'none' : '1px solid var(--color-border)',
                                background: activeTab === tab ? 'var(--gradient-hero)' : 'white',
                                color: activeTab === tab ? 'white' : 'var(--color-text-secondary)',
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: 'pointer',
                                transition: 'all var(--transition-base)',
                            }}
                        >
                            {tabFilters[tab].label}
                            <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 12 }}>
                                ({tabFilters[tab].desc})
                            </span>
                        </button>
                    ))}
                </div>

                {/* Phase grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: 16,
                    }}
                >
                    {filtered.map((item) => (
                        <div
                            key={item.phase}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 16,
                                padding: '20px 24px',
                                borderRadius: 'var(--radius-md)',
                                background: 'white',
                                border: '1px solid var(--color-border)',
                                transition: 'all var(--transition-base)',
                                cursor: 'default',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                e.currentTarget.style.borderColor = item.color;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.borderColor = 'var(--color-border)';
                            }}
                        >
                            <div
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    background: `${item.color}15`,
                                    color: item.color,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <item.icon size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: `${item.color}15`,
                                            color: item.color,
                                        }}
                                    >
                                        P{item.phase}
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</span>
                                </div>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                                    {item.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AnimatedSection>
    );
}

/* ============================================
   Pricing Section
   ============================================ */
function Pricing() {
    const plans = [
        {
            name: 'Starter',
            price: 'Miễn phí',
            period: '',
            desc: 'Dành cho cá nhân và startup',
            features: ['1 workspace', '2 agent', 'Chat widget cơ bản', 'Lịch sử 30 ngày', 'Phase 0–5'],
            cta: 'Bắt đầu miễn phí',
            highlight: false,
        },
        {
            name: 'Professional',
            price: '499k',
            period: '/tháng',
            desc: 'Dành cho doanh nghiệp vừa',
            features: [
                '5 workspaces',
                '20 agents',
                'Widget tuỳ chỉnh đầy đủ',
                'Lịch sử không giới hạn',
                'Phase 0–12',
                'File & Attachment',
                'Tag/Note/Macro',
                'Email notification',
            ],
            cta: 'Dùng thử 14 ngày',
            highlight: true,
        },
        {
            name: 'Enterprise',
            price: 'Liên hệ',
            period: '',
            desc: 'Dành cho tổ chức lớn',
            features: [
                'Không giới hạn workspace',
                'Không giới hạn agent',
                'Toàn bộ 18 phases',
                'AI + CSAT',
                'Webhooks & Integrations',
                'Audit log & GDPR',
                'SLA guarantee',
                'Dedicated support',
            ],
            cta: 'Liên hệ sales',
            highlight: false,
        },
    ];

    return (
        <AnimatedSection id="pricing" className="section">
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 64 }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-primary-50)',
                            color: 'var(--color-primary)',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 16,
                        }}
                    >
                        Báo giá
                    </span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16 }}>
                        Chọn gói phù hợp với{' '}
                        <span className="text-gradient">doanh nghiệp bạn</span>
                    </h2>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: 24,
                        alignItems: 'stretch',
                    }}
                >
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            style={{
                                borderRadius: 'var(--radius-lg)',
                                padding: plan.highlight ? 3 : 0,
                                background: plan.highlight ? 'var(--gradient-hero)' : 'transparent',
                            }}
                        >
                            <div
                                style={{
                                    background: plan.highlight ? 'white' : 'var(--color-bg)',
                                    borderRadius: plan.highlight ? 'calc(var(--radius-lg) - 3px)' : 'var(--radius-lg)',
                                    border: plan.highlight ? 'none' : '1px solid var(--color-border)',
                                    padding: '40px 32px',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative',
                                    transition: 'all var(--transition-base)',
                                }}
                            >
                                {plan.highlight && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: -12,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            background: 'var(--gradient-hero)',
                                            color: 'white',
                                            padding: '4px 16px',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: 12,
                                            fontWeight: 600,
                                        }}
                                    >
                                        Phổ biến nhất
                                    </div>
                                )}

                                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{plan.name}</h3>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
                                    {plan.desc}
                                </p>

                                <div style={{ marginBottom: 32 }}>
                                    <span style={{ fontSize: 42, fontWeight: 800 }}>{plan.price}</span>
                                    {plan.period && (
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: 15 }}>
                                            {plan.period}
                                        </span>
                                    )}
                                </div>

                                <ul style={{ listStyle: 'none', marginBottom: 32, flex: 1 }}>
                                    {plan.features.map((f) => (
                                        <li
                                            key={f}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '8px 0',
                                                color: 'var(--color-text-secondary)',
                                                fontSize: 14,
                                            }}
                                        >
                                            <Check size={16} color="var(--color-primary)" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <a
                                    href="#"
                                    className={`btn ${plan.highlight ? 'btn-primary' : 'btn-outline'}`}
                                    style={{ width: '100%', justifyContent: 'center' }}
                                >
                                    {plan.cta}
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AnimatedSection>
    );
}

/* ============================================
   CTA Section
   ============================================ */
function CtaSection() {
    return (
        <AnimatedSection className="section">
            <div className="container">
                <div
                    style={{
                        background: 'var(--gradient-dark)',
                        borderRadius: 'var(--radius-xl)',
                        padding: 'clamp(48px, 6vw, 80px) clamp(24px, 4vw, 64px)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Glow effects */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -100,
                            right: -100,
                            width: 300,
                            height: 300,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: -100,
                            left: -100,
                            width: 300,
                            height: 300,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)',
                        }}
                    />

                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <h2
                            style={{
                                fontSize: 'clamp(28px, 4vw, 42px)',
                                fontWeight: 800,
                                color: 'white',
                                marginBottom: 16,
                            }}
                        >
                            Sẵn sàng nâng cấp trải nghiệm khách hàng?
                        </h2>
                        <p
                            style={{
                                color: '#94a3b8',
                                fontSize: 17,
                                maxWidth: 500,
                                margin: '0 auto 32px',
                                lineHeight: 1.7,
                            }}
                        >
                            Bắt đầu dùng NemarkChat miễn phí ngay hôm nay. Không cần thẻ tín dụng, không ràng buộc.
                        </p>
                        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <a href="#" className="btn btn-lg btn-primary">
                                Đăng ký miễn phí
                                <ArrowRight size={18} />
                            </a>
                            <a
                                href="#"
                                className="btn btn-lg"
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'white',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                }}
                            >
                                Đặt lịch demo
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </AnimatedSection>
    );
}

/* ============================================
   Footer
   ============================================ */
function Footer() {
    return (
        <footer
            style={{
                borderTop: '1px solid var(--color-border)',
                padding: '64px 0 32px',
            }}
        >
            <div className="container">
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 48,
                        marginBottom: 48,
                    }}
                >
                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <img src="/images/logo.png" alt="NemarkChat" style={{ width: 36, height: 36, borderRadius: 10 }} />
                            <span style={{ fontWeight: 800, fontSize: 18 }}>
                                Nemark<span style={{ color: 'var(--color-primary)' }}>Chat</span>
                            </span>
                        </div>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.7, maxWidth: 280 }}>
                            Nền tảng live chat thế hệ mới giúp doanh nghiệp kết nối khách hàng nhanh chóng và hiệu quả.
                        </p>
                    </div>

                    {/* Links */}
                    {[
                        {
                            title: 'Sản phẩm',
                            links: [
                                { label: 'Tính năng', href: '/#features' },
                                { label: 'Báo giá', href: '/#pricing' },
                                { label: 'Lộ trình', href: '/#phases' },
                                { label: 'API Docs', href: '/help' },
                                { label: 'Changelog', href: '/changelog' },
                            ],
                        },
                        {
                            title: 'Công ty',
                            links: [
                                { label: 'Giới thiệu', href: '/about' },
                                { label: 'Blog', href: '/blog' },
                                { label: 'Tuyển dụng', href: '/about' },
                                { label: 'Liên hệ', href: '/contact' },
                            ],
                        },
                        {
                            title: 'Hỗ trợ',
                            links: [
                                { label: 'Trung tâm trợ giúp', href: '/help' },
                                { label: 'Cộng đồng', href: '/blog' },
                                { label: 'Trạng thái hệ thống', href: '/status' },
                                { label: 'Chính sách bảo mật', href: '/privacy' },
                            ],
                        },
                    ].map((col) => (
                        <div key={col.title}>
                            <h4 style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: 'var(--color-text)' }}>
                                {col.title}
                            </h4>
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {col.links.map((link) => (
                                    <li key={link.label}>
                                        <a
                                            href={link.href}
                                            style={{
                                                color: 'var(--color-text-muted)',
                                                textDecoration: 'none',
                                                fontSize: 14,
                                                transition: 'color var(--transition-fast)',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div
                    style={{
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: 24,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 16,
                    }}
                >
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                        © 2026 NemarkChat. Mọi quyền được bảo lưu.
                    </p>
                    <div style={{ display: 'flex', gap: 24 }}>
                        {[
                            { label: 'Điều khoản', href: '/terms' },
                            { label: 'Bảo mật', href: '/privacy' },
                            { label: 'Liên hệ', href: '/contact' },
                        ].map((item) => (
                            <a
                                key={item.label}
                                href={item.href}
                                style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: 13 }}
                            >
                                {item.label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}

/* ============================================
   Main Page
   ============================================ */
export default function HomePage() {
    return (
        <>
            <Head>
                <title>NemarkChat — Nền tảng Live Chat thế hệ mới</title>
                <meta
                    name="description"
                    content="NemarkChat giúp doanh nghiệp quản lý hội thoại đa kênh, phân quyền team linh hoạt, và tự động hoá hỗ trợ khách hàng."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/images/favicon.png" type="image/png" />
                <meta property="og:title" content="NemarkChat — Nền tảng Live Chat thế hệ mới" />
                <meta property="og:description" content="NemarkChat giúp doanh nghiệp quản lý hội thoại đa kênh, phân quyền team linh hoạt, và tự động hoá hỗ trợ khách hàng." />
                <meta property="og:image" content="/images/og-image.png" />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="NemarkChat — Nền tảng Live Chat thế hệ mới" />
                <meta name="twitter:description" content="Hệ thống live chat thông minh cho doanh nghiệp" />
                <meta name="twitter:image" content="/images/og-image.png" />
            </Head>

            <Header />
            <main>
                <Hero />
                <Features />
                <HowItWorks />
                <PhasesRoadmap />
                <Pricing />
                <CtaSection />
            </main>
            <Footer />

            <style jsx global>{`
        .nav-desktop {
          display: flex;
        }
        .nav-cta-login {
          display: inline-flex !important;
        }
        .step-arrow {
          display: block;
        }
        @media (max-width: 768px) {
          .nav-desktop {
            display: none !important;
          }
          .nav-cta-login {
            display: none !important;
          }
          .step-arrow {
            display: none !important;
          }
        }
      `}</style>
        </>
    );
}
