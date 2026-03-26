import StaticPageLayout from '../components/layout/StaticPageLayout';
import { Users, Target, Heart, Globe, Zap, Shield } from 'lucide-react';

export default function AboutPage() {
    return (
        <StaticPageLayout title="Giới thiệu" description="Tìm hiểu về NemarkChat - nền tảng live chat thế hệ mới cho doanh nghiệp Việt Nam.">
            <div style={{ textAlign: 'center', marginBottom: 64 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16, letterSpacing: '-0.02em' }}>
                    Về <span className="text-gradient">NemarkChat</span>
                </h1>
                <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1.8, maxWidth: 600, margin: '0 auto' }}>
                    Chúng tôi xây dựng nền tảng live chat thông minh, giúp doanh nghiệp Việt Nam kết nối với khách hàng một cách nhanh chóng và hiệu quả nhất.
                </p>
            </div>

            {/* Mission */}
            <section style={{ marginBottom: 48 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                        <Target size={20} />
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Sứ mệnh</h2>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, fontSize: 16 }}>
                    NemarkChat ra đời với mục tiêu đơn giản: giúp mọi doanh nghiệp, từ startup nhỏ đến tập đoàn lớn, có thể hỗ trợ khách hàng theo thời gian thực với chi phí hợp lý nhất. Chúng tôi tin rằng trải nghiệm khách hàng tốt bắt đầu từ giao tiếp nhanh chóng và thông minh.
                </p>
            </section>

            {/* Values */}
            <section style={{ marginBottom: 48 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ecfeff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                        <Heart size={20} />
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Giá trị cốt lõi</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                    {[
                        { icon: Zap, title: 'Tốc độ', desc: 'Phản hồi realtime dưới 200ms, không để khách hàng phải chờ đợi.' },
                        { icon: Shield, title: 'Bảo mật', desc: 'Bảo vệ dữ liệu khách hàng với tiêu chuẩn enterprise-grade.' },
                        { icon: Users, title: 'Đội ngũ', desc: 'Phân quyền linh hoạt, quản lý team dễ dàng mọi quy mô.' },
                        { icon: Globe, title: 'Đa kênh', desc: 'Tích hợp Website, Zalo, Facebook trong một nền tảng duy nhất.' },
                    ].map((item) => (
                        <div key={item.title} style={{ padding: 24, borderRadius: 16, border: '1px solid var(--color-border)', background: 'white' }}>
                            <item.icon size={24} style={{ color: 'var(--color-primary)', marginBottom: 12 }} />
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
                            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Story */}
            <section style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Câu chuyện của chúng tôi</h2>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, fontSize: 16 }}>
                    NemarkChat được phát triển bởi đội ngũ Nemark Digital — một nhóm kỹ sư trẻ đam mê công nghệ tại Việt Nam. Sau nhiều năm làm việc với các hệ thống hỗ trợ khách hàng, chúng tôi nhận ra rằng thị trường cần một giải pháp live chat đơn giản hơn, nhanh hơn, và phù hợp hơn với doanh nghiệp Việt.
                </p>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, fontSize: 16, marginTop: 16 }}>
                    Với kiến trúc 18 phases được thiết kế cẩn thận, NemarkChat mang đến trải nghiệm từ MVP cho startup đến Enterprise cho tập đoàn lớn — tất cả trên cùng một nền tảng.
                </p>
            </section>

            <div style={{ textAlign: 'center', marginTop: 48, padding: '40px 32px', borderRadius: 20, background: 'var(--gradient-dark)' }}>
                <h3 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Sẵn sàng dùng thử?</h3>
                <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 15 }}>Bắt đầu miễn phí, không cần thẻ tín dụng.</p>
                <a href="/auth/register" className="btn btn-primary">Đăng ký miễn phí</a>
            </div>
        </StaticPageLayout>
    );
}
