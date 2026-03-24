import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Spin } from 'antd';
import AppLayout from '../../../components/layout/AppLayout';
import WorkspaceSettingsForm from '../../../features/workspace/components/WorkspaceSettingsForm';
import ZaloIntegrationSettings from '../../../features/workspace/components/ZaloIntegrationSettings';
import FacebookIntegrationSettings from '../../../features/workspace/components/FacebookIntegrationSettings';

export default function WorkspaceSettingsPage() {
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
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <AppLayout headerTitle="Cài đặt Workspace">
            <Head><title>Cài đặt Workspace | NemarChat</title></Head>
            <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
                <WorkspaceSettingsForm workspaceId={workspaceId as string} />
                <ZaloIntegrationSettings workspaceId={workspaceId as string} />
                <FacebookIntegrationSettings workspaceId={workspaceId as string} />
            </main>
        </AppLayout>
    );
}
