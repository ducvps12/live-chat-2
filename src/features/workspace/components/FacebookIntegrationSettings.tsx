import React, { useState } from 'react';
import { Spin, Modal, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../../lib/http/client';
import { Facebook, Link2, Unlink2, ExternalLink, CheckCircle2, Plus, Trash2, Globe } from 'lucide-react';

interface FBPage {
    id: string;
    pageId: string;
    pageName: string;
    pageAvatar: string;
    status: 'active' | 'disconnected' | 'token_expired';
    createdAt: string;
}

function useFBPages(workspaceId: string) {
    return useQuery({
        queryKey: ['facebook', 'pages', workspaceId],
        queryFn: async () => {
            const res = await httpClient.get(`/workspaces/${workspaceId}/facebook/pages`);
            return res.data?.data;
        },
        enabled: !!workspaceId,
    });
}

function useConnectFB() {
    return useMutation({
        mutationFn: async (workspaceId: string) => {
            const res = await httpClient.get(`/workspaces/${workspaceId}/facebook/oauth-url`);
            return res.data?.data?.url;
        },
    });
}

function useDisconnectFBPage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ workspaceId, pageDbId }: { workspaceId: string; pageDbId: string }) => {
            const res = await httpClient.delete(`/workspaces/${workspaceId}/facebook/pages/${pageDbId}`);
            return res.data;
        },
        onSuccess: (_, { workspaceId }) => {
            message.success('Đã ngắt kết nối Facebook Page');
            queryClient.invalidateQueries({ queryKey: ['facebook', 'pages', workspaceId] });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.error || 'Lỗi ngắt kết nối');
        },
    });
}

