import { DistributionRuleModel, IDistributionRule, IRuleCondition } from './repos/distributionRule.model';
import mongoose from 'mongoose';

class DistributionService {

    async create(workspaceId: string, userId: string, data: {
        name: string;
        description?: string;
        priority?: number;
        conditions: IRuleCondition[];
        conditionLogic?: 'all' | 'any';
        action: IDistributionRule['action'];
    }) {
        return DistributionRuleModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            ...data,
            createdBy: new mongoose.Types.ObjectId(userId),
        });
    }

    async update(ruleId: string, workspaceId: string, data: Partial<{
        name: string;
        description: string;
        priority: number;
        isActive: boolean;
        conditions: IRuleCondition[];
        conditionLogic: 'all' | 'any';
        action: IDistributionRule['action'];
    }>) {
        const rule = await DistributionRuleModel.findById(ruleId);
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return DistributionRuleModel.findByIdAndUpdate(ruleId, { $set: data }, { new: true });
    }

    async delete(ruleId: string, workspaceId: string) {
        const rule = await DistributionRuleModel.findById(ruleId);
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return DistributionRuleModel.findByIdAndDelete(ruleId);
    }

    async list(workspaceId: string) {
        return DistributionRuleModel
            .find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) })
            .sort({ priority: -1, createdAt: -1 })
            .lean();
    }

    async getById(ruleId: string, workspaceId: string) {
        const rule = await DistributionRuleModel.findById(ruleId).lean();
        if (!rule) throw new Error('Rule không tồn tại');
        if (rule.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return rule;
    }

    /**
     * Evaluate all active rules against a conversation and return the assigned agent ID
     */
    async evaluateRules(workspaceId: string, conversationData: {
        channel: string;
        source?: string;
        tags?: string[];
        url?: string;
        visitorCountry?: string;
        visitorVisits?: number;
        previousAgentId?: string;
    }): Promise<string | null> {
        const rules = await DistributionRuleModel
            .find({ workspaceId: new mongoose.Types.ObjectId(workspaceId), isActive: true })
            .sort({ priority: -1 })
            .lean();

        for (const rule of rules) {
            if (this.matchesConditions(rule, conversationData)) {
                const agentId = await this.resolveAction(rule, conversationData);
                if (agentId) {
                    // Update stats
                    await DistributionRuleModel.findByIdAndUpdate(rule._id, {
                        $inc: { 'stats.totalMatched': 1 },
                        $set: { 'stats.lastMatchedAt': new Date() },
                    });
                    return agentId;
                }
            }
        }

        return null;
    }

    private matchesConditions(rule: IDistributionRule, data: any): boolean {
        const results = rule.conditions.map(cond => this.evaluateCondition(cond, data));
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

    private async resolveAction(rule: IDistributionRule, data: any): Promise<string | null> {
        switch (rule.action.type) {
            case 'assign_agent':
                return rule.action.agentIds?.[0]?.toString() || null;

            case 'round_robin': {
                const agents = rule.action.agentIds || [];
                if (agents.length === 0) return null;
                const nextIndex = (rule.lastAssignedIndex + 1) % agents.length;
                await DistributionRuleModel.findByIdAndUpdate(rule._id, { lastAssignedIndex: nextIndex });
                return agents[nextIndex].toString();
            }

            case 'previous_agent':
                return data.previousAgentId || null;

            case 'least_busy':
                // Fallback to first agent — full implementation would query active conversation counts
                return rule.action.agentIds?.[0]?.toString() || null;

            default:
                return null;
        }
    }
}

export const distributionService = new DistributionService();
