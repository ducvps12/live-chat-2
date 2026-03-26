import mongoose, { Schema, Document } from 'mongoose';

export interface IScenario {
    trigger: string;
    triggerType: 'keyword' | 'contains' | 'regex';
    response: string;
    action?: 'assign_agent' | 'collect_info' | 'close' | 'tag';
    actionData?: Record<string, any>;
    priority: number;
}

export interface IQuickReply {
    label: string;
    value: string;
    icon?: string;
}

export interface IChannelConfig {
    enabled: boolean;
    filterIds?: string[];  // widgetIds / pageIds / accountIds
}

export interface IAIBot extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    avatarUrl?: string;
    brandName: string;
    brandDescription?: string;
    aiModel?: string;

    // Persona
    mainTask: 'customer_care' | 'sales' | 'technical_support';
    conversationStyle: 'friendly' | 'professional' | 'casual';
    messageLength: 'short' | 'medium' | 'long';
    customGreeting?: string;
    welcomeMessage?: string;

    // Channels & conditions
    channels: {
        website: IChannelConfig;
        messenger: IChannelConfig;
        facebook: IChannelConfig;
        zalo: IChannelConfig;
        instagram: IChannelConfig;
    };
    agentCondition: 'always' | 'no_agent_online' | 'at_least_one_online' | 'no_condition';

    // Scenarios
    scenarios: IScenario[];

    // Quick replies shown to visitors
    quickReplies: IQuickReply[];

    // Auto-follow-up: if agent/visitor doesn't reply in X seconds
    followUp: {
        enabled: boolean;
        delaySeconds: number;
        message: string;
    };

    isActive: boolean;
    isDraft: boolean;

    // Stats
    stats: {
        totalConversations: number;
        totalReplies: number;
        leadsCollected: number;
    };

    createdAt: Date;
    updatedAt: Date;
}

const scenarioSchema = new Schema<IScenario>(
    {
        trigger: { type: String, required: true },
        triggerType: { type: String, enum: ['keyword', 'contains', 'regex'], default: 'contains' },
        response: { type: String, required: true },
        action: { type: String, enum: ['assign_agent', 'collect_info', 'close', 'tag'] },
        actionData: { type: Schema.Types.Mixed },
        priority: { type: Number, default: 0 },
    },
    { _id: true }
);

const quickReplySchema = new Schema<IQuickReply>(
    {
        label: { type: String, required: true },
        value: { type: String, required: true },
        icon: { type: String },
    },
    { _id: true }
);

const channelConfigSchema = new Schema<IChannelConfig>(
    {
        enabled: { type: Boolean, default: false },
        filterIds: [{ type: String }],
    },
    { _id: false }
);

const aiBotSchema = new Schema<IAIBot>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true, trim: true, default: 'Chatbot AI' },
        avatarUrl: { type: String },
        brandName: { type: String, trim: true, default: '' },
        brandDescription: { type: String, default: '' },
        aiModel: { type: String, default: '' },

        mainTask: { type: String, enum: ['customer_care', 'sales', 'technical_support'], default: 'customer_care' },
        conversationStyle: { type: String, enum: ['friendly', 'professional', 'casual'], default: 'friendly' },
        messageLength: { type: String, enum: ['short', 'medium', 'long'], default: 'medium' },
        customGreeting: { type: String },
        welcomeMessage: { type: String },

        channels: {
            website: { type: channelConfigSchema, default: () => ({ enabled: true }) },
            messenger: { type: channelConfigSchema, default: () => ({ enabled: true }) },
            facebook: { type: channelConfigSchema, default: () => ({ enabled: true }) },
            zalo: { type: channelConfigSchema, default: () => ({ enabled: true }) },
            instagram: { type: channelConfigSchema, default: () => ({ enabled: false }) },
        },
        agentCondition: { type: String, enum: ['always', 'no_agent_online', 'at_least_one_online', 'no_condition'], default: 'no_condition' },

        scenarios: [scenarioSchema],
        quickReplies: {
            type: [quickReplySchema],
            default: [
                { label: 'Báo giá 💰', value: 'Tôi muốn xem báo giá' },
                { label: 'Hỗ trợ tôi ❓', value: 'Tôi cần hỗ trợ' },
            ],
        },

        followUp: {
            enabled: { type: Boolean, default: false },
            delaySeconds: { type: Number, default: 30 },
            message: { type: String, default: 'Bạn còn cần hỗ trợ gì thêm không ạ?' },
        },

        isActive: { type: Boolean, default: false },
        isDraft: { type: Boolean, default: true },

        stats: {
            totalConversations: { type: Number, default: 0 },
            totalReplies: { type: Number, default: 0 },
            leadsCollected: { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

aiBotSchema.index({ workspaceId: 1, isActive: 1 });
aiBotSchema.index({ workspaceId: 1, isDraft: 1 });

export const AIBotModel = mongoose.model<IAIBot>('AIBot', aiBotSchema);
