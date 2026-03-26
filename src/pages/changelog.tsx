import StaticPageLayout from '../components/layout/StaticPageLayout';
import { Rocket, Bug, Sparkles, Wrench } from 'lucide-react';

const changelog = [
    {
        version: 'v2.5.0',
        date: '22/03/2026',
        type: 'feature',
        title: 'Facebook Messenger Integration',
        items: [
            'Tích hợp Facebook Messenger — nhận & trả lời tin nhắn từ fan page',
            'Quản lý leads từ Facebook',
            'Auto-sync contacts giữa Facebook và NemarkChat',
        ],
    },
    {
        version: 'v2.4.0',
        date: '18/03/2026',
        type: 'feature',
        title: 'Subscription & Billing',
        items: [
            'Hệ thống subscription plans (Free, Pro, Enterprise)',
            'Trang billing quản lý thanh toán',
            'Usage tracking và quota management',
        ],
    },
    {
        version: 'v2.3.0',
        date: '15/03/2026',
        type: 'feature',
        title: 'Lead Management',
        items: [
            'Module quản lý leads mới',
            'Lead scoring và pipeline tracking',
            'Export leads ra CSV/Excel',
        ],
    },
    {
        version: 'v2.2.0',
        date: '10/03/2026',
        type: 'feature',
        title: 'Analytics Dashboard',
        items: [
            'Dashboard analytics chi tiết',
            'Báo cáo hiệu suất agent theo thời gian thực',
            'Biểu đồ CSAT và response time',
        ],
    },
    {
        version: 'v2.1.0',
        date: '05/03/2026',
        type: 'improvement',
        title: 'UI/UX Improvements',
        items: [
            'Cải thiện giao diện workspace dashboard',
            'Thêm banner images cho landing page',
            'Tối ưu hiệu suất load trang',
        ],
    },
    {
        version: 'v2.0.0',
        date: '01/03/2026',
        type: 'feature',
        title: 'Zalo OA Integration',
        items: [
            'Tích hợp Zalo Official Account',
            'QR code login cho Zalo',
            'Realtime sync tin nhắn Zalo',
        ],
    },
    {
        version: 'v1.0.0',
        date: '15/02/2026',
        type: 'feature',
        title: 'Initial Release',
        items: [
            'Realtime chat với WebSocket',
            'Widget nhúng website',
            'Quản lý workspace, team, contacts',
            'Macro / canned responses',
            'Offline messages',
        ],
    },
];

const typeConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    feature: { icon: Rocket, color: '#6366f1', bg: '#eff0fe', label: 'Tính năng mới' },
    improvement: { icon: Sparkles, color: '#06b6d4', bg: '#ecfeff', label: 'Cải thiện' },
    bugfix: { icon: Bug, color: '#ef4444', bg: '#fef2f2', label: 'Sửa lỗi' },
    maintenance: { icon: Wrench, color: '#f59e0b', bg: '#fffbeb', label: 'Bảo trì' },
};

export default function ChangelogPage() {
    return (
        <StaticPageLayout title="Changelog" description="Lịch sử cập nhật và các tính năng mới của NemarkChat.">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16 }}>
                    <span className="text-gradient">Changelog</span>
                </h1>
                <p style={{ fontSize: 17, color: 'var(--color-text-secondary)' }}>
                    Theo dõi các bản cập nhật và tính năng mới của NemarkChat.
                </p>
            </div>

            <div style={{ position: 'relative' }}>
                {/* Timeline line */}
                <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 2, background: 'var(--color-border)' }} />

                {changelog.map((entry) => {
                    const config = typeConfig[entry.type] || typeConfig.feature;
                    const Icon = config.icon;
                    return (
                        <div key={entry.version} style={{ display: 'flex', gap: 20, marginBottom: 32, position: 'relative' }}>
                            <div style={{ width: 38, height: 38, borderRadius: 12, background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, border: '3px solid white' }}>
                                <Icon size={16} style={{ color: config.color }} />
                            </div>
                            <div style={{ flex: 1, padding: 24, borderRadius: 16, border: '1px solid var(--color-border)', background: 'white' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 14, color: config.color, background: config.bg, padding: '2px 10px', borderRadius: 20 }}>{entry.version}</span>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{entry.date}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: config.color }}>{config.label}</span>
                                </div>
                                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{entry.title}</h3>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {entry.items.map((item) => (
                                        <li key={item} style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    );
                })}
            </div>
        </StaticPageLayout>
    );
}
