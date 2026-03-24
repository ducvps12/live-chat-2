import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout, Menu, Dropdown, Avatar, Spin, Badge } from 'antd';
import { 
    MessageSquare, Settings, Users, Box, User, LogOut, Code, ChevronDown, CheckCircle, ChevronLeft, ChevronRight, LayoutDashboard, Contact2, CreditCard 
} from 'lucide-react';
import Link from 'next/link';
import { useGetMe, useLogout } from '../../domains/auth/auth.hooks';
import { useTotalUnreadCount } from '../../domains/conversation';
import { useMyWorkspaces } from '../../domains/workspace/workspace.hooks';
import { playNotificationSound } from '../../utils/audio';
import { useQueryClient } from '@tanstack/react-query';
import io, { Socket } from 'socket.io-client';
import { useEffect, useRef } from 'react';

const { Header, Sider, Content } = Layout;

interface AppLayoutProps {
    children: React.ReactNode;
    hideHeader?: boolean;
    headerTitle?: React.ReactNode;
    headerExtra?: React.ReactNode;
}

export default function AppLayout({ children, hideHeader = false, headerTitle, headerExtra }: AppLayoutProps) {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebar-collapsed');
            return saved === null ? true : saved === 'true';
        }
        return true;
    });
    const handleToggleCollapse = () => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            return next;
        });
    };
    const router = useRouter();
    const { workspaceId: queryWsId } = router.query;
    const workspaceId = queryWsId as string | undefined;

    const { data: meData, isLoading: meLoading } = useGetMe(true);
    const { mutateAsync: logout } = useLogout();
    const { data: unreadCounts } = useTotalUnreadCount(workspaceId || '', !!workspaceId && !!meData);
    const unreadCount = unreadCounts?.totalUnread || 0;
    const { data: wsData } = useMyWorkspaces();

    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);

    // Global Socket for unread counts and generic notification sounds outside chat pages
    useEffect(() => {
        if (!workspaceId) return;

        const token = localStorage.getItem('token');
        if (!token) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';
        const baseUrl = apiUrl.replace(/\/api$/, '');

        const socket = io(baseUrl, {
            auth: { token },
            transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('agent:join', { workspaceId });
        });

        socket.on('conversation:updated', (data: any) => {
            const isFromVisitor = data.lastMessage?.sender?.type === 'visitor';
            if (isFromVisitor) {
                const p = window.location.pathname;
                const isChatPage = p.includes('/inbox') || p.includes('/remote-session');
                
                if (!isChatPage) {
                    playNotificationSound();
                    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId, 'unread-count'] });
                }
            }
        });

        socket.on('conversation:new', (data: any) => {
            const p = window.location.pathname;
            const isChatPage = p.includes('/inbox') || p.includes('/remote-session');
            if (!isChatPage) {
                playNotificationSound();
                queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId, 'unread-count'] });
            }
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [workspaceId, queryClient]);

    const user = meData?.data?.user;
    const workspaces = wsData?.data || [];
    const currentWorkspace = workspaces.find((w: any) => w._id === workspaceId);

    const handleLogout = async () => {
        await logout();
        router.push('/auth/login');
    };

    const isPathActive = (path: string) => {
        if (path === '/workspace' && router.pathname === '/workspace') return true;
        return router.pathname.startsWith(path) && path !== '/workspace';
    };

    if (meLoading || !user) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                <Spin size="large" />
            </div>
        );
    }

    // Sidebar Menu Items
    const menuItems: any[] = [];

    if (workspaceId) {
        menuItems.push(
            {
                key: `/workspace/${workspaceId}`,
                icon: <LayoutDashboard size={20} />,
                label: <Link href={`/workspace/${workspaceId}`}>Tổng quan</Link>,
            },
            {
                key: `/workspace/${workspaceId}/inbox`,
                icon: <Badge count={unreadCount} size="small" offset={[10, 0]}><MessageSquare size={20} /></Badge>,
                label: <Link href={`/workspace/${workspaceId}/inbox`}>Hộp thư</Link>,
            },
            {
                key: `/workspace/${workspaceId}/contacts`,
                icon: <Contact2 size={20} />,
                label: <Link href={`/workspace/${workspaceId}/contacts`}>Người dùng</Link>,
            },
            {
                key: `/workspace/${workspaceId}/widgets`,
                icon: <Code size={20} />,
                label: <Link href={`/workspace/${workspaceId}/widgets`}>Widgets</Link>,
            },
            {
                key: `/workspace/${workspaceId}/teams`,
                icon: <Users size={20} />,
                label: <Link href={`/workspace/${workspaceId}/teams`}>Thành viên</Link>,
            },
            {
                key: `/workspace/${workspaceId}/settings`,
                icon: <Settings size={20} />,
                label: <Link href={`/workspace/${workspaceId}/settings`}>Cài đặt</Link>,
            },
            {
                key: `/workspace/${workspaceId}/billing`,
                icon: <CreditCard size={20} />,
                label: <Link href={`/workspace/${workspaceId}/billing`}>Thanh toán</Link>,
            }
        );
    } else {
        menuItems.push(
            {
                key: '/workspace',
                icon: <Box size={20} />,
                label: <Link href="/workspace">Workspaces</Link>,
            }
        );
    }

    // Determine selected key
    let selectedKey = router.pathname;
    if (workspaceId) {
        if (router.pathname.includes('/inbox')) selectedKey = `/workspace/${workspaceId}/inbox`;
        else if (router.pathname.includes('/contacts')) selectedKey = `/workspace/${workspaceId}/contacts`;
        else if (router.pathname.includes('/teams')) selectedKey = `/workspace/${workspaceId}/teams`;
        else if (router.pathname.includes('/billing')) selectedKey = `/workspace/${workspaceId}/billing`;
        else if (router.pathname.includes('/settings')) selectedKey = `/workspace/${workspaceId}/settings`;
        else if (router.pathname.includes('/widgets')) selectedKey = `/workspace/${workspaceId}/widgets`;
        else selectedKey = `/workspace/${workspaceId}`;
    }

    // Workspace Switcher Dropdown
    const wsMenu = {
        items: [
            ...workspaces.map((w: any) => ({
                key: w._id,
                label: (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontWeight: 500 }}>{w.name}</span>
                        {w._id === workspaceId && <CheckCircle size={16} color="var(--color-primary)" />}
                    </div>
                ),
                onClick: () => router.push(`/workspace/${w._id}`)
            })),
            { type: 'divider' },
            {
                key: 'all',
                label: 'View all workspaces',
                icon: <Box size={16} />,
                onClick: () => router.push('/workspace')
            }
        ] as any[]
    };

    return (
        <Layout style={{ minHeight: '100vh', background: 'var(--color-bg-soft)' }}>
            <style>{`
                @media (max-width: 768px) {
                    .app-sider-nav {
                        display: none !important;
                    }
                    .app-main-content {
                        margin-left: 0 !important;
                    }
                    .app-main-header {
                        display: none !important;
                    }
                }
            `}</style>
            {/* ─── LEFT SIDEBAR ─── */}
            <Sider 
                collapsed={collapsed}
                collapsedWidth={80}
                width={260}
                theme="light" 
                collapsible={false}
                className="app-sider-nav"
                style={{
                    borderRight: '1px solid var(--color-border)',
                    position: 'fixed',
                    height: '100vh',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--color-bg)',
                }}
            >
                {/* Brand / Logo */}
                <div style={{ 
                    height: 64, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '0' : '0 24px',
                    borderBottom: '1px solid var(--color-border)',
                    gap: 12,
                    background: 'linear-gradient(180deg, var(--color-primary-50) 0%, var(--color-bg) 100%)',
                }}>
                    <div style={{
                        width: collapsed ? 38 : 32, 
                        height: collapsed ? 38 : 32, 
                        borderRadius: collapsed ? 10 : 8,
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 'bold', fontSize: collapsed ? 18 : 16,
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                    }}>N</div>
                    {!collapsed && <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>NemarChat</span>}
                </div>

                {/* Workspace Switcher */}
                {workspaceId && workspaces.length > 0 && (
                    <div style={{ padding: collapsed ? '16px 0 8px' : '16px 16px 8px', display: 'flex', justifyContent: 'center' }}>
                        <Dropdown menu={wsMenu} trigger={['click']} placement={collapsed ? "bottomLeft" : "bottomCenter"}>
                            <div style={{ 
                                width: collapsed ? 44 : '100%', 
                                height: 44, 
                                padding: collapsed ? 0 : '0 14px',
                                background: 'var(--color-bg-soft)', 
                                borderRadius: collapsed ? 12 : 10, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: collapsed ? 'center' : 'space-between',
                                cursor: 'pointer',
                                border: '1px solid var(--color-border)',
                            }} className="ws-switcher">
                                {collapsed ? (
                                    <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-primary)' }}>
                                        {currentWorkspace?.name?.charAt(0)?.toUpperCase() || 'W'}
                                    </span>
                                ) : (
                                    <>
                                        <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {currentWorkspace?.name || 'Loading...'}
                                        </span>
                                        <ChevronDown size={16} color="var(--color-text-secondary)" />
                                    </>
                                )}
                            </div>
                        </Dropdown>
                    </div>
                )}

                {/* Navigation Menu */}
                <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '12px 0' : '12px 12px' }}>
                    {!collapsed && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 12, letterSpacing: '0.08em' }}>
                            {workspaceId ? 'Workspace Menu' : 'Main Menu'}
                        </div>
                    )}
                    <Menu
                        mode="inline"
                        selectedKeys={[selectedKey]}
                        items={menuItems}
                        style={{ borderRight: 'none', background: 'transparent' }}
                        className="app-sidebar-menu"
                    />
                </div>

                {/* Bottom User Area */}
                <div style={{ 
                    padding: collapsed ? '16px 0' : '16px', 
                    borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    position: 'relative'
                }}>
                    {/* Expand/Collapse Toggle Float Button */}
                    <div 
                        onClick={handleToggleCollapse}
                        className="sidebar-toggle-btn"
                        style={{
                            position: 'absolute',
                            right: -14,
                            top: -14,
                            width: 28,
                            height: 28,
                            background: '#fff',
                            border: '1px solid var(--color-border)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 101,
                            color: 'var(--color-text-secondary)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        }}
                    >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </div>

                    <Dropdown
                        placement="topRight"
                        menu={{
                            items: [
                                {
                                    key: 'profile',
                                    icon: <User size={16} />,
                                    label: 'Hồ sơ cá nhân',
                                    onClick: () => router.push('/profile')
                                },
                                { type: 'divider' },
                                {
                                    key: 'logout',
                                    icon: <LogOut size={16} />,
                                    label: 'Đăng xuất',
                                    danger: true,
                                    onClick: handleLogout
                                }
                            ]
                        }}
                        trigger={['click']}
                    >
                        <div style={{ 
                            padding: collapsed ? '6px' : '10px 12px', 
                            borderRadius: collapsed ? 12 : 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: collapsed ? 'auto' : '100%',
                        }} className="user-profile-btn">
                            <Avatar src={user.avatarUrl} size={collapsed ? 42 : 36} style={{ background: 'var(--gradient-primary)', flexShrink: 0 }}>
                                {!user.avatarUrl && (user.name?.charAt(0)?.toUpperCase() || 'U')}
                            </Avatar>
                            {!collapsed && (
                                <>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {user.name}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {user.email}
                                        </div>
                                    </div>
                                    <Settings size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                                </>
                            )}
                        </div>
                    </Dropdown>
                </div>
            </Sider>

            {/* ─── MAIN CONTENT ─── */}
            <Layout className="app-main-content" style={{ marginLeft: collapsed ? 80 : 260, background: 'var(--color-bg-soft)', minHeight: '100vh', display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s' }}>
                {!hideHeader && (
                    <Header className="app-main-header" style={{ 
                        background: 'rgba(255, 255, 255, 0.85)', 
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        padding: '0 32px', 
                        height: 64, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--color-border)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 99,
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                    }}>
                        <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                            {headerTitle || ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            {headerExtra || null}
                        </div>
                    </Header>
                )}
                <Content style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}

