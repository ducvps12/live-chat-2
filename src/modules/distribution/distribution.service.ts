import prisma from '../../infra/prisma';
import type { DistributionRule } from '@prisma/client';

export interface IRuleCondition {
    field: string;
    operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'lt';
    value: string;
}

class DistributionService {
    async create(workspaceId: string, userId: string, data: {
        name: string;
        description?: string;
        priority?: number;
        conditions: IRuleCondition[];
        conditionLogic?: 'all' | 'any';
        action: any;
    }) {
        return prisma.distributionRule.create({
            data: {
                workspaceId,
                name: data.name,
                description: data.description || null,
                priority: data.priority || 0,
                conditions: data.conditions as any,
                conditionLogic: data.conditionLogic || 'all',
                action: data.action,
                createdById: userId,
            },
        });
    }

    async update(ruleId: string, workspaceId: string, data: Partial<{
        name: string;
        description: string;
        priority: number;
        isActive: boolean;
        conditions: IRuleCondition[];
        conditionLogic: 'all' | 'any';
        action: any;
    }>) {
        const rule = await prisma.distributionRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return prisma.distributionRule.update({ where: { id: ruleId }, data: data as any });
    }

    async delete(ruleId: string, workspaceId: string) {
        const rule = await prisma.distributionRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return prisma.distributionRule.delete({ where: { id: ruleId } });
    }

    async list(workspaceId: string) {
        return prisma.distributionRule.findMany({
            where: { workspaceId },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    async getById(ruleId: string, workspaceId: string) {
        const rule = await prisma.distributionRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return rule;
    }

    async evaluateRules(workspaceId: string, conversationData: {
        channel: string;
        source?: string;
        tags?: string[];
        url?: string;
        visitorCountry?: string;
        visitorVisits?: number;
        previousAgentId?: string;
    }): Promise<string | null> {
        const rules = await prisma.distributionRule.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { priority: 'desc' },
        });

        for (const rule of rules) {
            if (this.matchesConditions(rule, conversationData)) {
                const agentId = await this.resolveAction(rule, conversationData);
                if (agentId) {
                    // Update stats
                    const stats = (rule.stats as any) || {};
                    stats.totalMatched = (stats.totalMatched || 0) + 1;
                    stats.lastMatchedAt = new Date();
                    await prisma.distributionRule.update({
                        where: { id: rule.id },
                        data: { stats },
                    });
                    return agentId;
                }
            }
        }

        return null;
    }

    private matchesConditions(rule: DistributionRule, data: any): boolean {
        const conditions = (rule.conditions as IRuleCondition[]) || [];
        const results = conditions.map(cond => this.evaluateCondition(cond, data));
        return rule.conditionLogic === 'any'
            ? results.some(r => r)
            : results.every(r => r);
    }

    private evaluateCondition(cond: IRuleCondition, data: any): boolean {
        const fieldMap: Record<string, string> = {
            channel: data.channel,
            source: data.source || '',
            tag: (data.tags || []).join(','),
            url: data.url || '',
            visitor_country: data.visitorCountry || '',
            visitor_visits: String(data.visitorVisits || 0),
        };
        const fieldValue = fieldMap[cond.field] || '';
        const condValue = cond.value;

        switch (cond.operator) {
            case 'eq': return fieldValue === condValue;
            case 'neq': return fieldValue !== condValue;
            case 'contains': return fieldValue.includes(condValue);
            case 'not_contains': return !fieldValue.includes(condValue);
            case 'gt': return Number(fieldValue) > Number(condValue);
            case 'lt': return Number(fieldValue) < Number(condValue);
            default: return false;
        }
    }

    private async resolveAction(rule: DistributionRule, data: any): Promise<string | null> {
        const action = rule.action as any;
        switch (action.type) {
            case 'assign_agent':
                return action.agentIds?.[0] || null;
            case 'round_robin': {
                const agents = action.agentIds || [];
                if (agents.length === 0) return null;
                const nextIndex = (rule.lastAssignedIndex + 1) % agents.length;
                await prisma.distributionRule.update({
                    where: { id: rule.id },
                    data: { lastAssignedIndex: nextIndex },
                });
                return agents[nextIndex];
            }
            case 'previous_agent':
                return data.previousAgentId || null;
            case 'least_busy':
                return action.agentIds?.[0] || null;
            default:
                return null;
        }
    }
}

export const distributionService = new DistributionService();