export default function FacebookIntegrationSettings({ workspaceId }: { workspaceId: string }) {
    const [hoverBtn, setHoverBtn] = useState<string | null>(null);
    const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
    const [syncingPageId, setSyncingPageId] = useState<string | null>(null);

    const { data, isLoading } = useFBPages(workspaceId);
    const { mutate: connectFB, isPending: isConnecting } = useConnectFB();
    const { mutate: disconnectPage, isPending: isDisconnecting } = useDisconnectFBPage();

    const pages: FBPage[] = data?.pages || [];

    const handleConnect = () => {
        connectFB(workspaceId, {
            onSuccess: (url: string) => {
                if (url) {
                    window.open(url, '_blank', 'width=600,height=700');
                }
            },
            onError: (err: any) => {
                message.error('Không thể tạo link kết nối Facebook. Kiểm tra FB_APP_ID trong .env');
            },
        });
    };

    const handleDisconnect = (pageDbId: string) => {
        disconnectPage({ workspaceId, pageDbId }, {
            onSuccess: () => setConfirmDisconnect(null),
        });
    };

    const statusMap: Record<string, { color: string; bg: string; border: string; label: string }> = {
        active: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', label: 'Đang hoạt động' },
        disconnected: { color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', label: 'Mất kết nối' },
        token_expired: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Token hết hạn' },
    };

    return (
        <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden"
            style={{ marginTop: 24 }}
        >
            {/* ─── Header ─── */}
            <div className="flex items-center gap-4 border-b border-slate-100" style={{ padding: '24px 28px' }}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ring-1 ring-blue-100 transition-transform duration-200 hover:scale-[1.03]"
                    style={{ background: 'linear-gradient(135deg, #1877F2, #42A5F5)' }}
                >
                    <Facebook size={22} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-[16px] font-semibold tracking-tight text-slate-900">
                        Tích hợp Facebook Fanpage
                    </h3>
                    <p className="m-0 text-[13px] text-slate-500 leading-6">
                        Kết nối Fanpage để nhận tin nhắn Messenger trong NemarkChat
                    </p>
                </div>

                {!isLoading && pages.length > 0 && (
                    <span className="inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12px] font-semibold shrink-0 border border-blue-200 bg-blue-50 text-blue-700">
                        <Globe size={13} />
                        {pages.length} trang
                    </span>
                )}
            </div>

            {/* ─── Body ─── */}
            <div style={{ padding: '28px' }}>
                {isLoading ? (
                    <div className="flex min-h-[200px] items-center justify-center">
                        <Spin size="large" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* ── Connected Pages List ── */}
                        {pages.length > 0 && (
                            <div className="space-y-3">
                                {pages.map(page => {
                                    const st = statusMap[page.status] || statusMap.disconnected;
                                    return (
                                        <div key={page.id}
                                            className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 transition-all duration-200 hover:border-slate-300/80 hover:shadow-sm"
                                            style={{ padding: '16px 20px' }}
                                        >
                                            {/* Avatar */}
                                            <div className="shrink-0">
                                                {page.pageAvatar ? (
                                                    <img src={page.pageAvatar} alt={page.pageName}
                                                        className="rounded-xl object-cover"
                                                        style={{ width: 44, height: 44 }}
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center rounded-xl text-white"
                                                        style={{ width: 44, height: 44, fontSize: 18, fontWeight: 600, background: '#1877F2' }}
                                                    >
                                                        {page.pageName?.charAt(0) || 'F'}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="min-w-0 flex-1">
                                                <h4 className="m-0 text-[15px] font-semibold tracking-tight text-slate-900 truncate">
                                                    {page.pageName}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                                        style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                                                        {st.label}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Sync */}
                                            <button
                                                onClick={async () => {
                                                    setSyncingPageId(page.id);
                                                    try {
                                                        const res = await httpClient.post(`/workspaces/${workspaceId}/facebook/pages/${page.id}/sync`);
                                                        message.success(res.data?.message || `Đồng bộ hoàn tất: ${res.data?.data?.synced || 0} tin nhắn`);
                                                    } catch (err: any) {
                                                        message.error(err.response?.data?.error || 'Lỗi đồng bộ tin nhắn');
                                                    } finally {
                                                        setSyncingPageId(null);
                                                    }
                                                }}
                                                disabled={syncingPageId === page.id}
                                                onMouseEnter={() => setHoverBtn(`sync-${page.id}`)}
                                                onMouseLeave={() => setHoverBtn(null)}
                                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 transition-all duration-200 shrink-0 text-[12px] font-semibold"
                                                style={{
                                                    cursor: syncingPageId === page.id ? 'not-allowed' : 'pointer',
                                                    opacity: syncingPageId === page.id ? 0.6 : 1,
                                                    background: hoverBtn === `sync-${page.id}` ? '#eff6ff' : 'white',
                                                    borderColor: hoverBtn === `sync-${page.id}` ? '#93c5fd' : '#e2e8f0',
                                                    color: '#1877F2',
                                                }}
                                                title="Đồng bộ tin nhắn từ Fanpage"
                                            >
                                                {syncingPageId === page.id ? <Spin size="small" /> : <><ExternalLink size={13} /> Đồng bộ</>}
                                            </button>

                                            {/* Disconnect */}
                                            <button
                                                onClick={() => setConfirmDisconnect(page.id)}
                                                disabled={isDisconnecting}
                                                onMouseEnter={() => setHoverBtn(`del-${page.id}`)}
                                                onMouseLeave={() => setHoverBtn(null)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 shrink-0"
                                                style={{
                                                    cursor: isDisconnecting ? 'not-allowed' : 'pointer',
                                                    opacity: isDisconnecting ? 0.5 : 1,
                                                    background: hoverBtn === `del-${page.id}` ? '#fef2f2' : 'white',
                                                    borderColor: hoverBtn === `del-${page.id}` ? '#fecaca' : '#e2e8f0',
                                                    color: '#ef4444',
                                                }}
                                                title="Ngắt kết nối"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Connect Button ── */}
                        <button
                            onClick={handleConnect}
                            disabled={isConnecting}
                            onMouseEnter={() => setHoverBtn('add-fb')}
                            onMouseLeave={() => setHoverBtn(null)}
                            className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed text-[14px] font-semibold transition-all duration-200"
                            style={{
                                cursor: isConnecting ? 'not-allowed' : 'pointer',
                                opacity: isConnecting ? 0.7 : 1,
                                background: hoverBtn === 'add-fb' && !isConnecting ? '#eff6ff' : '#fafbfc',
                                borderColor: hoverBtn === 'add-fb' && !isConnecting ? '#60a5fa' : '#e2e8f0',
                                color: hoverBtn === 'add-fb' && !isConnecting ? '#1877F2' : '#64748b',
                            }}
                        >
                            {isConnecting ? <Spin size="small" /> : <Plus size={18} />}
                            {pages.length === 0 ? 'Kết nối Facebook Fanpage' : 'Thêm Fanpage'}
                        </button>

                        {/* Feature hints */}
                        {pages.length === 0 && (
                            <div className="space-y-4 pt-2">
                                <div className="flex flex-wrap justify-center gap-3">
                                    {[
                                        { icon: Facebook, text: 'Messenger' },
                                        { icon: Globe, text: 'Nhiều Fanpage' },
                                        { icon: Link2, text: 'Webhook tự động' },
                                        { icon: CheckCircle2, text: 'Quản lý tập trung' },
                                    ].map((f, i) => (
                                        <span key={i} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[12px] font-medium text-slate-500">
                                            <f.icon size={13} />
                                            {f.text}
                                        </span>
                                    ))}
                                </div>

                                {/* Setup instructions */}
                                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60" style={{ padding: '14px 18px' }}>
                                    <p className="m-0 text-[13px] font-semibold text-amber-800 mb-1">
                                        Yêu cầu trước khi kết nối
                                    </p>
                                    <ul className="m-0 pl-4 text-[12px] text-amber-700 space-y-1">
                                        <li>Tạo Facebook App tại <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline">developers.facebook.com</a></li>
                                        <li>Thêm <code>FB_APP_ID</code> và <code>FB_APP_SECRET</code> vào file <code>.env</code></li>
                                        <li>Cấu hình Webhook URL: <code>{`{domain}/api/facebook/webhook`}</code></li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Confirm Disconnect Modal ── */}
            <Modal
                open={!!confirmDisconnect}
                title="Ngắt kết nối Facebook Page"
                onCancel={() => setConfirmDisconnect(null)}
                okText="Ngắt kết nối"
                cancelText="Huỷ"
                okButtonProps={{ danger: true, loading: isDisconnecting }}
                onOk={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
            >
                <p>Bạn có chắc muốn ngắt kết nối Facebook Page này? Tin nhắn Messenger mới sẽ không được đồng bộ nữa.</p>
            </Modal>
        </div>
    );
}
