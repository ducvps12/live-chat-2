export const ZALO_KEYS = {
    all: ['zalo'] as const,
    status: (workspaceId: string) => [...ZALO_KEYS.all, 'status', workspaceId] as const,
};
