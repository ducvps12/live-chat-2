import StaticPageLayout from '../components/layout/StaticPageLayout';
import { Calendar, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const posts = [
    {
        title: 'Cách tích hợp NemarkChat vào website chỉ trong 5 phút',
        excerpt: 'Hướng dẫn chi tiết cách lấy mã nhúng script và tùy chỉnh widget chat cho website của bạn.',
        date: '20/03/2026',
        category: 'Hướng dẫn',
        gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    },
    {
        title: 'NemarkChat Phase 10 — Tích hợp Zalo OA',
        excerpt: 'Chúng tôi vừa ra mắt tính năng tích hợp Zalo Official Account, cho phép quản lý tin nhắn Zalo ngay trong NemarkChat.',
        date: '18/03/2026',
        category: 'Sản phẩm',
        gradient: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
    },
    {
        title: 'Top 5 mẹo cải thiện thời gian phản hồi khách hàng',
        excerpt: 'Chia sẻ từ kinh nghiệm thực tế giúp bạn giảm thời gian phản hồi xuống dưới 30 giây.',
        date: '15/03/2026',
        category: 'Mẹo hay',
        gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    },
    {
        title: 'So sánh NemarkChat với các nền tảng live chat phổ biến',
        excerpt: 'Tìm hiểu điểm khác biệt giữa NemarkChat, Tawk.to, LiveChat, và Intercom.',
        date: '10/03/2026',
        category: 'So sánh',
        gradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
    },
    {
        title: 'Bảo mật dữ liệu chat — Các tiêu chuẩn NemarkChat áp dụng',
        excerpt: 'Tìm hiểu về GDPR compliance, audit log, và các biện pháp bảo mật mà NemarkChat triển khai.',
        date: '05/03/2026',
        category: 'Bảo mật',
        gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
    },
];

export default function BlogPage() {
    return (
        <StaticPageLayout title="Blog" description="Cập nhật tin tức, hướng dẫn, và mẹo sử dụng NemarkChat.">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16 }}>
                    <span className="text-gradient">Blog</span>
                </h1>
                <p style={{ fontSize: 17, color: 'var(--color-text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                    Tin tức, hướng dẫn, và chia sẻ kinh nghiệm từ team NemarkChat.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {posts.map((post) => (
                    <article
                        key={post.title}
                        style={{
                            display: 'flex',
                            gap: 20,
                            padding: 24,
                            borderRadius: 16,
                            border: '1px solid var(--color-border)',
                            background: 'white',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ width: 80, height: 80, borderRadius: 14, background: post.gradient, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 28 }}>📝</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>{post.category}</span>
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar size={12} /> {post.date}
                                </span>
                            </div>
                            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: 'var(--color-text)' }}>{post.title}</h3>
                            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>{post.excerpt}</p>
                        </div>
                    </article>
                ))}
            </div>
        </StaticPageLayout>
    );
}
