import { WidgetPosition } from './common';

// ── Pre-chat form field ──
export interface PreChatField {
    key: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
    required: boolean;
    enabled: boolean;
    placeholder?: string;
    options?: string[];
}

// ── Widget configuration ──
export interface WidgetConfig {
    primaryColor: string;
    gradient?: string;
    launcherStyle?: 'bubble' | 'tab' | 'pill' | 'image';
    launcherText?: string;
    launcherIcon?: string;
    tooltipText?: string;
    greeting: string;
    placeholder: string;
    position: WidgetPosition;
    language: string;
    avatarUrl?: string;
    showBranding: boolean;
    offlineMessage: string;
    autoReply?: string;
    preChatForm: {
        enabled: boolean;
        title: string;
        fields: PreChatField[];
    };
}

// ── Widget (frontend-facing) ──
export interface Widget {
    _id: string;
    workspaceId: string;
    name: string;
    config: WidgetConfig;
    domainRules: {
        mode: 'allowlist' | 'blocklist';
        domains: string[];
    };
    isActive: boolean;
    createdAt: string;
    updatedAt?: string;
}
