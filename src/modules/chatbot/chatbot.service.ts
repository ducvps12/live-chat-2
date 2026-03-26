import { chatbotRepo } from './repos/chatbot.repo';
import { AppError } from '../../middlewares/errorHandler';
import { knowledgeService } from '../knowledge/knowledge.service';
import axios from 'axios';

// ── AI API configuration ──
const AI_API_URL = process.env.AI_API_URL || 'http://163.61.111.226:8318/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'friend-key-alpha';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5';

/**
 * Normalize Vietnamese text for matching
 */
function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\sàáảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/g, '')
        .trim();
}

/**
 * Check if a message matches a scenario trigger
 */
function matchScenario(message: string, trigger: string, triggerType: string): boolean {
    const normalizedMsg = normalize(message);
    const normalizedTrigger = normalize(trigger);

    switch (triggerType) {
        case 'keyword':
            return normalizedMsg.split(/\s+/).some(w => w === normalizedTrigger);
        case 'contains':
            return normalizedMsg.includes(normalizedTrigger);
        case 'regex':
            try {
                return new RegExp(trigger, 'i').test(message);
            } catch {
                return false;
            }
        default:
            return normalizedMsg.includes(normalizedTrigger);
    }
}

/**
 * Build system prompt from bot configuration
 */
function buildSystemPrompt(bot: any, knowledgeContext?: string): string {
    const taskMap: Record<string, string> = {
        customer_care: 'chăm sóc khách hàng, giải đáp thắc mắc và hỗ trợ khách hàng',
        sales: 'tư vấn bán hàng, giới thiệu sản phẩm và chốt đơn',
        technical_support: 'hỗ trợ kỹ thuật, giải quyết vấn đề kỹ thuật cho khách hàng',
    };
    const styleMap: Record<string, string> = {
        friendly: 'thân thiện, gần gũi, sử dụng emoji phù hợp',
        professional: 'chuyên nghiệp, lịch sự, trang trọng',
        casual: 'thoải mái, tự nhiên như bạn bè',
    };
    const lengthMap: Record<string, string> = {
        short: 'Trả lời ngắn gọn, súc tích, tối đa 2-3 câu.',
        medium: 'Trả lời vừa phải, đầy đủ thông tin nhưng không dài dòng.',
        long: 'Trả lời chi tiết, giải thích kỹ lưỡng.',
    };

    let prompt = `Bạn là "${bot.name}"`;
    if (bot.brandName) prompt += `, đại diện cho thương hiệu "${bot.brandName}"`;
    prompt += '.\n';

    if (bot.brandDescription) {
        prompt += `Mô tả thương hiệu: ${bot.brandDescription}\n`;
    }

    prompt += `\nNhiệm vụ chính: ${taskMap[bot.mainTask] || 'hỗ trợ khách hàng'}.\n`;
    prompt += `Phong cách: ${styleMap[bot.conversationStyle] || 'thân thiện'}.\n`;
    prompt += `${lengthMap[bot.messageLength] || 'Trả lời vừa phải.'}\n`;

    prompt += '\nQuy tắc:\n';
    prompt += '- Luôn trả lời bằng tiếng Việt trừ khi khách hỏi bằng ngôn ngữ khác.\n';
    prompt += '- Không bịa đặt thông tin. Nếu không biết, hãy nói không biết và đề xuất liên hệ nhân viên.\n';
    prompt += '- Không tiết lộ rằng bạn là AI/chatbot trừ khi được hỏi trực tiếp.\n';

    if (knowledgeContext) {
        prompt += `\nThông tin tham khảo từ knowledge base:\n${knowledgeContext}\n`;
        prompt += 'Hãy ưu tiên sử dụng thông tin trên để trả lời. Nếu câu hỏi nằm ngoài, hãy trả lời theo hiểu biết chung.\n';
    }

    return prompt;
}

/**
 * Call OpenAI-compatible API to generate AI response
 */
