import { WorkspacePlan, MemberRole } from './common';

// ── Workspace member ──
export interface WorkspaceMember {
    userId: string;
    role: MemberRole;
    joinedAt: string;
}

// ── Business hours schedule ──
export interface BusinessHoursSchedule {
    day: number;      // 0=Sunday ... 6=Saturday
    start: string;    // 'HH:mm'
    end: string;      // 'HH:mm'
}

// ── Workspace settings ──
export interface WorkspaceSettings {
    timezone: string;
    language: string;
    businessHours?: {
        enabled: boolean;
        schedule: BusinessHoursSchedule[];
        holidays?: Array<{ date: string; name?: string }>;
    };
}

// ── Workspace (frontend-facing) ──
export interface Workspace {
    _id: string;
    name: string;
    slug: string;
    ownerId: string;
    plan: WorkspacePlan;
    settings: WorkspaceSettings;
    members: WorkspaceMember[];
    isActive: boolean;
    createdAt: string;
    updatedAt?: string;
}
