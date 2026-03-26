import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Spin } from 'antd';
import AppLayout from '../../../components/layout/AppLayout';
import WorkspaceDashboard from '../../../features/workspace/components/WorkspaceDashboard';

export default function WorkspaceDashboardPage() {
    const router = useRouter();
    const { workspaceId } = router.query;
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const t = localStorage.getItem('nemark_token');
        setReady(true);
        if (!t) router.replace('/auth/login');
    }, [router]);

    if (!ready || !workspaceId) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <AppLayout headerTitle="Tổng quan Workspace">
            <Head><title>Tổng quan Workspace | NemarkChat</title></Head>
            <main className="w-full h-full p-6">
                <WorkspaceDashboard workspaceId={workspaceId as string} />
            </main>
        </AppLayout>
    );
}
