import StaticPageLayout from '../components/layout/StaticPageLayout';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const services = [
    { name: 'API Server', status: 'operational', uptime: '99.98%' },
    { name: 'WebSocket (Realtime)', status: 'operational', uptime: '99.95%' },
    { name: 'Widget CDN', status: 'operational', uptime: '99.99%' },
    { name: 'Dashboard Frontend', status: 'operational', uptime: '99.97%' },
    { name: 'MongoDB Database', status: 'operational', uptime: '99.99%' },
    { name: 'Zalo Integration', status: 'operational', uptime: '99.90%' },
    { name: 'Facebook Integration', status: 'operational', uptime: '99.92%' },
    { name: 'File Upload / Storage', status: 'operational', uptime: '99.96%' },
];

const incidents = [
    {
        date: '20/03/2026',
        title: 'Tối ưu hiệu suất WebSocket',
        status: 'resolved',
        description: 'Đã tối ưu kết nối WebSocket cho các workspace lớn (>50 agents online). Thời gian khắc phục: 15 phút.',
    },
    {
        date: '12/03/2026',
        title: 'Bảo trì định kỳ hệ thống',
        status: 'resolved',
        description: 'Bảo trì nâng cấp database và server. Dịch vụ bị gián đoạn trong 5 phút.',
    },
];

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    operational: { icon: CheckCircle2, color: '#16a34a', bg: '#dcfce7', label: 'Hoạt động' },
    degraded: { icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', label: 'Giảm hiệu suất' },
    outage: { icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2', label: 'Sự cố' },
    maintenance: { icon: Clock, color: '#6366f1', bg: '#eff0fe', label: 'Bảo trì' },
};

export default function StatusPage() {
    return (
        <StaticPageLayout title="Trạng thái hệ thống" description="Theo dõi trạng thái hoạt động của các dịch vụ NemarkChat.">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 16 }}>
                    Trạng thái <span className="text-gradient">hệ thống</span>
                </h1>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', fontWeight: 600, fontSize: 14 }}>
                    <CheckCircle2 size={16} />
                    Tất cả dịch vụ đang hoạt động bình thường
                </div>
            </div>

            {/* Services */}
            <div style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Dịch vụ</h2>
                <div style={{ borderRadius: 16, border: '1px solid var(--color-border)', overflow: 'hidden', background: 'white' }}>
                    {services.map((svc, i) => {
                        const cfg = statusConfig[svc.status];
                        const Icon = cfg.icon;
                        return (
                            <div
                                key={svc.name}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '16px 20px',
                                    borderBottom: i < services.length - 1 ? '1px solid var(--color-border)' : 'none',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Icon size={18} style={{ color: cfg.color }} />
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{svc.name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Uptime: {svc.uptime}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '3px 10px', borderRadius: 20 }}>{cfg.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Incidents */}
            <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Sự cố gần đây</h2>
                {incidents.map((inc) => (
                    <div key={inc.title} style={{ padding: 20, borderRadius: 14, border: '1px solid var(--color-border)', background: 'white', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{inc.date}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>Đã giải quyết</span>
                        </div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{inc.title}</h3>
                        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>{inc.description}</p>
                    </div>
                ))}
            </div>
        </StaticPageLayout>
    );
}
