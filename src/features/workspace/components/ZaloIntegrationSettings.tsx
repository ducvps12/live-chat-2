import React, { useState, useEffect } from 'react';
import { Spin, Modal, message } from 'antd';
import { useZaloStatus, useGenerateZaloQR, useDisconnectZalo } from '../../../domains/zalo/zalo.hooks';
import { Smartphone, Unplug, RefreshCw, QrCode, CheckCircle2, ScanLine, Wifi, WifiOff, Zap, ChevronRight, Plus, Trash2, Users } from 'lucide-react';

interface ZaloAccount {
    accountId: string;
    name: string;
    avatar: string;
    zaloId: string;
    status: 'active' | 'disconnected';
    isOnline: boolean;
}

export default function ZaloIntegrationSettings({ workspaceId }: { workspaceId: string }) {
    const [localQrUrl, setLocalQrUrl] = useState<string | null>(null);
    const [hoverBtn, setHoverBtn] = useState<string | null>(null);
    const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

    const { data: res, isLoading, refetch } = useZaloStatus(workspaceId, !!localQrUrl);
    const { mutate: generateQR, isPending: isGenerating } = useGenerateZaloQR();
    const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectZalo();

    const statusObj = res?.data;
    const accounts: ZaloAccount[] = statusObj?.accounts || [];
    const hasAnyConnected = accounts.some(a => a.isOnline);

    const handleConnect = () => {
        generateQR(workspaceId, {
            onSuccess: (data: any) => {
                const qrUrl = data?.data?.qrUrl || data?.qrUrl;
                if (qrUrl) {
                    setLocalQrUrl(qrUrl);
                }
            },
        });
    };

    const handleDisconnect = (accountId: string) => {
        disconnect({ workspaceId, accountId }, {
            onSuccess: () => {
                setLocalQrUrl(null);
                setConfirmDisconnect(null);
            },
        });
    };

    useEffect(() => {
        if (hasAnyConnected && localQrUrl) {
            // Check if a NEW account appeared (refresh brought new data)
            const prevCount = (res as any)?._prevAccountCount;
            if (prevCount !== undefined && accounts.length > prevCount) {
                setLocalQrUrl(null);
            }
        }
    }, [accounts.length, localQrUrl]);

    // Reset QR when a new account connects
    useEffect(() => {
        if (localQrUrl && accounts.length > 0) {
            const hasNewActive = accounts.some(a => a.isOnline);
            if (hasNewActive) {
                // Give a small delay to let the status settle
                const timer = setTimeout(() => {
                    if (localQrUrl) setLocalQrUrl(null);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [accounts, localQrUrl]);

    return (
        <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden"
            style={{ marginTop: 24 }}
        >
            {/* ─── Header ─── */}
            <div className="flex items-center gap-4 border-b border-slate-100" style={{ padding: '24px 28px' }}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 transition-transform duration-200 hover:scale-[1.03]">
                    <Smartphone size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-[16px] font-semibold tracking-tight text-slate-900">
                        Tích hợp Zalo Cá Nhân
                    </h3>
                    <p className="m-0 text-[13px] text-slate-500 leading-6">
                        Kết nối nhiều tài khoản Zalo để nhận và trả lời tin nhắn trực tiếp
                    </p>
                </div>

                {/* Account count badge */}
                {!isLoading && accounts.length > 0 && (
                    <span className="inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12px] font-semibold shrink-0 border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Users size={13} />
                        {accounts.length} tài khoản
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
                        {/* ── Connected Accounts List ── */}
                        {accounts.length > 0 && (
                            <div className="space-y-3">
                                {accounts.map(account => (
                                    <div key={account.accountId}
                                        className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 transition-all duration-200 hover:border-slate-300/80 hover:shadow-sm"
                                        style={{ padding: '16px 20px' }}
                                    >
                                        {/* Avatar */}
                                        <div className="relative shrink-0">
                                            {account.avatar ? (
                                                <img
                                                    src={account.avatar}
                                                    alt={account.name}
                                                    className="rounded-xl object-cover"
                                                    style={{ width: 44, height: 44 }}
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center rounded-xl bg-blue-50 text-blue-600"
                                                    style={{ width: 44, height: 44, fontSize: 18, fontWeight: 600 }}
                                                >
                                                    {account.name?.charAt(0) || 'Z'}
                                                </div>
                                            )}
                                            <span className={[
                                                'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white',
                                                account.isOnline ? 'bg-emerald-500' : 'bg-slate-300',
                                            ].join(' ')} />
                                        </div>

                                        {/* Info */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="m-0 text-[15px] font-semibold tracking-tight text-slate-900 truncate">
                                                {account.name}
                                            </h4>
                                            <div className="flex items-center gap-2 text-[12px] text-slate-500">
                                                {account.isOnline ? (
                                                    <>
                                                        <Wifi size={12} className="text-emerald-500" />
                                                        <span className="text-emerald-600 font-medium">Đang hoạt động</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <WifiOff size={12} className="text-slate-400" />
                                                        <span>Mất kết nối</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Disconnect Button */}
                                        <button
                                            onClick={() => setConfirmDisconnect(account.accountId)}
                                            disabled={isDisconnecting}
                                            onMouseEnter={() => setHoverBtn(`del-${account.accountId}`)}
                                            onMouseLeave={() => setHoverBtn(null)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 shrink-0"
                                            style={{
                                                cursor: isDisconnecting ? 'not-allowed' : 'pointer',
                                                opacity: isDisconnecting ? 0.5 : 1,
                                                background: hoverBtn === `del-${account.accountId}` ? '#fef2f2' : 'white',
                                                borderColor: hoverBtn === `del-${account.accountId}` ? '#fecaca' : '#e2e8f0',
                                                color: '#ef4444',
                                            }}
                                            title="Ngắt kết nối"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── QR Code (when scanning) ── */}
                        {localQrUrl && (
                            <div className="space-y-5">
                                <div className="flex items-center gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/60" style={{ padding: '14px 18px' }}>
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                        <ScanLine size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="m-0 text-[13px] font-semibold text-blue-800">
                                            Quét mã QR bằng Zalo
                                        </p>
                                        <p className="m-0 text-[12px] text-blue-600">
                                            Mở ứng dụng Zalo → Quét mã bên dưới để thêm tài khoản mới
                                        </p>
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <div className="relative rounded-[20px] border border-slate-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)]" style={{ padding: '28px' }}>
                                        <div className="absolute top-4 left-4 h-2 w-2 rounded-full bg-blue-200" />
                                        <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-blue-200" />
                                        <div className="absolute bottom-4 left-4 h-2 w-2 rounded-full bg-blue-200" />
                                        <div className="absolute bottom-4 right-4 h-2 w-2 rounded-full bg-blue-200" />
                                        <img
                                            src={localQrUrl}
                                            alt="Zalo QR Code"
                                            className="block rounded-xl"
                                            style={{ width: 220, height: 220 }}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-center gap-3">
                                    <button
                                        onClick={() => refetch()}
                                        onMouseEnter={() => setHoverBtn('refresh')}
                                        onMouseLeave={() => setHoverBtn(null)}
                                        className="inline-flex h-10 items-center gap-2 rounded-xl border text-[13px] font-medium transition-all duration-200"
                                        style={{
                                            padding: '0 16px',
                                            cursor: 'pointer',
                                            background: hoverBtn === 'refresh' ? '#f8fafc' : 'white',
                                            borderColor: hoverBtn === 'refresh' ? '#cbd5e1' : '#e2e8f0',
                                            color: '#475569',
                                        }}
                                    >
                                        <RefreshCw size={14} />
                                        Kiểm tra
                                    </button>
                                    <button
                                        onClick={() => setLocalQrUrl(null)}
                                        onMouseEnter={() => setHoverBtn('cancel')}
                                        onMouseLeave={() => setHoverBtn(null)}
                                        className="inline-flex h-10 items-center gap-2 rounded-xl border text-[13px] font-medium transition-all duration-200"
                                        style={{
                                            padding: '0 16px',
                                            cursor: 'pointer',
                                            background: hoverBtn === 'cancel' ? '#fef2f2' : 'white',
                                            borderColor: hoverBtn === 'cancel' ? '#fecaca' : '#e2e8f0',
                                            color: '#ef4444',
                                        }}
                                    >
                                        Huỷ
                                    </button>
                                </div>

                                <p className="m-0 text-center text-[11px] text-slate-400">
                                    Trạng thái tự động cập nhật sau khi quét mã
                                </p>
                            </div>
                        )}

                        {/* ── Add Account Button ── */}
                        {!localQrUrl && (
                            <button
                                onClick={handleConnect}
                                disabled={isGenerating}
                                onMouseEnter={() => setHoverBtn('add')}
                                onMouseLeave={() => setHoverBtn(null)}
                                className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed text-[14px] font-semibold transition-all duration-200"
                                style={{
                                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                                    opacity: isGenerating ? 0.7 : 1,
                                    background: hoverBtn === 'add' && !isGenerating ? '#eef2ff' : '#fafbfc',
                                    borderColor: hoverBtn === 'add' && !isGenerating ? '#818cf8' : '#e2e8f0',
                                    color: hoverBtn === 'add' && !isGenerating ? '#4f46e5' : '#64748b',
                                }}
                            >
                                {isGenerating ? <Spin size="small" /> : <Plus size={18} />}
                                {accounts.length === 0 ? 'Kết nối Zalo đầu tiên' : 'Thêm tài khoản Zalo'}
                            </button>
                        )}

                        {/* Feature hints (show when no accounts) */}
                        {accounts.length === 0 && !localQrUrl && (
                            <div className="flex flex-wrap justify-center gap-3 pt-2">
                                {[
                                    { icon: Wifi, text: 'Đồng bộ tin nhắn' },
                                    { icon: Zap, text: 'Phản hồi nhanh' },
                                    { icon: Users, text: 'Nhiều tài khoản' },
                                    { icon: CheckCircle2, text: 'Quản lý tập trung' },
                                ].map((f, i) => (
                                    <span key={i} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[12px] font-medium text-slate-500">
                                        <f.icon size={13} />
                                        {f.text}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Confirm Disconnect Modal ── */}
            <Modal
                open={!!confirmDisconnect}
                title="Ngắt kết nối Zalo"
                onCancel={() => setConfirmDisconnect(null)}
                okText="Ngắt kết nối"
                cancelText="Huỷ"
                okButtonProps={{ danger: true, loading: isDisconnecting }}
                onOk={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
            >
                <p>Bạn có chắc muốn ngắt kết nối tài khoản Zalo này? Tin nhắn mới từ tài khoản này sẽ không được đồng bộ nữa.</p>
            </Modal>
        </div>
    );
}
