import { httpClient } from '../lib/http/client';

export interface IAIBotData {
    name: string;
    avatarUrl?: string;
    brandName: string;
    brandDescription?: string;
    mainTask: 'customer_care' | 'sales' | 'technical_support';
    conversationStyle: 'friendly' | 'professional' | 'casual';
    messageLength: 'short' | 'medium' | 'long';
    customGreeting?: string;
    welcomeMessage?: string;
    channels: {
        website: { enabled: boolean; filterIds?: string[] };
        messenger: { enabled: boolean; filterIds?: string[] };
        facebook: { enabled: boolean; filterIds?: string[] };
        zalo: { enabled: boolean; filterIds?: string[] };
        instagram: { enabled: boolean; filterIds?: string[] };
    };
    agentCondition: 'always' | 'no_agent_online' | 'at_least_one_online' | 'no_condition';
    scenarios: Array<{
        trigger: string;
        triggerType: 'keyword' | 'contains' | 'regex';
        response: string;
        action?: string;
        actionData?: any;
        priority: number;
    }>;
    quickReplies: Array<{ label: string; value: string; icon?: string }>;
    followUp: { enabled: boolean; delaySeconds: number; message: string };
    isActive: boolean;
    isDraft: boolean;
    aiModel?: string;
}

export const chatbotService = {
    list: async (workspaceId: string) => {
        const res = await httpClient.get(`/chatbots/workspace/${workspaceId}`);
        return res.data;
    },

    getOne: async (workspaceId: string, botId: string) => {
        const res = await httpClient.get(`/chatbots/workspace/${workspaceId}/${botId}`);
        return res.data;
    },

    create: async (workspaceId: string, data: Partial<IAIBotData>) => {
        const res = await httpClient.post(`/chatbots/workspace/${workspaceId}`, data);
        return res.data;
    },

    update: async (workspaceId: string, botId: string, data: Partial<IAIBotData>) => {
        const res = await httpClient.put(`/chatbots/workspace/${workspaceId}/${botId}`, data);
        return res.data;
    },

    remove: async (workspaceId: string, botId: string) => {
        const res = await httpClient.delete(`/chatbots/workspace/${workspaceId}/${botId}`);
        return res.data;
    },

    toggleActive: async (workspaceId: string, botId: string, isActive: boolean) => {
        const res = await httpClient.patch(`/chatbots/workspace/${workspaceId}/${botId}/toggle`, { isActive });
        return res.data;
    },

    getStats: async (workspaceId: string) => {
        const res = await httpClient.get(`/chatbots/workspace/${workspaceId}/stats`);
        return res.data;
    },

    listModels: async () => {
        const res = await httpClient.get('/chatbots/ai/models');
        return res.data;
    },
};
