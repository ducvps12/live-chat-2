import mongoose, { Schema, Document } from 'mongoose';

export interface IKnowledgeEntry extends Document {
    workspaceId: mongoose.Types.ObjectId;
    product: string;            // e.g. "Gemini Ultra", "GPT Plus", "YouTube Premium"
    question: string;           // Câu hỏi khách thường hỏi
    answer: string;             // Mẫu trả lời
    upsaleText?: string;        // Text bán thêm / upsale
    keywords: string[];         // Extracted keywords for search
    source: 'google_sheets' | 'manual';
    sheetRowIndex?: number;     // Row index in Google Sheets (for sync updates)
    createdAt: Date;
    updatedAt: Date;
}

const knowledgeEntrySchema = new Schema<IKnowledgeEntry>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        product: { type: String, required: true, trim: true },
        question: { type: String, required: true },
        answer: { type: String, required: true },
        upsaleText: { type: String, default: '' },
        keywords: [{ type: String, trim: true }],
        source: { type: String, enum: ['google_sheets', 'manual'], default: 'manual' },
        sheetRowIndex: { type: Number },
    },
    { timestamps: true }
);

// Text search index for Vietnamese full-text matching
knowledgeEntrySchema.index(
    { question: 'text', answer: 'text', product: 'text', keywords: 'text' },
    { weights: { question: 10, product: 5, keywords: 8, answer: 2 }, name: 'knowledge_text_search' }
);

knowledgeEntrySchema.index({ workspaceId: 1, product: 1 });
knowledgeEntrySchema.index({ workspaceId: 1, source: 1 });

export const KnowledgeEntryModel = mongoose.model<IKnowledgeEntry>('KnowledgeEntry', knowledgeEntrySchema);
