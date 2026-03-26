import { knowledgeRepo } from './repos/knowledge.repo';
import { AppError } from '../../middlewares/errorHandler';

// Vietnamese keyword extraction — simple but effective
function extractKeywords(text: string): string[] {
    if (!text) return [];
    const stopWords = new Set(['và', 'của', 'cho', 'với', 'trong', 'là', 'có', 'không', 'được', 'này', 'đó', 'thì', 'nếu', 'khi', 'như', 'từ', 'về', 'đã', 'sẽ', 'đang', 'còn', 'các', 'một', 'những', 'mình', 'bạn', 'anh', 'chị', 'em', 'ạ', 'nhé', 'nha', 'vậy', 'rồi', 'ơi', 'dạ', 'bên', 'lại']);
    return text
        .toLowerCase()
        .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w))
        .filter((w, i, arr) => arr.indexOf(w) === i) // dedupe
        .slice(0, 20);
}

/**
 * Parse Google Sheets CSV export URL from any share URL
 */
function buildSheetCsvUrl(sheetUrl: string, gid?: string): string {
    // Extract spreadsheet ID from URL
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) throw new AppError('URL Google Sheets không hợp lệ', 400, 'INVALID_SHEET_URL');
    const sheetId = match[1];

    // Extract gid from URL if present
    if (!gid) {
        const gidMatch = sheetUrl.match(/gid=(\d+)/);
        gid = gidMatch ? gidMatch[1] : '0';
    }

    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

/**
 * Parse CSV text into rows (handles quoted fields with newlines)
 */
function parseCsv(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentRow.push(currentField.trim());
                if (currentRow.some(f => f.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                if (char === '\r') i++; // skip \n after \r
            } else {
                currentField += char;
            }
        }
    }

    // Last field/row
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

export const knowledgeService = {
    /**
     * Sync knowledge entries from a Google Sheets URL
     * Expected columns: [STT, Sản phẩm, Câu hỏi, Cách trả lời, Upsale]
     */
    async syncFromGoogleSheets(workspaceId: string, sheetUrl: string) {
        const csvUrl = buildSheetCsvUrl(sheetUrl);
        console.log(`[KnowledgeService] Fetching CSV from: ${csvUrl}`);

        // Fetch CSV data
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new AppError(`Không thể tải dữ liệu từ Google Sheets (${response.status})`, 400, 'SHEET_FETCH_FAILED');
        }
        const csvText = await response.text();
        const rows = parseCsv(csvText);

        if (rows.length < 2) {
            throw new AppError('Google Sheets không có dữ liệu', 400, 'SHEET_EMPTY');
        }

        // Skip header row, parse entries
        // Columns: A=STT, B=Sản phẩm, C=Câu hỏi, D=Cách trả lời, E=Upsale
        const entries: any[] = [];
        let currentProduct = '';

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const product = (row[1] || '').trim();
            const question = (row[2] || '').trim();
            const answer = (row[3] || '').trim();
            const upsale = (row[4] || '').trim();

            // Track current product (some rows may not repeat product name)
            if (product) currentProduct = product;

            // Skip rows without question or answer
            if (!question && !answer) continue;

            const keywords = [
                ...extractKeywords(question),
                ...extractKeywords(currentProduct),
            ];

            entries.push({
                workspaceId,
                product: currentProduct || 'Chung',
                question: question || `(${currentProduct})`,
                answer: answer || question, // If no answer, use question as fallback
                upsaleText: upsale,
                keywords,
                source: 'google_sheets',
                sheetRowIndex: i,
            });
        }

        // Bulk upsert
        const savedCount = await knowledgeRepo.createMany(entries);

        console.log(`[KnowledgeService] Synced ${savedCount} entries from Google Sheets`);
        return {
            totalRows: rows.length - 1,
            syncedEntries: entries.length,
            savedCount,
        };
    },

    /**
     * Search knowledge base — used for manual search and auto-suggest
     */
    async search(workspaceId: string, query: string, limit = 5) {
        return knowledgeRepo.search(workspaceId, query, limit);
    },

    /**
     * Smart suggest based on incoming customer message
     * Analyzes the message and returns best matching Q&A entries
     */
    async smartSuggest(workspaceId: string, customerMessage: string) {
        if (!customerMessage || customerMessage.length < 3) return [];

        // Extract meaningful search terms
        const searchQuery = customerMessage
            .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/g, ' ')
            .trim();

        return knowledgeRepo.search(workspaceId, searchQuery, 3);
    },

    /**
     * Get all entries, optionally filtered by product
     */
    async getAll(workspaceId: string, filters?: { product?: string }) {
        return knowledgeRepo.findByWorkspace(workspaceId, filters);
    },

    /**
     * Get distinct product categories
     */
    async getProducts(workspaceId: string) {
        return knowledgeRepo.getProducts(workspaceId);
    },

    /**
     * Create manual entry
     */
    async create(workspaceId: string, data: { product: string; question: string; answer: string; upsaleText?: string }) {
        const keywords = [
            ...extractKeywords(data.question),
            ...extractKeywords(data.product),
        ];
        return knowledgeRepo.create({
            workspaceId: workspaceId as any,
            ...data,
            keywords,
            source: 'manual',
        });
    },

    /**
     * Update entry
     */
    async update(id: string, data: { product?: string; question?: string; answer?: string; upsaleText?: string }) {
        const existing = await knowledgeRepo.findById(id);
        if (!existing) throw new AppError('Knowledge entry không tồn tại', 404, 'NOT_FOUND');

        // Re-extract keywords if question/product changed
        let keywords = existing.keywords;
        if (data.question || data.product) {
            keywords = [
                ...extractKeywords(data.question || existing.question),
                ...extractKeywords(data.product || existing.product),
            ];
        }

        return knowledgeRepo.update(id, { ...data, keywords });
    },

    /**
     * Delete entry
     */
    async remove(id: string) {
        const existing = await knowledgeRepo.findById(id);
        if (!existing) throw new AppError('Knowledge entry không tồn tại', 404, 'NOT_FOUND');
        return knowledgeRepo.remove(id);
    },

    /**
     * Get stats
     */
    async getStats(workspaceId: string) {
        const total = await knowledgeRepo.count(workspaceId);
        const products = await knowledgeRepo.getProducts(workspaceId);
        return { total, products, productCount: products.length };
    },
};
