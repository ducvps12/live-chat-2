import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Button, Dropdown, Spin } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useGetMe, useLogout } from '../../domains/auth/auth.hooks';
import ProfileManagement from '../../features/profile/components/ProfileManagement';
import AppLayout from '../../components/layout/AppLayout';

export default function ProfilePage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const { mutateAsync: logout } = useLogout();

    useEffect(() => {
        const stored = localStorage.getItem('nemark_token');
        setReady(true);
        if (!stored) router.replace('/auth/login');
    }, [router]);

    const { data: meData, isLoading: meLoading, isError: meError } = useGetMe(ready);

    const handleLogout = async () => {
        await logout();
        router.push('/auth/login');
    };

    if (!ready || meLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (meError || !meData?.data?.user) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <div className="card" style={{ padding: 40, textAlign: 'center', maxWidth: 400 }}>
                    <h2 style={{ marginBottom: 12 }}>Phiên đăng nhập hết hạn</h2>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>Vui lòng đăng nhập lại.</p>
                    <a href="/auth/login" className="btn btn-primary" style={{ display: 'inline-block' }}>Đăng nhập</a>
                </div>
            </div>
        );
    }

    const user = meData.data.user;

    return (
        <AppLayout headerTitle="Hồ sơ cá nhân">
            <Head><title>Hồ sơ cá nhân | NemarkChat</title></Head>

            {/* ─── Content ─── */}
            <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
                <ProfileManagement />
            </main>
        </AppLayout>
    );
}
