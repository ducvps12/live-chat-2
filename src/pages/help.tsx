import StaticPageLayout from '../components/layout/StaticPageLayout';
import { Search, MessageCircle, Settings, Users, Code, Zap, Shield, BarChart3, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const categories = [
    {
        icon: MessageCircle,
        title: 'Chat & Hội thoại',
        color: '#6366f1',
        bg: '#eff0fe',
        articles: [
            'Cách gửi và nhận tin nhắn',
            'Sử dụng nội bộ note trong hội thoại',
            'Phân công hội thoại cho agent',
            'Transfer hội thoại giữa các agent',
            'Đánh dấu và lọc hội thoại',
        ],
    },
    {
        icon: Code,
        title: 'Widget & Tích hợp',
        color: '#06b6d4',
        bg: '#ecfeff',
        articles: [
            'Cách nhúng widget vào website',
            'Tuỳ chỉnh giao diện widget',
            'Cấu hình pre-chat form',
            'Thiết lập business hours',
            'Tích hợp Zalo OA',
        ],
    },
    {
        icon: Users,
        title: 'Team & Workspace',
        color: '#8b5cf6',
        bg: '#f3f0ff',
        articles: [
            'Tạo workspace mới',
            'Mời thành viên vào workspace',
            'Phân quyền Role & Permission',
            'Quản lý nhiều workspace',
            'Xoá hoặc rời workspace',
        ],
    },
    {
        icon: Settings,
        title: 'Tài khoản & Cài đặt',
        color: '#f59e0b',
        bg: '#fffbeb',
        articles: [
            'Đổi mật khẩu',
            'Cập nhật thông tin cá nhân',
            'Cài đặt thông báo',
            'Xoá tài khoản',
            'Two-Factor Authentication',
        ],
    },
    {
        icon: BarChart3,
        title: 'Analytics & Báo cáo',
        color: '#10b981',
        bg: '#ecfdf5',
        articles: [
            'Xem báo cáo dashboard',
            'Hiểu các chỉ số KPI',
            'Xuất báo cáo Excel/CSV',
            'Thiết lập CSAT survey',
            'Theo dõi hiệu suất agent',
        ],
    },
    {
        icon: Shield,
        title: 'Bảo mật & Quyền riêng tư',
        color: '#ef4444',
        bg: '#fef2f2',
        articles: [
            'Chính sách bảo mật dữ liệu',
            'GDPR & DSAR request',
            'Audit log',
            'Quản lý sessions',
            'Rate limiting & Anti-spam',
        ],
    },
];

export default function HelpPage() {
    const [search, setSearch] = useState('');

    const filtered = search.trim()
        ? categories.map((cat) => ({
              ...cat,
              articles: cat.articles.filter((a) => a.toLowerCase().includes(search.toLowerCase())),
          })).filter((cat) => cat.articles.length > 0)
        : categories;

    return (
        <StaticPageLayout title="Trung tâm trợ giúp" description="Tìm câu trả lời nhanh cho mọi câu hỏi về NemarkChat.">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16 }}>
                    Trung tâm <span className="text-gradient">trợ giúp</span>
                </h1>
                <p style={{ fontSize: 17, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
                    Tìm câu trả lời nhanh cho mọi câu hỏi về NemarkChat.
                </p>

                {/* Search */}
                <div style={{ position: 'relative', maxWidth: 500, margin: '0 auto' }}>
                    <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm kiếm bài viết..."
                        style={{
                            width: '100%',
                            padding: '14px 16px 14px 48px',
                            borderRadius: 14,
                            border: '2px solid var(--color-border)',
                            fontSize: 15,
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
                {filtered.map((cat) => {
                    const Icon = cat.icon;
                    return (
                        <div key={cat.title} style={{ padding: 24, borderRadius: 16, border: '1px solid var(--color-border)', background: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color }}>
                                    <Icon size={20} />
                                </div>
                                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{cat.title}</h3>
                            </div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {cat.articles.map((article) => (
                                    <li key={article}>
                                        <a
                                            href="#"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '10px 0',
                                                borderBottom: '1px solid #f1f5f9',
                                                color: 'var(--color-text-secondary)',
                                                textDecoration: 'none',
                                                fontSize: 14,
                                                transition: 'color 0.15s',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                                        >
                                            {article}
                                            <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center', marginTop: 48, padding: '32px 24px', borderRadius: 16, background: '#f8fafc', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Không tìm thấy câu trả lời?</h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: 14 }}>Liên hệ trực tiếp với team hỗ trợ qua email hoặc live chat.</p>
                <a href="/contact" className="btn btn-primary">Liên hệ hỗ trợ</a>
            </div>
        </StaticPageLayout>
    );
}
