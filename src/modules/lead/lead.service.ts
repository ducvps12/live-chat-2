import { LeadModel, ILead, LeadStage } from './lead.model';
import mongoose from 'mongoose';

interface ListLeadsQuery {
    workspaceId: string;
    stage?: LeadStage;
    source?: string;
    search?: string;
    tag?: string;
    assignedTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export const leadService = {
    async list(query: ListLeadsQuery) {
        const { workspaceId, stage, source, search, tag, assignedTo, page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = query;
        const filter: any = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };

        if (stage) filter.stage = stage;
        if (source) filter.source = source;
        if (tag) filter.tags = tag;
        if (assignedTo) filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const [leads, total] = await Promise.all([
            LeadModel.find(filter)
                .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('assignedTo', 'name email avatarUrl')
                .lean(),
            LeadModel.countDocuments(filter),
        ]);

        return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
    },

    async getById(leadId: string) {
        return LeadModel.findById(leadId).populate('assignedTo', 'name email avatarUrl').lean();
    },

    async create(data: Partial<ILead>) {
        const lead = new LeadModel(data);
        await lead.save();
        return lead.toObject();
    },

    async update(leadId: string, data: Partial<ILead>) {
        return LeadModel.findByIdAndUpdate(leadId, { $set: data }, { new: true }).lean();
    },

    async updateStage(leadId: string, stage: LeadStage) {
        return LeadModel.findByIdAndUpdate(leadId, { $set: { stage } }, { new: true }).lean();
    },

    async addNote(leadId: string, text: string, createdBy: string) {
        return LeadModel.findByIdAndUpdate(
            leadId,
            { $push: { notes: { text, createdAt: new Date(), createdBy: new mongoose.Types.ObjectId(createdBy) } } },
            { new: true }
        ).lean();
    },

    async delete(leadId: string) {
        return LeadModel.findByIdAndDelete(leadId);
    },

    async getStats(workspaceId: string) {
        const stages = await LeadModel.aggregate([
            { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
        ]);

        const sources = await LeadModel.aggregate([
            { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
        ]);

        const total = await LeadModel.countDocuments({ workspaceId: new mongoose.Types.ObjectId(workspaceId) });

        return {
            total,
            byStage: Object.fromEntries(stages.map(s => [s._id, s.count])),
            bySource: Object.fromEntries(sources.map(s => [s._id, s.count])),
        };
    },

    async convertFromContact(workspaceId: string, contactData: { name: string; phone?: string; avatar?: string; zaloUserId?: string; source?: string }) {
        // Check if lead already exists
        if (contactData.zaloUserId) {
            const existing = await LeadModel.findOne({ workspaceId: new mongoose.Types.ObjectId(workspaceId), zaloUserId: contactData.zaloUserId });
            if (existing) return existing.toObject();
        }

        const lead = new LeadModel({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            name: contactData.name,
            phone: contactData.phone || '',
            avatar: contactData.avatar || '',
            zaloUserId: contactData.zaloUserId || '',
            source: contactData.source || 'zalo',
            stage: 'mới',
        });

        await lead.save();
        return lead.toObject();
    },

    /**
     * Bulk convert group members to leads
     * Deduplicates by zaloUserId, auto-tags with group name
     */
    async bulkConvertFromGroup(workspaceId: string, data: {
        groupId: string;
        groupName: string;
        members: Array<{ userId: string; displayName: string; avatar?: string }>;
    }) {
        const { groupId, groupName, members } = data;
        let created = 0;
        let skipped = 0;
        const results: any[] = [];

        for (const member of members) {
            // Check if lead already exists by zaloUserId
            const existing = await LeadModel.findOne({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                zaloUserId: member.userId,
            });

            if (existing) {
                // Add group tag if not already present
                const groupTag = `group:${groupName}`;
                if (!existing.tags.includes(groupTag)) {
                    await LeadModel.findByIdAndUpdate(existing._id, {
                        $addToSet: { tags: groupTag },
                    });
                }
                skipped++;
                results.push({ userId: member.userId, status: 'skipped', leadId: existing._id });
                continue;
            }

            // Create new lead
            const lead = new LeadModel({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                name: member.displayName || `Thành viên ${member.userId.slice(-6)}`,
                avatar: member.avatar || '',
                zaloUserId: member.userId,
                source: 'zalo',
                stage: 'mới',
                tags: [`group:${groupName}`],
            });

            await lead.save();
            created++;
            results.push({ userId: member.userId, status: 'created', leadId: lead._id });
        }

        return {
            total: members.length,
            created,
            skipped,
            groupId,
            groupName,
            results,
        };
    },

    /**
     * Bulk convert group members to leads WITH phone/email enrichment
     * Deduplicates by zaloUserId, auto-tags with group name, updates phone/email if found
     */
    async bulkConvertFromGroupEnriched(workspaceId: string, data: {
        groupId: string;
        groupName: string;
        members: Array<{ userId: string; displayName: string; avatar?: string; phone?: string; email?: string }>;
    }) {
        const { groupId, groupName, members } = data;
        let created = 0;
        let skipped = 0;
        let updated = 0;
        const results: any[] = [];

        for (const member of members) {
            // Check if lead already exists by zaloUserId
            const existing = await LeadModel.findOne({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                zaloUserId: member.userId,
            });

            if (existing) {
                // Update phone/email/avatar if we have new data
                const updates: any = {};
                const groupTag = `group:${groupName}`;
                
                if (member.phone && !existing.phone) updates.phone = member.phone;
                if (member.email && !existing.email) updates.email = member.email;
                if (member.avatar && !existing.avatar) updates.avatar = member.avatar;
                
                const hasUpdates = Object.keys(updates).length > 0;
                const needsTag = !existing.tags.includes(groupTag);
                
                if (hasUpdates || needsTag) {
                    const updateOp: any = {};
                    if (hasUpdates) updateOp.$set = updates;
                    if (needsTag) updateOp.$addToSet = { tags: groupTag };
                    await LeadModel.findByIdAndUpdate(existing._id, updateOp);
                    if (hasUpdates) updated++;
                }
                
                skipped++;
                results.push({ userId: member.userId, status: hasUpdates ? 'updated' : 'skipped', leadId: existing._id });
                continue;
            }

            // Create new lead with enriched data
            const lead = new LeadModel({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                name: member.displayName || `Thành viên ${member.userId.slice(-6)}`,
                phone: member.phone || '',
                email: member.email || '',
                avatar: member.avatar || '',
                zaloUserId: member.userId,
                source: 'zalo',
                stage: 'mới',
                tags: [`group:${groupName}`],
            });

            await lead.save();
            created++;
            results.push({ userId: member.userId, status: 'created', leadId: lead._id });
        }

        return {
            total: members.length,
            created,
            skipped,
            updated,
            groupId,
            groupName,
            results,
        };
    },
};
