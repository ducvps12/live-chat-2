import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zaloService } from '../../services/zalo.service';
import { ZALO_KEYS } from './zalo.keys';
import { message } from 'antd';

export function useZaloStatus(workspaceId: string, waitingForScan = false) {
    return useQuery({
        queryKey: ZALO_KEYS.status(workspaceId),
        queryFn: () => zaloService.getStatus(workspaceId),
        enabled: !!workspaceId,
        refetchInterval: waitingForScan ? 3000 : false,
    });
}

export function useGenerateZaloQR() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (workspaceId: string) => zaloService.generateQR(workspaceId),
        onSuccess: (_, workspaceId) => {
            queryClient.invalidateQueries({ queryKey: ZALO_KEYS.status(workspaceId) });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.message || 'Không thể tạo mã QR Zalo');
        }
    });
}

export function useDisconnectZalo() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workspaceId, accountId }: { workspaceId: string; accountId?: string }) =>
            zaloService.disconnect(workspaceId, accountId),
        onSuccess: (data, { workspaceId }) => {
            message.success('Đã ngắt kết nối Zalo');
            queryClient.invalidateQueries({ queryKey: ZALO_KEYS.status(workspaceId) });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.message || 'Không thể ngắt kết nối Zalo');
        }
    });
}
