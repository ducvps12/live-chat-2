/**
 * Permission Keys — centralised. 
 * Every permission check in controllers/middlewares must use these keys.
 */
export const PERMISSIONS = {
    // Workspace
    WORKSPACE_CREATE: 'workspace:create',
    WORKSPACE_READ: 'workspace:read',
    WORKSPACE_UPDATE: 'workspace:update',
    WORKSPACE_DELETE: 'workspace:delete',
    WORKSPACE_MANAGE_MEMBERS: 'workspace:manage_members',

    // Widget
    WIDGET_CREATE: 'widget:create',
    WIDGET_READ: 'widget:read',
    WIDGET_UPDATE: 'widget:update',
    WIDGET_DELETE: 'widget:delete',

    // Team
    TEAM_CREATE: 'team:create',
    TEAM_READ: 'team:read',
    TEAM_UPDATE: 'team:update',
    TEAM_DELETE: 'team:delete',
    TEAM_MANAGE_MEMBERS: 'team:manage_members',

    // Conversation
    CONVERSATION_READ: 'conversation:read',
    CONVERSATION_ASSIGN: 'conversation:assign',
    CONVERSATION_CLOSE: 'conversation:close',

    // User / Admin
    USER_INVITE: 'user:invite',
    USER_DISABLE: 'user:disable',
    USER_BAN: 'user:ban',

    // Settings
    SETTINGS_READ: 'settings:read',
    SETTINGS_UPDATE: 'settings:update',

    // Remote Session
    REMOTE_SESSION_CREATE: 'remote_session:create',
    REMOTE_SESSION_VIEW: 'remote_session:view',
    REMOTE_SESSION_CONTROL: 'remote_session:control',
    REMOTE_SESSION_REVOKE: 'remote_session:revoke',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role → Permission mapping.
 * `admin` has all permissions; `agent` has a subset; `member` has read-only.
 */
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
    admin: ALL_PERMISSIONS,

    agent: [
        PERMISSIONS.WORKSPACE_READ,
        PERMISSIONS.WIDGET_READ,
        PERMISSIONS.TEAM_READ,
        PERMISSIONS.CONVERSATION_READ,
        PERMISSIONS.CONVERSATION_ASSIGN,
        PERMISSIONS.CONVERSATION_CLOSE,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.REMOTE_SESSION_VIEW,
        PERMISSIONS.REMOTE_SESSION_CONTROL,
    ],

    member: [
        PERMISSIONS.WORKSPACE_READ,
        PERMISSIONS.WIDGET_READ,
        PERMISSIONS.TEAM_READ,
        PERMISSIONS.CONVERSATION_READ,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.REMOTE_SESSION_VIEW,
    ],
};

/**
 * Check if a role has a specific permission.
 */
export const hasPermission = (role: string, permission: PermissionKey): boolean => {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    return perms.includes(permission);
};