async function callAI(
    systemPrompt: string,
    userMessage: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    modelOverride?: string
): Promise<string | null> {
    const model = modelOverride || AI_MODEL;
    try {
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];

        // Add recent conversation history for context (last 6 messages max)
        if (conversationHistory && conversationHistory.length > 0) {
            const recent = conversationHistory.slice(-6);
            messages.push(...recent);
        }

        messages.push({ role: 'user', content: userMessage });

        console.log(`[AI] Calling ${AI_API_URL}/chat/completions with model ${model}...`);

        const response = await axios.post(
            `${AI_API_URL}/chat/completions`,
            {
                model,
                messages,
                max_tokens: 500,
                temperature: 0.7,
                top_p: 0.9,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_API_KEY}`,
                },
                timeout: 30000, // 30s timeout
            }
        );

        const reply = response.data?.choices?.[0]?.message?.content;
        if (reply) {
            console.log(`[AI] ✅ Got response (${reply.length} chars)`);
            return reply.trim();
        }

        console.warn('[AI] ⚠️ Empty response from API');
        return null;
    } catch (err: any) {
        console.error('[AI] ❌ API call failed:', err?.response?.status, err?.response?.data || err.message);
        return null;
    }
}

export const chatbotService = {
    // ────────── CRUD ──────────

    async list(workspaceId: string) {
        return chatbotRepo.findByWorkspace(workspaceId);
    },

    async getOne(id: string) {
        const bot = await chatbotRepo.findById(id);
        if (!bot) throw new AppError('Bot không tồn tại', 404, 'NOT_FOUND');
        return bot;
    },

    async create(workspaceId: string, data: any) {
        return chatbotRepo.create({ ...data, workspaceId });
    },

    async update(id: string, data: any) {
        const existing = await chatbotRepo.findById(id);
        if (!existing) throw new AppError('Bot không tồn tại', 404, 'NOT_FOUND');
        return chatbotRepo.update(id, data);
    },

    async remove(id: string) {
        const existing = await chatbotRepo.findById(id);
        if (!existing) throw new AppError('Bot không tồn tại', 404, 'NOT_FOUND');
        return chatbotRepo.remove(id);
    },

    async toggleActive(id: string, isActive: boolean) {
        return chatbotRepo.toggleActive(id, isActive);
    },

    async getStats(workspaceId: string) {
        const total = await chatbotRepo.count(workspaceId);
        const active = await chatbotRepo.countActive(workspaceId);
        return { total, active };
    },

    // ────────── AI Auto-Reply Engine ──────────

    /**
     * Process an incoming customer message and generate a bot response
     * Pipeline: Scenario matching → Knowledge base + AI → Default greeting
     * @returns { response, bot, matchedScenario } or null if no bot should respond
     */
    async processIncomingMessage(
        workspaceId: string,
        message: string,
        channel: 'website' | 'messenger' | 'zalo' | 'instagram' = 'website',
        conversationHistory?: Array<{ role: string; content: string }>
    ): Promise<{ response: string; botId: string; botName: string; quickReplies?: any[] } | null> {
        // 1. Find active bots for this workspace + channel
        const activeBots = await chatbotRepo.findActive(workspaceId, channel);
        if (activeBots.length === 0) return null;

        const bot = activeBots[0]; // Use the first matching bot

        // 2. Try to match a scenario (exact/keyword/regex — instant response)
        if (bot.scenarios && bot.scenarios.length > 0) {
            const sorted = [...bot.scenarios].sort((a, b) => (b.priority || 0) - (a.priority || 0));
            for (const scenario of sorted) {
                if (matchScenario(message, scenario.trigger, scenario.triggerType)) {
                    await chatbotRepo.incrementStats(String(bot._id), 'totalReplies');
                    return {
                        response: scenario.response,
                        botId: String(bot._id),
                        botName: bot.name,
                        quickReplies: bot.quickReplies,
                    };
                }
            }
        }

        // 3. AI-powered response (OpenAI-compatible API)
        try {
            // Gather knowledge base context
            let knowledgeContext = '';
            try {
                const knowledgeResults = await knowledgeService.smartSuggest(workspaceId, message);
                if (knowledgeResults && knowledgeResults.length > 0) {
                    knowledgeContext = knowledgeResults
                        .slice(0, 3)
                        .map((k: any) => `Q: ${k.question}\nA: ${k.answer}`)
                        .join('\n\n');
                }
            } catch {
                // Knowledge base may not be available
            }

            // Build system prompt from bot config
            const systemPrompt = buildSystemPrompt(bot, knowledgeContext || undefined);

            // Call AI API (use per-bot model if configured)
            const botModel = (bot as any).aiModel || undefined;
            const aiResponse = await callAI(systemPrompt, message, conversationHistory, botModel);

            if (aiResponse) {
                await chatbotRepo.incrementStats(String(bot._id), 'totalReplies');
                return {
                    response: aiResponse,
                    botId: String(bot._id),
                    botName: bot.name,
                    quickReplies: bot.quickReplies,
                };
            }
        } catch (err) {
            console.error('[ChatbotService] AI response failed:', err);
        }

        // 4. Fallback: pure knowledge base response (no AI)
        try {
            const knowledgeResults = await knowledgeService.smartSuggest(workspaceId, message);
            if (knowledgeResults && knowledgeResults.length > 0) {
                const best = knowledgeResults[0];
                const response = best.answer || best.question;
                await chatbotRepo.incrementStats(String(bot._id), 'totalReplies');
                return {
                    response,
                    botId: String(bot._id),
                    botName: bot.name,
                    quickReplies: bot.quickReplies,
                };
            }
        } catch (err) {
            console.error('[ChatbotService] Knowledge search failed:', err);
        }

        // 5. Default greeting if no match
        if (bot.customGreeting) {
            return {
                response: bot.customGreeting,
                botId: String(bot._id),
                botName: bot.name,
                quickReplies: bot.quickReplies,
            };
        }

        return null;
    },
};
