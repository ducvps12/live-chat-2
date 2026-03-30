import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { TeamManagement } from '../../../features/workspace/components/TeamManagement';

export default function TeamsPage() {
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

    return <TeamManagement workspaceId={workspaceId as string} />;
}
