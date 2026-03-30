import axios from 'axios';
import mongoose from 'mongoose';
import { LeadModel, ILead } from './lead.model';
import { MessageModel } from '../conversation/repos/message.model';
import { ConversationModel } from '../conversation/repos/conversation.model';

// ── AI API configuration ──
const AI_API_URL = process.env.AI_API_URL || 'https://rk674rm.9router.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'sk-9aab752cd2d2aaf7-shwqj4-1ec380e6';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5';

// ── Analysis result interface ──
export interface AIAnalysisResult {
    name?: string;
    phone?: string;
    email?: string;
    intent?: 'mua_hàng' | 'hỏi_giá' | 'hỗ_trợ' | 'khiếu_nại' | 'khác';
    score?: number; // 0-100 lead potential score
    summary?: string;
    tags?: string[];
    products?: string[]; // products/services mentioned
    sentiment?: 'tích_cực' | 'trung_lập' | 'tiêu_cực';
    urgency?: 'cao' | 'trung_bình' | 'thấp';
}

// ── Intent labels for display ──
export const INTENT_LABELS: Record<string, string> = {
    'mua_hàng': '🛒 Muốn mua hàng',
    'hỏi_giá': '💰 Hỏi giá',
    'hỗ_trợ': '🔧 Cần hỗ trợ',
    'khiếu_nại': '⚠️ Khiếu nại',
    'khác': '💬 Khác',
};

// ── Stage mapping from intent ──
const INTENT_TO_STAGE: Record<string, string> = {
    'mua_hàng': 'chốt_đơn',
    'hỏi_giá': 'đang_tư_vấn',
    'hỗ_trợ': 'khách_hàng',
    'khiếu_nại': 'khách_hàng',
    'khác': 'mới',
};

/**
 * Build the analysis prompt for AI
 */
function buildAnalysisPrompt(): string {
    return `Bạn là trợ lý AI chuyên phân tích cuộc hội thoại chăm sóc khách hàng.
Hãy phân tích cuộc hội thoại bên dưới và trích xuất thông tin theo JSON format:

{
  "name": "Tên khách hàng (nếu tìm thấy, null nếu không)",
  "phone": "Số điện thoại (nếu tìm thấy, null nếu không)",
  "email": "Email (nếu tìm thấy, null nếu không)",
  "intent": "mua_hàng | hỏi_giá | hỗ_trợ | khiếu_nại | khác",
  "score": 0-100 (điểm tiềm năng mua hàng: 80-100=rất có khả năng mua, 50-79=tiềm năng, 20-49=thấp, 0-19=không quan tâm),
  "summary": "Tóm tắt nội dung cuộc hội thoại trong 1-2 câu ngắn gọn",
  "tags": ["tag1", "tag2"] (các tag mô tả ngắn gọn nhu cầu/đặc điểm khách hàng),
  "products": ["sản phẩm/dịch vụ được nhắc đến"],
  "sentiment": "tích_cực | trung_lập | tiêu_cực",
  "urgency": "cao | trung_bình | thấp"
}

Quy tắc:
- Chỉ trả về JSON thuần, KHÔNG có markdown, KHÔNG có giải thích.
- Số điện thoại VN thường có dạng 0xxx.xxx.xxx hoặc +84xxx.
- Email có dạng abc@domain.com.
- Nếu không tìm thấy thông tin, dùng null.
- Tags nên ngắn gọn, ví dụ: "quan tâm giá", "cần tư vấn", "khách VIP", "mua sỉ".
- Score dựa trên mức độ quan tâm thực sự (có hỏi giá, yêu cầu đặt hàng = score cao).`;
}

/**
 * Call AI API to analyze a conversation
 */
