import { KnowledgeEntryModel, IKnowledgeEntry } from './knowledge.model';

export const knowledgeRepo = {
    async create(data: Partial<IKnowledgeEntry>) {
        return KnowledgeEntryModel.create(data);
    },

    async createMany(entries: Partial<IKnowledgeEntry>[]) {
        // Use bulkWrite with upsert to avoid duplicates (by workspaceId + sheetRowIndex for sheets)
        if (entries.length === 0) return 0;

        const ops = entries.map(entry => ({
            updateOne: {
                filter: entry.source === 'google_sheets'
                    ? { workspaceId: entry.workspaceId, source: 'google_sheets', sheetRowIndex: entry.sheetRowIndex }
                    : { _id: entry._id || new (require('mongoose').Types.ObjectId)() },
                update: { $set: entry },
                upsert: true,
            }
        }));

        const result = await KnowledgeEntryModel.bulkWrite(ops);
        return result.upsertedCount + result.modifiedCount;
    },

    async findByWorkspace(workspaceId: string, filters?: { product?: string; source?: string }) {
        const query: any = { workspaceId };
        if (filters?.product) query.product = filters.product;
        if (filters?.source) query.source = filters.source;
        return KnowledgeEntryModel.find(query).sort({ product: 1, createdAt: -1 }).lean();
    },

    async search(workspaceId: string, queryText: string, limit = 5) {
        // Strategy 1: MongoDB $text search
        try {
            const textResults = await KnowledgeEntryModel.find(
                { workspaceId, $text: { $search: queryText } },
                { score: { $meta: 'textScore' } }
            )
                .sort({ score: { $meta: 'textScore' } })
                .limit(limit)
                .lean();

            if (textResults.length > 0) return textResults;
        } catch { /* text index might not exist yet */ }

        // Strategy 2: Regex fallback for Vietnamese text
        const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        if (words.length === 0) return [];

        const regexConditions = words.map(w => ({
            $or: [
                { question: { $regex: w, $options: 'i' } },
                { answer: { $regex: w, $options: 'i' } },
                { product: { $regex: w, $options: 'i' } },
                { keywords: { $regex: w, $options: 'i' } },
            ]
        }));

        return KnowledgeEntryModel.find({
            workspaceId,
            $or: regexConditions.length > 1
                ? [{ $and: regexConditions }, ...regexConditions]
                : regexConditions,
        })
            .limit(limit)
            .lean();
    },

    async findById(id: string) {
        return KnowledgeEntryModel.findById(id).lean();
    },

    async update(id: string, data: Partial<IKnowledgeEntry>) {
        return KnowledgeEntryModel.findByIdAndUpdate(id, data, { new: true }).lean();
    },

    async remove(id: string) {
        return KnowledgeEntryModel.findByIdAndDelete(id);
    },

    async removeByWorkspaceAndSource(workspaceId: string, source: string) {
        return KnowledgeEntryModel.deleteMany({ workspaceId, source });
    },

    async getProducts(workspaceId: string) {
        return KnowledgeEntryModel.distinct('product', { workspaceId });
    },

    async count(workspaceId: string) {
        return KnowledgeEntryModel.countDocuments({ workspaceId });
    },
};
