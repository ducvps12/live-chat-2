import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zaloService } from '../../services/zalo.service';
import { ZALO_KEYS } from './zalo.keys';
import { message } from 'antd';

export function useZaloStatus(workspaceId: string) {
    return useQuery({
        queryKey: ZALO_KEYS.status(workspaceId),
        queryFn: () => zaloService.getStatus(workspaceId),
        enabled: !!workspaceId,
        refetchInterval: (query) => {
            // Polling if status is pending
            const data = query.state.data?.data;
            if (data?.status === 'pending') return 3000; // Poll every 3 seconds
            return false;
        }
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
        mutationFn: (workspaceId: string) => zaloService.disconnect(workspaceId),
        onSuccess: (data, workspaceId) => {
            message.success('Đã ngắt kết nối Zalo');
            queryClient.invalidateQueries({ queryKey: ZALO_KEYS.status(workspaceId) });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.message || 'Không thể ngắt kết nối Zalo');
        }
    });
}