async function callAIAnalysis(conversationText: string): Promise<AIAnalysisResult | null> {
    try {
        console.log(`[LeadAI] Calling AI analysis (${conversationText.length} chars)...`);

        const response = await axios.post(
            `${AI_API_URL}/chat/completions`,
            {
                model: AI_MODEL,
                messages: [
                    { role: 'system', content: buildAnalysisPrompt() },
                    { role: 'user', content: `Phân tích cuộc hội thoại sau:\n\n${conversationText}` },
                ],
                max_tokens: 800,
                temperature: 0.3, // Low temperature for more consistent JSON output
                top_p: 0.9,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_API_KEY}`,
                },
                timeout: 60000, // 60s for analysis
            }
        );

        const reply = response.data?.choices?.[0]?.message?.content;
        if (!reply) {
            console.warn('[LeadAI] ⚠️ Empty response from AI');
            return null;
        }

        // Parse JSON from response (handle potential markdown wrapping)
        let jsonStr = reply.trim();
        // Remove markdown code block if present
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        }
        
        const parsed = JSON.parse(jsonStr) as AIAnalysisResult;
        console.log(`[LeadAI] ✅ Analysis complete:`, {
            name: parsed.name,
            phone: parsed.phone,
            email: parsed.email,
            intent: parsed.intent,
            score: parsed.score,
        });
        return parsed;
    } catch (err: any) {
        if (err instanceof SyntaxError) {
            console.error('[LeadAI] ❌ Failed to parse AI response as JSON:', err.message);
        } else {
            console.error('[LeadAI] ❌ AI call failed:', err?.response?.status, err?.response?.data || err.message);
        }
        return null;
    }
}

/**
 * Format conversation messages into readable text for AI analysis
 */
function formatConversationForAI(messages: any[]): string {
    return messages
        .filter(m => !m.isDeleted && m.content && m.type === 'text')
        .map(m => {
            const role = m.sender?.type === 'visitor' ? 'Khách' : (m.sender?.type === 'agent' ? 'Nhân viên' : 'Hệ thống');
            const name = m.sender?.name ? ` (${m.sender.name})` : '';
            return `[${role}${name}]: ${m.content}`;
        })
        .join('\n');
}

export const leadAIService = {
    /**
     * Analyze a single conversation and extract customer info
     * Creates or updates the corresponding Lead automatically
     */
    async analyzeConversation(
        workspaceId: string,
        conversationId: string,
        options?: { autoCreateLead?: boolean; forceReanalyze?: boolean }
    ): Promise<{ analysis: AIAnalysisResult | null; lead: any | null; conversationId: string }> {
        const { autoCreateLead = true } = options || {};

        // 1. Get conversation
        const conversation = await ConversationModel.findById(conversationId).lean();
        if (!conversation) {
            throw new Error('Cuộc hội thoại không tồn tại');
        }

        // 2. Get messages
        const messages = await MessageModel.find({ conversationId: new mongoose.Types.ObjectId(conversationId) })
            .sort({ createdAt: 1 })
            .limit(50) // Last 50 messages for context
            .lean();

        if (messages.length < 2) {
            console.log(`[LeadAI] Conversation ${conversationId} has too few messages (${messages.length}), skipping`);
            return { analysis: null, lead: null, conversationId };
        }

        // 3. Format & analyze
        const conversationText = formatConversationForAI(messages);
        if (conversationText.length < 20) {
            return { analysis: null, lead: null, conversationId };
        }

        const analysis = await callAIAnalysis(conversationText);
        if (!analysis) {
            return { analysis: null, lead: null, conversationId };
        }

        // 4. Store analysis result in conversation metadata
        await ConversationModel.findByIdAndUpdate(conversationId, {
            $set: {
                'metadata.aiAnalysis': {
                    ...analysis,
                    analyzedAt: new Date(),
                    messageCount: messages.length,
                },
            },
        });

        // 5. Auto-create/update Lead if enabled
        let lead = null;
        if (autoCreateLead) {
            lead = await this.upsertLeadFromAnalysis(workspaceId, conversation, analysis);
        }

        return { analysis, lead, conversationId };
    },

    /**
     * Create or update a Lead from AI analysis results
     */
    async upsertLeadFromAnalysis(
        workspaceId: string,
        conversation: any,
        analysis: AIAnalysisResult
    ): Promise<any> {
        const visitorId = conversation.visitorId;
        const channel = conversation.channel || 'widget';

        // Determine source from channel
        const sourceMap: Record<string, string> = {
            'zalo': 'zalo',
            'facebook': 'facebook',
            'widget': 'widget',
        };
        const source = sourceMap[channel] || 'widget';

        // Look for existing lead by visitorId metadata
        let existingLead = null;

        if (channel === 'zalo') {
            const zaloUserId = conversation.metadata?.zaloUserId || visitorId.replace('zalo_', '');
            existingLead = await LeadModel.findOne({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                zaloUserId,
            });
        } else if (channel === 'facebook') {
            const fbUserId = conversation.metadata?.fbUserId || visitorId.replace('fb_', '');
            existingLead = await LeadModel.findOne({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                fbUserId,
            });
        }

        // Also try matching by name from conversation visitor info
        if (!existingLead && conversation.visitorInfo?.name) {
            existingLead = await LeadModel.findOne({
                workspaceId: new mongoose.Types.ObjectId(workspaceId),
                name: conversation.visitorInfo.name,
                source,
            });
        }

        // Build update data from analysis
        const updateData: any = {};
        if (analysis.phone && analysis.phone !== 'null') updateData.phone = analysis.phone;
        if (analysis.email && analysis.email !== 'null') updateData.email = analysis.email;
        if (analysis.score !== undefined && analysis.score !== null) updateData.score = Math.min(100, Math.max(0, analysis.score));
        
        // Build tags from analysis
        const aiTags: string[] = [];
        if (analysis.intent) aiTags.push(`intent:${analysis.intent}`);
        if (analysis.sentiment) aiTags.push(`sentiment:${analysis.sentiment}`);
        if (analysis.urgency) aiTags.push(`urgency:${analysis.urgency}`);
        if (analysis.products?.length) {
            analysis.products.forEach(p => aiTags.push(`product:${p}`));
        }
        if (analysis.tags?.length) {
            analysis.tags.forEach(t => aiTags.push(t));
        }

        // Store AI summary in metadata
        const aiMetadata = {
            aiSummary: analysis.summary || '',
            aiIntent: analysis.intent || 'khác',
            aiScore: analysis.score || 0,
            aiSentiment: analysis.sentiment || 'trung_lập',
            aiUrgency: analysis.urgency || 'thấp',
            aiProducts: analysis.products || [],
            aiAnalyzedAt: new Date(),
        };

        if (existingLead) {
            // Update existing lead — merge, don't overwrite existing data
            const mergedUpdate: any = { ...updateData };
            if (updateData.phone && existingLead.phone) delete mergedUpdate.phone; // Don't overwrite existing phone
            if (updateData.email && existingLead.email) delete mergedUpdate.email; // Don't overwrite existing email

            // Update name from AI if visitor has generic name
            if (analysis.name && analysis.name !== 'null' && (!existingLead.name || existingLead.name.startsWith('Thành viên'))) {
                mergedUpdate.name = analysis.name;
            }

            // Suggested stage from intent
            if (analysis.intent && INTENT_TO_STAGE[analysis.intent]) {
                const suggestedStage = INTENT_TO_STAGE[analysis.intent];
                // Only auto-upgrade stage, never downgrade
                const stageOrder = ['mới', 'tiềm_năng', 'đang_tư_vấn', 'chốt_đơn', 'khách_hàng'];
                const currentIdx = stageOrder.indexOf(existingLead.stage);
                const suggestedIdx = stageOrder.indexOf(suggestedStage);
                if (suggestedIdx > currentIdx && existingLead.stage !== 'từ_chối') {
                    mergedUpdate.stage = suggestedStage;
                }
            }

            // Merge tags (avoid duplicates)
            const existingTags = new Set(existingLead.tags || []);
            const newTags = aiTags.filter(t => !existingTags.has(t));
            
            const updateOp: any = { $set: mergedUpdate };
            if (newTags.length > 0) {
                updateOp.$addToSet = { tags: { $each: newTags } };
            }

            // Store AI analysis in notes
            if (analysis.summary) {
                updateOp.$push = {
                    notes: {
                        text: `🤖 AI Phân tích: ${analysis.summary}${analysis.intent ? ` | Ý định: ${INTENT_LABELS[analysis.intent] || analysis.intent}` : ''}${analysis.score !== undefined ? ` | Score: ${analysis.score}/100` : ''}`,
                        createdAt: new Date(),
                        createdBy: null,
                    },
                };
            }

            const updated = await LeadModel.findByIdAndUpdate(existingLead.id, updateOp, { new: true }).lean();
            console.log(`[LeadAI] ✅ Updated lead ${existingLead.id} with AI analysis`);
            return updated;
        } else {
            // Create new lead
            const visitorName = analysis.name || conversation.visitorInfo?.name || `Khách ${visitorId.slice(-6)}`;
            const newLeadData: Partial<ILead> = {
                workspaceId: new mongoose.Types.ObjectId(workspaceId) as any,
                name: visitorName,
                phone: updateData.phone || '',
                email: updateData.email || '',
                avatar: conversation.visitorInfo?.avatar || '',
                stage: (analysis.intent ? (INTENT_TO_STAGE[analysis.intent] as any) : 'mới') || 'mới',
                source: source as any,
                score: updateData.score || 0,
                tags: aiTags,
                conversationCount: 1,
                lastContactedAt: new Date(),
                notes: analysis.summary ? [{
                    text: `🤖 AI Phân tích: ${analysis.summary}${analysis.intent ? ` | Ý định: ${INTENT_LABELS[analysis.intent] || analysis.intent}` : ''}${analysis.score !== undefined ? ` | Score: ${analysis.score}/100` : ''}`,
                    createdAt: new Date(),
                    createdBy: null as any,
                }] : [],
            };

            // Set platform-specific IDs
            if (channel === 'zalo') {
                newLeadData.zaloUserId = conversation.metadata?.zaloUserId || visitorId.replace('zalo_', '');
            } else if (channel === 'facebook') {
                newLeadData.fbUserId = conversation.metadata?.fbUserId || visitorId.replace('fb_', '');
            }

            const lead = new LeadModel(newLeadData);
            await lead.save();
            console.log(`[LeadAI] ✅ Created new lead ${lead.id} from AI analysis`);
            return lead.toObject();
        }
    },

    /**
     * Bulk analyze all conversations in a workspace
     * Only analyzes conversations that haven't been analyzed yet (or analyzed > 24h ago)
     */
    async analyzeBulk(
        workspaceId: string,
        options?: { limit?: number; forceReanalyze?: boolean }
    ): Promise<{
        total: number;
        analyzed: number;
        skipped: number;
        failed: number;
        results: Array<{ conversationId: string; status: string; intent?: string; score?: number }>;
    }> {
        const { limit = 50, forceReanalyze = false } = options || {};
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

        // Find conversations to analyze
        const filter: any = {
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
        };

        if (!forceReanalyze) {
            filter.$or = [
                { 'metadata.aiAnalysis': { $exists: false } },
                { 'metadata.aiAnalysis.analyzedAt': { $lt: cutoffDate } },
            ];
        }

        const conversations = await ConversationModel.find(filter)
            .sort({ lastMessageAt: -1 })
            .limit(limit)
            .select('_id visitorId visitorInfo channel metadata')
            .lean();

        let analyzed = 0;
        let skipped = 0;
        let failed = 0;
        const results: Array<{ conversationId: string; status: string; intent?: string; score?: number }> = [];

        for (const conv of conversations) {
            try {
                const result = await this.analyzeConversation(
                    workspaceId,
                    (conv.id).toString(),
                    { autoCreateLead: true }
                );

                if (result.analysis) {
                    analyzed++;
                    results.push({
                        conversationId: (conv.id).toString(),
                        status: 'analyzed',
                        intent: result.analysis.intent,
                        score: result.analysis.score,
                    });
                } else {
                    skipped++;
                    results.push({
                        conversationId: (conv.id).toString(),
                        status: 'skipped',
                    });
                }

                // Rate limiting: wait 1s between calls to avoid overloading API
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err: any) {
                failed++;
                results.push({
                    conversationId: (conv.id).toString(),
                    status: 'failed',
                });
                console.error(`[LeadAI] Failed to analyze conv ${(conv.id).toString()}:`, err.message);
            }
        }

        return {
            total: conversations.length,
            analyzed,
            skipped,
            failed,
            results,
        };
    },

    /**
     * Quick analysis: extract just phone/email/name from recent messages
     * Used for auto-extraction hook (lightweight, no full analysis)
     */
    async quickExtract(
        workspaceId: string,
        conversationId: string,
        recentMessages: Array<{ sender: any; content: string }>
    ): Promise<void> {
        try {
            const visitorMessages = recentMessages
                .filter(m => m.sender?.type === 'visitor' && m.content)
                .map(m => m.content)
                .join(' ');

            if (visitorMessages.length < 10) return;

            // Quick regex extraction (no AI call needed for basic info)
            const phoneMatch = visitorMessages.match(/(?:\+84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/);
            const emailMatch = visitorMessages.match(/[\w.+-]+@[\w-]+\.[\w.]+/);

            if (!phoneMatch && !emailMatch) return;

            // Find conversation to get visitor info
            const conversation = await ConversationModel.findById(conversationId).lean();
            if (!conversation) return;

            const channel = (conversation as any).channel || 'widget';
            let lead = null;

            if (channel === 'zalo') {
                const zaloUserId = (conversation as any).metadata?.zaloUserId || conversation.visitorId.replace('zalo_', '');
                lead = await LeadModel.findOne({
                    workspaceId: new mongoose.Types.ObjectId(workspaceId),
                    zaloUserId,
                });
            } else if (channel === 'facebook') {
                const fbUserId = (conversation as any).metadata?.fbUserId || conversation.visitorId.replace('fb_', '');
                lead = await LeadModel.findOne({
                    workspaceId: new mongoose.Types.ObjectId(workspaceId),
                    fbUserId,
                });
            }

            if (lead) {
                const updates: any = {};
                if (phoneMatch && !lead.phone) updates.phone = phoneMatch[0].replace(/[\s.-]/g, '');
                if (emailMatch && !lead.email) updates.email = emailMatch[0];

                if (Object.keys(updates).length > 0) {
                    await LeadModel.findByIdAndUpdate(lead.id, { $set: updates });
                    console.log(`[LeadAI] Quick-extracted info for lead ${lead.id}:`, updates);
                }
            }
        } catch (err) {
            console.error('[LeadAI] Quick extract error:', err);
        }
    },

    /**
     * Get AI analysis for a conversation (from cache/metadata)
     */
    async getAnalysis(conversationId: string): Promise<AIAnalysisResult | null> {
        const conv = await ConversationModel.findById(conversationId).select('metadata').lean();
        return (conv as any)?.metadata?.aiAnalysis || null;
    },
};
