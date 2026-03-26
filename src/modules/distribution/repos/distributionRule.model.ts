import mongoose, { Schema, Document } from 'mongoose';

export type ConditionField = 'channel' | 'source' | 'tag' | 'url' | 'visitor_country' | 'visitor_visits';
export type ConditionOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'lt';
export type ActionType = 'assign_agent' | 'assign_group' | 'round_robin' | 'least_busy' | 'previous_agent';

export interface IRuleCondition {
    field: ConditionField;
    operator: ConditionOperator;
    value: string;
}

export interface IDistributionRule extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    priority: number;
    isActive: boolean;
    conditions: IRuleCondition[];
    conditionLogic: 'all' | 'any';  // AND / OR
    action: {
        type: ActionType;
        agentIds?: mongoose.Types.ObjectId[];
        groupId?: string;
    };
    // Round-robin state
    lastAssignedIndex: number;
    stats: {
        totalMatched: number;
        lastMatchedAt?: Date;
    };
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const distributionRuleSchema = new Schema<IDistributionRule>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        priority: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        conditions: [{
            field: { type: String, enum: ['channel', 'source', 'tag', 'url', 'visitor_country', 'visitor_visits'], required: true },
            operator: { type: String, enum: ['eq', 'neq', 'contains', 'not_contains', 'gt', 'lt'], required: true },
            value: { type: String, required: true },
        }],
        conditionLogic: { type: String, enum: ['all', 'any'], default: 'all' },
        action: {
            type: { type: String, enum: ['assign_agent', 'assign_group', 'round_robin', 'least_busy', 'previous_agent'], required: true },
            agentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            groupId: { type: String },
        },
        lastAssignedIndex: { type: Number, default: 0 },
        stats: {
            totalMatched: { type: Number, default: 0 },
            lastMatchedAt: { type: Date },
        },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

distributionRuleSchema.index({ workspaceId: 1, isActive: 1, priority: -1 });

export const DistributionRuleModel = mongoose.model<IDistributionRule>('DistributionRule', distributionRuleSchema);
