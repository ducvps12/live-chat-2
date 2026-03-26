import StaticPageLayout from '../components/layout/StaticPageLayout';
import { Mail, MapPin, Phone, Clock, Send } from 'lucide-react';
import { useState } from 'react';

export default function ContactPage() {
    const [submitted, setSubmitted] = useState(false);

    return (
        <StaticPageLayout title="Liên hệ" description="Liên hệ với team NemarkChat để được tư vấn và hỗ trợ.">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16 }}>
                    <span className="text-gradient">Liên hệ</span> với chúng tôi
                </h1>
                <p style={{ fontSize: 17, color: 'var(--color-text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                    Bạn có câu hỏi hoặc cần tư vấn? Hãy liên hệ ngay, chúng tôi sẽ phản hồi trong vòng 24 giờ.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 48 }}>
                {[
                    { icon: Mail, title: 'Email', info: 'support@nemarkchat.com', sub: 'Gửi email bất kỳ lúc nào' },
                    { icon: Phone, title: 'Hotline', info: '1900 xxxx', sub: 'Thứ 2 - Thứ 6, 8h - 18h' },
                    { icon: MapPin, title: 'Địa chỉ', info: 'TP. Hồ Chí Minh', sub: 'Việt Nam' },
                    { icon: Clock, title: 'Giờ hỗ trợ', info: '8:00 - 22:00', sub: 'Tất cả các ngày trong tuần' },
                ].map((item) => (
                    <div key={item.title} style={{ padding: 24, borderRadius: 16, border: '1px solid var(--color-border)', background: 'white', textAlign: 'center' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--color-primary-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', marginBottom: 16 }}>
                            <item.icon size={22} />
                        </div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{item.title}</h3>
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>{item.info}</p>
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{item.sub}</p>
                    </div>
                ))}
            </div>

            {/* Contact Form */}
            <div style={{ padding: 32, borderRadius: 20, border: '1px solid var(--color-border)', background: 'white' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Gửi tin nhắn cho chúng tôi</h2>
                {submitted ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', marginBottom: 16 }}>
                            <Send size={28} />
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Đã gửi thành công!</h3>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Chúng tôi sẽ phản hồi bạn trong vòng 24 giờ.</p>
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>Họ tên *</label>
                                <input required type="text" placeholder="Nguyễn Văn A" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>Email *</label>
                                <input required type="email" placeholder="email@company.com" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, outline: 'none' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>Chủ đề</label>
                            <input type="text" placeholder="Tôi muốn tìm hiểu về gói Enterprise" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>Nội dung *</label>
                            <textarea required rows={5} placeholder="Mô tả chi tiết nhu cầu của bạn..." style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 14, outline: 'none', resize: 'vertical' }} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                            Gửi tin nhắn
                        </button>
                    </form>
                )}
            </div>
        </StaticPageLayout>
    );
}
