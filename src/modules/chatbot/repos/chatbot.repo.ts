import prisma from '../../../infra/prisma';
import type { AIBot } from '@prisma/client';

export const chatbotRepo = {
    async findByWorkspace(workspaceId: string) {
        return prisma.aIBot.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
    },

    async findById(id: string) {
        return prisma.aIBot.findUnique({ where: { id } });
    },

    async findActive(workspaceId: string, channel?: string) {
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });

        if (!channel) return bots;

        // Filter by channel in JSON
        return bots.filter(bot => {
            const channels = bot.channels as any;
            return channels?.[channel]?.enabled === true;
        });
    },

    async create(data: {
        workspaceId: string;
        name?: string;
        avatarUrl?: string;
        brandName?: string;
        brandDescription?: string;
        aiModel?: string;
        mainTask?: string;
        conversationStyle?: string;
        messageLength?: string;
        customGreeting?: string;
        welcomeMessage?: string;
        channels?: any;
        agentCondition?: string;
        scenarios?: any[];
        quickReplies?: any[];
        followUp?: any;
        isActive?: boolean;
        isDraft?: boolean;
    }) {
        return prisma.aIBot.create({ data: data as any });
    },

    async update(id: string, data: Partial<Omit<AIBot, 'id' | 'createdAt' | 'updatedAt'>>) {
        return prisma.aIBot.update({ where: { id }, data: data as any });
    },

    async remove(id: string) {
        return prisma.aIBot.delete({ where: { id } });
    },

    async toggleActive(id: string, isActive: boolean) {
        return prisma.aIBot.update({
            where: { id },
            data: { isActive, isDraft: false },
        });
    },

    async incrementStats(id: string, field: 'totalConversations' | 'totalReplies' | 'leadsCollected', amount = 1) {
        const bot = await prisma.aIBot.findUnique({ where: { id }, select: { stats: true } });
        const stats = (bot?.stats as any) || {};
        stats[field] = (stats[field] || 0) + amount;
        return prisma.aIBot.update({ where: { id }, data: { stats } });
    },

    async count(workspaceId: string) {
        return prisma.aIBot.count({ where: { workspaceId } });
    },

    async countActive(workspaceId: string) {
        return prisma.aIBot.count({ where: { workspaceId, isActive: true } });
    },
};
