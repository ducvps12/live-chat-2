/**
 * ZaloPersonalService — Pure zca-js integration (No Puppeteer).
 * Based on OpenClaw's @openclaw/zalouser plugin patterns.
 *
 * Architecture:
 *  - QR Login: zalo.loginQR → QR image sent to frontend → credentials saved
 *  - Session Restore: zalo.login(savedCredentials) — instant reconnect, no QR
 *  - Realtime Listener: api.listener.on('message') with watchdog timer
 *  - Message Cache: in-memory cache for DM history (no getUserChatHistory API)
 *  - Group History: getGroupChatHistory(groupId, count)
 *  - Conversations: getAllFriends() + getAllGroups() + getGroupInfo()
 *
 * IMPORTANT: Only 1 web listener per Zalo account at a time.
 */
import { Zalo, ThreadType } from 'zca-js';
import { LoginQRCallbackEventType } from 'zca-js';
import type { LoginQRCallbackEvent } from 'zca-js';
import fs from 'fs';
import path from 'path';

// ── Constants ──
const LISTENER_WATCHDOG_INTERVAL_MS = 30_000;
const LISTENER_WATCHDOG_MAX_GAP_MS = 60_000;  // 60s (relaxed from 35s)
const MESSAGE_CACHE_MAX_PER_THREAD = 100;
const GROUP_INFO_CHUNK_SIZE = 80;
const CREDENTIALS_DIR = path.resolve(process.cwd(), 'data', 'zalo-sessions');

// ── Auto-reconnect ──
const RECONNECT_INITIAL_DELAY_MS = 5_000;        // 5 seconds
const RECONNECT_MAX_DELAY_MS = 5 * 60_000;       // 5 minutes
const RECONNECT_MAX_ATTEMPTS = 50;
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Types ──
export interface StoredCredentials {
    imei: string;
    cookie: any;
    userAgent: string;
    language?: string;
    createdAt: string;
    lastUsedAt: string;
}

export interface ZaloSession {
    sessionId: string;
    api: any;
    status: 'qr_pending' | 'connected' | 'disconnected' | 'error';
    listenerStarted: boolean;
    onMessage?: (msg: ZaloIncomingMessage) => void;
    onError?: (error: string) => void;
    additionalCallbacks?: Array<(msg: ZaloIncomingMessage) => void>;
    watchdogTimer?: ReturnType<typeof setInterval>;
    lastWatchdogTickAt?: number;
    createdAt: Date;
    connectedAt?: Date;
}

export interface ZaloIncomingMessage {
    msgId: string;
    cliMsgId?: string;
    threadId: string;
    threadType: 'user' | 'group';
    content: string;
    senderId: string;
    senderName: string;
    isSelf: boolean;
    timestamp: number;
    msgType: string;
    attachmentUrl?: string;
    thumbUrl?: string;
    stickerUrl?: string;
    quote?: {
        ownerId: string;
        msg: string;
        msgId: string;
        cliMsgId: string;
        ts: number;
    };
    extractedData?: {
        emails: string[];
        phones: string[];
        links: string[];
    };
}

// ── Contact data extraction ──
const PHONE_RE = /(?:\+84|84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const URL_RE = /https?:\/\/[^\s<>"]+/g;

function extractContactData(text: string): { emails: string[]; phones: string[]; links: string[] } {
    const emails = [...new Set((text.match(EMAIL_RE) || []).map(e => e.toLowerCase()))];
    const phones = [...new Set((text.match(PHONE_RE) || []))];
    const links = [...new Set((text.match(URL_RE) || []))];
    return { emails, phones, links };
}

// Persistent per-thread contact data store
export interface ThreadContactData {
    threadId: string;
    threadType: 'user' | 'group';
    contactName: string;
    emails: string[];
    phones: string[];
    links: string[];
    files: string[];
    messageCount: number;
    firstSeen: number;
    lastSeen: number;
}

const contactDataStore = new Map<string, ThreadContactData>();

function contactDataPath(sessionId: string): string {
    return path.join(CREDENTIALS_DIR, `${sessionId}_contacts.json`);
}

export function loadContactData(sessionId: string): void {
    try {
        const filePath = contactDataPath(sessionId);
        if (!fs.existsSync(filePath)) return;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data && typeof data === 'object') {
            for (const [key, val] of Object.entries(data)) {
                contactDataStore.set(key, val as ThreadContactData);
            }
        }
    } catch { /* ignore */ }
}

function saveContactData(sessionId: string): void {
    try {
        ensureCredentialsDir();
        const obj: Record<string, ThreadContactData> = {};
        for (const [key, val] of contactDataStore.entries()) {
            if (key.startsWith(`${sessionId}:`)) {
                obj[key] = val;
            }
        }
        fs.writeFileSync(contactDataPath(sessionId), JSON.stringify(obj, null, 2), 'utf-8');
    } catch { /* silent */ }
}

function trackMessageData(sessionId: string, msg: ZaloIncomingMessage): void {
    const key = `${sessionId}:${msg.threadId}`;
    let data = contactDataStore.get(key);
    if (!data) {
        data = {
            threadId: msg.threadId,
            threadType: msg.threadType,
            contactName: msg.senderName,
            emails: [],
            phones: [],
            links: [],
            files: [],
            messageCount: 0,
            firstSeen: msg.timestamp,
            lastSeen: msg.timestamp,
        };
        contactDataStore.set(key, data);
    }

    data.messageCount++;
    data.lastSeen = msg.timestamp;
    if (!msg.isSelf) data.contactName = msg.senderName;

    // Extract and merge unique data
    const extracted = extractContactData(msg.content);
    for (const email of extracted.emails) {
        if (!data.emails.includes(email)) data.emails.push(email);
    }
    for (const phone of extracted.phones) {
        if (!data.phones.includes(phone)) data.phones.push(phone);
    }
    for (const link of extracted.links) {
        if (!data.links.includes(link) && data.links.length < 100) data.links.push(link);
    }
    if (msg.attachmentUrl && !data.files.includes(msg.attachmentUrl) && data.files.length < 50) {
        data.files.push(msg.attachmentUrl);
    }

    // Debounced save
    saveContactData(sessionId);
}

export function getThreadContactData(sessionId: string, threadId: string): ThreadContactData | null {
    return contactDataStore.get(`${sessionId}:${threadId}`) || null;
}

export function getAllContactData(sessionId: string): ThreadContactData[] {
    const result: ThreadContactData[] = [];
    for (const [key, val] of contactDataStore.entries()) {
        if (key.startsWith(`${sessionId}:`)) result.push(val);
    }
    return result;
}

export interface ZaloConversationItem {
    threadId: string;
    threadType: 'user' | 'group';
    displayName: string;
    avatar?: string;
    lastMessage?: string;
    lastMessageAt?: string;
}

// ── Stores ──
const sessions = new Map<string, ZaloSession>();
const messageCache = new Map<string, ZaloIncomingMessage[]>();
// Track recent conversation activity for sorting (like phone app)
const recentConvActivity = new Map<string, { threadId: string; lastMsgAt: number; lastMsg: string; senderName: string }>();
let activitySaveTimer: ReturnType<typeof setTimeout> | null = null;

// ── Activity persistence (survives page reload + server restart) ──
function activityPath(sessionId: string): string {
    return path.join(CREDENTIALS_DIR, `${sessionId}_activity.json`);
}

function loadActivityFromDisk(sessionId: string): void {
    try {
        const filePath = activityPath(sessionId);
        if (!fs.existsSync(filePath)) return;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data && typeof data === 'object') {
            for (const [key, val] of Object.entries(data)) {
                if (!recentConvActivity.has(key)) {
                    recentConvActivity.set(key, val as any);
                }
            }
            console.log(`[ZaloService] Loaded ${Object.keys(data).length} activity entries for session ${sessionId}`);
        }
    } catch { /* ignore corrupt file */ }
}

function saveActivityToDisk(sessionId: string): void {
    // Debounced save — batch frequent writes
    if (activitySaveTimer) clearTimeout(activitySaveTimer);
    activitySaveTimer = setTimeout(() => {
        try {
            ensureCredentialsDir();
            const obj: Record<string, any> = {};
            for (const [key, val] of recentConvActivity.entries()) {
                if (key.startsWith(`${sessionId}:`)) {
                    obj[key] = val;
                }
            }
            fs.writeFileSync(activityPath(sessionId), JSON.stringify(obj), 'utf-8');
        } catch { /* silent */ }
    }, 2000);
}

// ========================
// CREDENTIAL PERSISTENCE
// ========================

function ensureCredentialsDir(): void {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }
}

function credentialsPath(sessionId: string): string {
    return path.join(CREDENTIALS_DIR, `${sessionId}.json`);
}

function writeCredentials(sessionId: string, creds: Omit<StoredCredentials, 'createdAt' | 'lastUsedAt'>): void {
    ensureCredentialsDir();
    const stored: StoredCredentials = {
        ...creds,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
    };
    fs.writeFileSync(credentialsPath(sessionId), JSON.stringify(stored, null, 2), 'utf-8');
    console.log(`[ZaloService] Credentials saved for session ${sessionId}`);
}

function readCredentials(sessionId: string): StoredCredentials | null {
    const filePath = credentialsPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as StoredCredentials;
    } catch {
        return null;
    }
}

function updateLastUsed(sessionId: string): void {
    const creds = readCredentials(sessionId);
    if (!creds) return;
    creds.lastUsedAt = new Date().toISOString();
    try {
        fs.writeFileSync(credentialsPath(sessionId), JSON.stringify(creds, null, 2), 'utf-8');
    } catch { /* silent */ }
}

function clearCredentials(sessionId: string): void {
    const filePath = credentialsPath(sessionId);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[ZaloService] Credentials cleared for session ${sessionId}`);
    }
}

export function hasStoredCredentials(sessionId: string): boolean {
    return readCredentials(sessionId) !== null;
}

// ========================
// MESSAGE CACHE
// ========================


// Map of msgId -> cliMsgId for sent messages (needed for undo)
const sentMsgCliIds = new Map<string, string>();

function cacheMessage(sessionId: string, msg: ZaloIncomingMessage): void {
    const key = `${sessionId}:${msg.threadId}`;
    let list = messageCache.get(key);
    if (!list) {
        list = [];
        messageCache.set(key, list);
    }
    // If message already cached, update cliMsgId if the new one has it
    const existing = list.find(m => m.msgId === msg.msgId);
    if (existing) {
        if (msg.cliMsgId && msg.cliMsgId !== msg.msgId) {
            existing.cliMsgId = msg.cliMsgId;
            // Also update sentMsgCliIds map for undo
            sentMsgCliIds.set(msg.msgId, msg.cliMsgId);
        }
        return;
    }
    list.push(msg);
    if (list.length > MESSAGE_CACHE_MAX_PER_THREAD) {
        list.splice(0, list.length - MESSAGE_CACHE_MAX_PER_THREAD);
    }

    // Track recent conversation activity (for sorting like phone app)
    recentConvActivity.set(key, {
        threadId: msg.threadId,
        lastMsgAt: msg.timestamp,
        lastMsg: msg.content.substring(0, 80),
        senderName: msg.senderName,
    });
    // Persist to disk (debounced)
    saveActivityToDisk(sessionId);
}

function getCachedMessages(sessionId: string, threadId: string): ZaloIncomingMessage[] {
    return messageCache.get(`${sessionId}:${threadId}`) || [];
}

// ========================
// HELPERS
// ========================

function normalizeMessageContent(content: unknown): string {
    if (typeof content === 'string') {
        try {
            if (content.startsWith('{') && content.endsWith('}')) {
                const parsed = JSON.parse(content);
                return normalizeMessageContent(parsed);
            }
        } catch { /* ignore */ }
        return content;
    }
    if (!content || typeof content !== 'object') return '';
    const record = content as Record<string, unknown>;
    // Detect sticker content (has id + cateId + type)
    if (record.id && record.cateId) {
        return `[Sticker:${record.id}:${record.cateId}:${record.type || 0}]`;
    }
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const href = typeof record.href === 'string' ? record.href.trim() : '';
    const combined = [title, description, href].filter(Boolean).join('\n').trim();
    return combined || '[Media/Sticker]';
}

function resolveTimestamp(ts: unknown): number {
    if (typeof ts === 'number' && Number.isFinite(ts)) {
        return ts > 1_000_000_000_000 ? ts : ts * 1000;
    }
    const parsed = parseInt(String(ts || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return Date.now();
    return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
}

// ========================
// QR LOGIN (new session)
// ========================

export async function createZaloSession(
    sessionId: string,
    onQR: (qrDataUrl: string) => void,
    onLogin: (session: ZaloSession) => void,
    onMessage: (msg: ZaloIncomingMessage) => void,
    onError: (error: string) => void,
): Promise<void> {
    try {
        if (sessions.has(sessionId)) {
            await destroyZaloSession(sessionId);
        }

        console.log(`[ZaloService] Creating QR login session ${sessionId}...`);
        loadActivityFromDisk(sessionId);

        const zalo = new Zalo({
            logging: false,
            selfListen: true, // Capture self-sent messages (from Zalo app) — webSentMsgIds dedup handles web-sent
            imageMetadataGetter: async (filePath: string) => {
                const data = fs.readFileSync(filePath);
                // Simple PNG/JPEG dimension parser (no sharp dependency)
                let width = 0, height = 0;
                if (data[0] === 0x89 && data[1] === 0x50) { // PNG
                    width = data.readUInt32BE(16);
                    height = data.readUInt32BE(20);
                } else if (data[0] === 0xFF && data[1] === 0xD8) { // JPEG
                    let offset = 2;
                    while (offset < data.length) {
                        if (data[offset] !== 0xFF) break;
                        const marker = data[offset + 1];
                        if (marker === 0xC0 || marker === 0xC2) {
                            height = data.readUInt16BE(offset + 5);
                            width = data.readUInt16BE(offset + 7);
                            break;
                        }
                        offset += 2 + data.readUInt16BE(offset + 2);
                    }
                }
                return { width: width || 800, height: height || 600, size: data.length };
            },
        });

        const session: ZaloSession = {
            sessionId,
            api: null,
            status: 'qr_pending',
            listenerStarted: false,
            onMessage,
            onError,
            createdAt: new Date(),
        };

        sessions.set(sessionId, session);

        // Capture credentials from GotLoginInfo event (OpenClaw pattern)
        let capturedCredentials: Omit<StoredCredentials, 'createdAt' | 'lastUsedAt'> | null = null;

        const api = await zalo.loginQR(undefined, (event: LoginQRCallbackEvent) => {
            try {
                switch (event.type) {
                    case LoginQRCallbackEventType.QRCodeGenerated: {
                        console.log(`[ZaloService] QR code generated for session ${sessionId}`);
                        const rawImage = (event.data as any)?.image;
                        if (rawImage) {
                            const image = String(rawImage).replace(/^data:image\/png;base64,/, '');
                            const qrDataUrl = image.startsWith('data:image')
                                ? image
                                : `data:image/png;base64,${image}`;
                            onQR(qrDataUrl);
                        }
                        break;
                    }
                    case LoginQRCallbackEventType.QRCodeExpired: {
                        console.log(`[ZaloService] QR expired, auto-retrying...`);
                        try { (event as any).actions?.retry?.(); } catch { /* ignore */ }
                        break;
                    }
                    case LoginQRCallbackEventType.QRCodeDeclined: {
                        console.log(`[ZaloService] QR login declined`);
                        break;
                    }
                    case LoginQRCallbackEventType.GotLoginInfo: {
                        // Capture credentials for persistence (OpenClaw pattern)
                        const data = event.data as any;
                        capturedCredentials = {
                            imei: data.imei,
                            cookie: data.cookie,
                            userAgent: data.userAgent,
                        };
                        console.log(`[ZaloService] Captured login credentials for ${sessionId}`);
                        break;
                    }
                    default:
                        break;
                }
            } catch (err) {
                console.error(`[ZaloService] QR callback error:`, err);
            }
        });

        if (!api) {
            throw new Error('Login failed — no API returned');
        }

        // Fallback: get credentials from API context if not captured from event
        if (!capturedCredentials) {
            try {
                const ctx = api.getContext();
                const cookieJar = api.getCookie();
                const cookieJson = cookieJar?.toJSON?.();
                capturedCredentials = {
                    imei: ctx.imei,
                    cookie: cookieJson?.cookies ?? [],
                    userAgent: ctx.userAgent,
                    language: ctx.language,
                };
                console.log(`[ZaloService] Captured credentials from API context for ${sessionId}`);
            } catch (err) {
                console.warn(`[ZaloService] Could not extract credentials from context:`, err);
            }
        }

        // Save credentials for future session restore
        if (capturedCredentials) {
            writeCredentials(sessionId, capturedCredentials);
        }

        // Login succeeded
        session.api = api;
        session.status = 'connected';
        session.connectedAt = new Date();
        console.log(`[ZaloService] Session ${sessionId} connected via QR login!`);

        startMessageListener(sessionId);
        onLogin(session);

    } catch (err: any) {
        console.error(`[ZaloService] Session ${sessionId} QR login failed:`, err);
        const session = sessions.get(sessionId);
        if (session) session.status = 'error';
        onError(err.message || 'Lỗi đăng nhập Zalo');
    }
}

// ========================
// SESSION RESTORE (no QR)
// ========================

export async function restoreZaloSession(
    sessionId: string,
    onMessage: (msg: ZaloIncomingMessage) => void,
    onError: (error: string) => void,
): Promise<boolean> {
    const creds = readCredentials(sessionId);
    loadActivityFromDisk(sessionId);
    if (!creds) {
        console.log(`[ZaloService] No stored credentials for session ${sessionId}`);
        return false;
    }

    // Already connected?
    if (isZaloSessionConnected(sessionId)) {
        console.log(`[ZaloService] Session ${sessionId} already connected`);
        return true;
    }

    // Destroy any stale session
    if (sessions.has(sessionId)) {
        await destroyZaloSession(sessionId);
    }

    try {
        console.log(`[ZaloService] Restoring session ${sessionId} from saved credentials...`);

        const zalo = new Zalo({
            logging: false,
            selfListen: true, // Capture self-sent messages (from Zalo app) — webSentMsgIds dedup handles web-sent
            imageMetadataGetter: async (filePath: string) => {
                const data = fs.readFileSync(filePath);
                let width = 0, height = 0;
                if (data[0] === 0x89 && data[1] === 0x50) {
                    width = data.readUInt32BE(16);
                    height = data.readUInt32BE(20);
                } else if (data[0] === 0xFF && data[1] === 0xD8) {
                    let offset = 2;
                    while (offset < data.length) {
                        if (data[offset] !== 0xFF) break;
                        const marker = data[offset + 1];
                        if (marker === 0xC0 || marker === 0xC2) {
                            height = data.readUInt16BE(offset + 5);
                            width = data.readUInt16BE(offset + 7);
                            break;
                        }
                        offset += 2 + data.readUInt16BE(offset + 2);
                    }
                }
                return { width: width || 800, height: height || 600, size: data.length };
            },
        });
        const api = await zalo.login({
            imei: creds.imei,
            cookie: creds.cookie,
            userAgent: creds.userAgent,
        });

        if (!api) {
            throw new Error('Session restore failed — no API returned');
        }

        updateLastUsed(sessionId);

        const session: ZaloSession = {
            sessionId,
            api,
            status: 'connected',
            listenerStarted: false,
            onMessage,
            onError,
            createdAt: new Date(creds.createdAt),
            connectedAt: new Date(),
        };

        sessions.set(sessionId, session);
        console.log(`[ZaloService] Session ${sessionId} restored successfully!`);

        startMessageListener(sessionId);
        return true;

    } catch (err: any) {
        console.error(`[ZaloService] Session ${sessionId} restore failed:`, err);
        // Clear invalid credentials
        clearCredentials(sessionId);
        onError(err.message || 'Session restore failed — credentials expired');
        return false;
    }
}

// ========================
// MESSAGE LISTENER
// ========================

function startMessageListener(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.listenerStarted) return;

    try {
        session.lastWatchdogTickAt = Date.now();
        // Reset reconnect counter on successful start
        reconnectAttempts.set(sessionId, 0);

        const onMessage = async (message: any) => {
            try {
                session.lastWatchdogTickAt = Date.now(); // only reset on actual message
                const rawContent = message.data?.content;
                const dataMsgType = message.data?.msgType; // Zalo's own msgType field
                const propertyExt = message.data?.propertyExt;

                // Enhanced debug logging for sticker/media detection
                if (rawContent && typeof rawContent === 'object') {
                    const keys = Object.keys(rawContent);
                    console.log(`[ZaloService] RAW MSG type=${dataMsgType}, propertyExt=${JSON.stringify(propertyExt)}, contentKeys=[${keys.join(',')}], content=${JSON.stringify(rawContent).substring(0, 200)}`);
                } else if (rawContent && typeof rawContent === 'string' && rawContent.startsWith('{')) {
                    console.log(`[ZaloService] RAW MSG type=${dataMsgType}, propertyExt=${JSON.stringify(propertyExt)}, stringContent=${rawContent.substring(0, 200)}`);
                }

                const content = normalizeMessageContent(rawContent);
                const isPlainText = typeof rawContent === 'string' && !rawContent.startsWith('{');
                const threadType = message.type === ThreadType.User ? 'user' : 'group';

                // Extract image/media URLs from structured content
                let attachmentUrl = '';
                let thumbUrl = '';
                let stickerUrl = '';
                let msgType: string = isPlainText ? 'text' : 'media';
                
                // ── Sticker detection helper ──
                const extractStickerInfo = (obj: any): { id: number; cateId: number; type: number } | null => {
                    if (!obj || typeof obj !== 'object') return null;
                    // Direct fields: { id, cateId, type }
                    if (obj.id && (obj.cateId || obj.cateid || obj.cate_id || obj.catId)) {
                        return { id: Number(obj.id), cateId: Number(obj.cateId || obj.cateid || obj.cate_id || obj.catId), type: Number(obj.type || 0) };
                    }
                    // Nested params: { params: { id, cateid, type } }
                    if (obj.params) {
                        const p = typeof obj.params === 'string' ? (() => { try { return JSON.parse(obj.params); } catch { return null; } })() : obj.params;
                        if (p && p.id && (p.cateId || p.cateid || p.cate_id || p.catId)) {
                            return { id: Number(p.id), cateId: Number(p.cateId || p.cateid || p.cate_id || p.catId), type: Number(p.type || 0) };
                        }
                    }
                    // action = sticker pattern
                    if (obj.action === 'sticker' || obj.actionType === 'sticker') {
                        const stickerId = obj.stickerId || obj.id || obj.params?.id;
                        if (stickerId) return { id: Number(stickerId), cateId: Number(obj.cateId || obj.cateid || 0), type: Number(obj.type || 0) };
                    }
                    return null;
                };

                // Check if message is a sticker via multiple signals:
                // 1. Zalo's own msgType field contains 'sticker'
                const isStickerByMsgType = dataMsgType && String(dataMsgType).toLowerCase().includes('sticker');
                // 2. propertyExt.subType or type indicates sticker  
                const isStickerByPropExt = propertyExt && (propertyExt.subType === 7 || propertyExt.type === 7);

                let stickerInfo: { id: number; cateId: number; type: number } | null = null;

                if (!isPlainText && rawContent && typeof rawContent === 'object') {
                    const rc = rawContent as Record<string, unknown>;
                    stickerInfo = extractStickerInfo(rc);
                    
                    if (!stickerInfo && (isStickerByMsgType || isStickerByPropExt)) {
                        // Sticker content might be in a different shape — try harder
                        stickerInfo = extractStickerInfo(rc.params) || extractStickerInfo(rc.data);
                    }

                    if (stickerInfo) {
                        msgType = 'sticker';
                        // Try to get sticker URL via API
                        if (stickerInfo.id && session.api?.getStickersDetail) {
                            try {
                                const details = await session.api.getStickersDetail(stickerInfo.id);
                                if (details && details.length > 0) {
                                    stickerUrl = details[0].stickerWebpUrl || details[0].stickerSpriteUrl || details[0].stickerUrl || '';
                                }
                            } catch (e) { console.log(`[ZaloService] getStickersDetail failed for ${stickerInfo.id}:`, e); }
                        }
                        if (!stickerUrl && stickerInfo.id) {
                            // Fallback CDN URLs
                            stickerUrl = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${stickerInfo.id}&size=120`;
                        }
                    }
                    // Zalo image messages typically have hdUrl/normalUrl/thumb
                    else if (rc.hdUrl) { attachmentUrl = String(rc.hdUrl); msgType = 'image'; }
                    else if (rc.normalUrl) { attachmentUrl = String(rc.normalUrl); msgType = 'image'; }
                    else if (rc.href) { attachmentUrl = String(rc.href); }
                    if (rc.thumb) thumbUrl = String(rc.thumb);
                    else if (rc.thumbUrl) thumbUrl = String(rc.thumbUrl);
                    if ((attachmentUrl || thumbUrl) && msgType !== 'sticker') msgType = 'image';
                } else if (!isPlainText && typeof rawContent === 'string') {
                    try {
                        const parsed = JSON.parse(rawContent);
                        stickerInfo = extractStickerInfo(parsed);
                        if (stickerInfo || isStickerByMsgType || isStickerByPropExt) {
                            if (!stickerInfo) stickerInfo = extractStickerInfo(parsed.params) || extractStickerInfo(parsed.data);
                            msgType = 'sticker';
                            if (stickerInfo?.id) {
                                stickerUrl = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${stickerInfo.id}&size=120`;
                            }
                        } else {
                            if (parsed.hdUrl) attachmentUrl = parsed.hdUrl;
                            else if (parsed.normalUrl) attachmentUrl = parsed.normalUrl;
                            else if (parsed.href) attachmentUrl = parsed.href;
                            if (parsed.thumb) thumbUrl = parsed.thumb;
                            else if (parsed.thumbUrl) thumbUrl = parsed.thumbUrl;
                            if (attachmentUrl || thumbUrl) msgType = 'image';
                        }
                    } catch { /* not JSON */ }
                }

                // Final fallback: if content is "[Media/Sticker]" from normalizeMessageContent, mark as sticker
                if (content === '[Media/Sticker]' && msgType === 'media') {
                    msgType = 'sticker';
                }

                // Extract quote/reply info
                let quote: ZaloIncomingMessage['quote'] = undefined;
                if (message.data?.quote) {
                    const q = message.data.quote;
                    quote = {
                        ownerId: q.ownerId || q.fromD || '',
                        msg: q.msg || '',
                        msgId: String(q.globalMsgId || ''),
                        cliMsgId: String(q.cliMsgId || ''),
                        ts: q.ts || 0,
                    };
                }

                const incomingMsg: ZaloIncomingMessage = {
                    msgId: message.data?.msgId || `zca_${Date.now()}`,
                    cliMsgId: message.data?.cliMsgId || undefined,
                    threadId: message.threadId,
                    threadType,
                    content,
                    senderId: message.data?.uidFrom || message.data?.senderId || '',
                    senderName: message.data?.dName || message.data?.senderName || 'Unknown',
                    isSelf: message.isSelf || false,
                    timestamp: message.data?.ts ? resolveTimestamp(message.data.ts) : Date.now(),
                    msgType,
                    attachmentUrl: attachmentUrl || undefined,
                    thumbUrl: thumbUrl || undefined,
                    stickerUrl: stickerUrl || undefined,
                    quote,
                    extractedData: extractContactData(content),
                };

                console.log(`[ZaloService] New message in ${threadType} ${message.threadId}: "${incomingMsg.content.substring(0, 50)}" (type=${msgType}, self=${incomingMsg.isSelf}${attachmentUrl ? ', img=' + attachmentUrl.substring(0, 60) : ''})`);

                cacheMessage(sessionId, incomingMsg);
                trackMessageData(sessionId, incomingMsg);

                if (session.onMessage) {
                    session.onMessage(incomingMsg);
                }

                // Call additional callbacks (e.g. socket forwarders added by remote-session page)
                if (session.additionalCallbacks) {
                    for (const cb of session.additionalCallbacks) {
                        try { cb(incomingMsg); } catch (e) { console.error('[ZaloService] Additional callback error:', e); }
                    }
                }
            } catch (err) {
                console.error(`[ZaloService] Message processing error:`, err);
            }
        };

        const onError = (error: unknown) => {
            console.error(`[ZaloService] Listener error for ${sessionId}:`, error);
            cleanupListener(sessionId);
            scheduleReconnect(sessionId, `Listener error: ${error instanceof Error ? error.message : String(error)}`);
        };

        const onClosed = (code: number, reason: string) => {
            console.error(`[ZaloService] Listener closed for ${sessionId} (${code}): ${reason || 'no reason'}`);
            cleanupListener(sessionId);
            scheduleReconnect(sessionId, `Listener disconnected (${code})`);
        };

        session.api.listener.on('message', onMessage);
        session.api.listener.on('error', onError);
        session.api.listener.on('closed', onClosed);

        session.api.listener.start();
        session.listenerStarted = true;

        // Rely solely on 'error' and 'closed' events instead of a silence watchdog, 
        // since Zalo does not emit heartbeats and silence doesn't mean the connection is dead.

        console.log(`[ZaloService] Listener started for session ${sessionId} (with watchdog + auto-reconnect)`);
    } catch (err) {
        console.error(`[ZaloService] Failed to start listener for ${sessionId}:`, err);
        scheduleReconnect(sessionId, `Failed to start listener: ${err}`);
    }
}

function cleanupListener(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.watchdogTimer) {
        clearInterval(session.watchdogTimer);
        session.watchdogTimer = undefined;
    }
    try { session.api?.listener?.stop(); } catch { /* ignore */ }
    try {
        session.api?.listener?.removeAllListeners?.('message');
        session.api?.listener?.removeAllListeners?.('error');
        session.api?.listener?.removeAllListeners?.('closed');
    } catch { /* ignore */ }
    session.listenerStarted = false;
}

/**
 * Auto-reconnect with exponential backoff.
 * When the listener drops (error, close, watchdog), we schedule a reconnect
 * instead of leaving the session dead.
 */
function scheduleReconnect(sessionId: string, reason: string): void {
    // Cancel any existing reconnect timer
    const existingTimer = reconnectTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    const attempts = reconnectAttempts.get(sessionId) || 0;
    if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error(`[ZaloService] Reconnect limit reached (${attempts}) for ${sessionId}. Giving up.`);
        const session = sessions.get(sessionId);
        session?.onError?.(`Auto-reconnect exhausted after ${attempts} attempts: ${reason}`);
        return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s... capped at 5min
    const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempts), RECONNECT_MAX_DELAY_MS);
    reconnectAttempts.set(sessionId, attempts + 1);

    console.log(`[ZaloService] ⚡ Scheduling reconnect #${attempts + 1} for ${sessionId} in ${Math.round(delay / 1000)}s (reason: ${reason})`);

    const timer = setTimeout(async () => {
        reconnectTimers.delete(sessionId);
        try {
            // Get the onMessage/onError callbacks from the session before destroying it
            const session = sessions.get(sessionId);
            const onMessage = session?.onMessage;
            const onError = session?.onError;

            if (!onMessage) {
                console.warn(`[ZaloService] Cannot reconnect ${sessionId} — no onMessage callback found`);
                return;
            }

            // Destroy stale session, then restore from credentials
            if (sessions.has(sessionId)) {
                await destroyZaloSession(sessionId);
            }

            const success = await restoreZaloSession(
                sessionId,
                onMessage,
                onError || ((err) => console.error(`[ZaloService] Reconnected session ${sessionId} error:`, err))
            );

            if (success) {
                console.log(`[ZaloService] ✅ Reconnected ${sessionId} successfully on attempt #${attempts + 1}`);
                reconnectAttempts.set(sessionId, 0); // reset counter on success
            } else {
                console.warn(`[ZaloService] Reconnect #${attempts + 1} for ${sessionId} returned false`);
                scheduleReconnect(sessionId, 'Restore returned false');
            }
        } catch (err: any) {
            console.error(`[ZaloService] Reconnect #${attempts + 1} failed for ${sessionId}:`, err.message);
            scheduleReconnect(sessionId, `Reconnect error: ${err.message}`);
        }
    }, delay);

    reconnectTimers.set(sessionId, timer);
}

// ── Conversation cache to prevent 429 rate limiting ──
const convCache = new Map<string, { conversations: ZaloConversationItem[]; fetchedAt: number }>();
const CONV_CACHE_TTL = 30_000; // 30 seconds

export async function getZaloConversations(sessionId: string): Promise<ZaloConversationItem[]> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        console.warn(`[ZaloService] Session ${sessionId} not connected`);
        return [];
    }

    // Return cached if fresh enough
    const cached = convCache.get(sessionId);
    if (cached && Date.now() - cached.fetchedAt < CONV_CACHE_TTL) {
        // Re-enrich with latest activity data before returning
        for (const conv of cached.conversations) {
            const activityKey = `${sessionId}:${conv.threadId}`;
            const activity = recentConvActivity.get(activityKey);
            if (activity) {
                conv.lastMessage = activity.lastMsg;
                conv.lastMessageAt = new Date(activity.lastMsgAt).toISOString();
            }
        }
        console.log(`[ZaloService] Returning ${cached.conversations.length} cached conversations`);
        return cached.conversations;
    }

    try {
        const conversations: ZaloConversationItem[] = [];

        // Friends — getAllFriends() returns User[] directly
        try {
            const friends = await session.api.getAllFriends();
            const friendList = Array.isArray(friends) ? friends : [];
            for (const f of friendList) {
                const threadId = String(f.userId || f.uid || f.id || '');
                if (!threadId) continue;
                conversations.push({
                    threadId,
                    threadType: 'user',
                    displayName: f.displayName || f.zaloName || f.name || 'Unknown',
                    avatar: f.avatar || f.thumbAvatar || '',
                    lastMessage: '',
                    lastMessageAt: '',
                });
            }
            console.log(`[ZaloService] Got ${friendList.length} friends`);
        } catch (err: any) {
            console.error(`[ZaloService] Failed to get friends:`, err.message);
            // Fallback: use cached friends if available (prevents 429 from hiding all DMs)
            const oldCache = convCache.get(sessionId);
            if (oldCache) {
                const cachedFriends = oldCache.conversations.filter(c => c.threadType === 'user');
                if (cachedFriends.length > 0) {
                    console.log(`[ZaloService] Using ${cachedFriends.length} cached friends as fallback`);
                    conversations.push(...cachedFriends);
                }
            }
        }

        // Groups — getAllGroups() returns {gridVerMap}, then getGroupInfo for details
        try {
            const allGroups = await session.api.getAllGroups();
            const gridVerMap = allGroups?.gridVerMap || {};
            const groupIds = Object.keys(gridVerMap);

            if (groupIds.length > 0) {
                for (let i = 0; i < groupIds.length; i += GROUP_INFO_CHUNK_SIZE) {
                    const chunk = groupIds.slice(i, i + GROUP_INFO_CHUNK_SIZE);
                    try {
                        const infoResponse = await session.api.getGroupInfo(chunk);
                        const gridInfoMap = infoResponse?.gridInfoMap || {};
                        for (const [groupId, info] of Object.entries(gridInfoMap) as [string, any][]) {
                            conversations.push({
                                threadId: groupId,
                                threadType: 'group',
                                displayName: info?.name?.trim() || groupId,
                                avatar: info?.avt || info?.fullAvt || '',
                                lastMessage: '',
                                lastMessageAt: '',
                            });
                        }
                    } catch (err: any) {
                        console.error(`[ZaloService] getGroupInfo chunk error:`, err.message);
                        for (const gid of chunk) {
                            conversations.push({
                                threadId: gid,
                                threadType: 'group',
                                displayName: `Nhóm ${gid}`,
                                avatar: '',
                                lastMessage: '',
                                lastMessageAt: '',
                            });
                        }
                    }
                }
                console.log(`[ZaloService] Got ${groupIds.length} groups`);
            }
        } catch (err: any) {
            console.error(`[ZaloService] Failed to get groups:`, err.message);
        }

        // Enrich conversations with recent activity data and sort like phone app
        for (const conv of conversations) {
            const activityKey = `${sessionId}:${conv.threadId}`;
            const activity = recentConvActivity.get(activityKey);
            if (activity) {
                conv.lastMessage = activity.lastMsg;
                conv.lastMessageAt = new Date(activity.lastMsgAt).toISOString();
            }
        }

        // Sort: conversations with recent messages first (newest first),
        // then conversations without activity go to the bottom (alphabetically)
        conversations.sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;

            // Both have activity → sort by most recent first
            if (aTime > 0 && bTime > 0) return bTime - aTime;
            // One has activity, the other doesn't → active one first
            if (aTime > 0) return -1;
            if (bTime > 0) return 1;
            // Neither has activity → alphabetical
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        // Store in cache
        convCache.set(sessionId, { conversations, fetchedAt: Date.now() });

        // Merge aliases (Zalo nicknames / biệt danh) into display names
        try {
            const aliases = await getZaloAliasList(sessionId);
            if (aliases.length > 0) {
                const aliasMap = new Map(aliases.map(a => [a.userId, a.alias]));
                for (const conv of conversations) {
                    const alias = aliasMap.get(conv.threadId);
                    if (alias) conv.displayName = alias;
                }
                console.log(`[ZaloService] Merged ${aliases.length} aliases into conversation list`);
            }
        } catch (err: any) {
            console.warn(`[ZaloService] Failed to merge aliases:`, err.message);
        }

        return conversations;
    } catch (err) {
        console.error(`[ZaloService] getConversations error:`, err);
        return [];
    }
}

// ========================
// ALIAS / NICKNAME (Biệt danh)
// ========================

/**
 * Fetch all aliases (biệt danh / tên gọi nhớ) set by the user in Zalo.
 * Returns array of { userId, alias } pairs.
 */
export async function getZaloAliasList(sessionId: string): Promise<{ userId: string; alias: string }[]> {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return [];
    if (!session.api?.getAliasList) {
        console.warn(`[ZaloService] getAliasList API not available`);
        return [];
    }
    try {
        // Fetch all aliases (max 500 per page)
        const allAliases: { userId: string; alias: string }[] = [];
        let page = 1;
        while (true) {
            const result = await session.api.getAliasList(500, page);
            const items = result?.items || [];
            if (items.length === 0) break;
            allAliases.push(...items);
            if (items.length < 500) break; // last page
            page++;
        }
        console.log(`[ZaloService] Fetched ${allAliases.length} aliases`);
        return allAliases;
    } catch (err: any) {
        console.error(`[ZaloService] getAliasList error:`, err.message);
        return [];
    }
}

// ========================
// MESSAGES
// ========================

/**
 * Register custom DM history API on the zca-js instance.
 * Calls Zalo's internal `chat/api/message/history` endpoint (same pattern as getGroupChatHistory).
 */
function registerDMHistoryAPI(session: ZaloSession): void {
    if (!session.api || (session as any)._dmHistoryRegistered) return;
    try {
        session.api.custom('getDMHistory', async ({ ctx, utils, props }: any) => {
            const { peerUid, count = 30 } = props;
            // Zalo's internal chat service map
            const api = (session as any)._rawApi || session.api;
            const chatBaseUrl = api?.zpwServiceMap?.chat?.[0];
            if (!chatBaseUrl) {
                throw new Error('Chat service URL not available');
            }

            // Try multiple endpoint patterns that Zalo uses for DM history
            const endpoints = [
                '/api/message/peerHistory',
                '/api/message/list',
                '/api/message/history',
            ];

            for (const endpoint of endpoints) {
                try {
                    const serviceURL = utils.makeURL(`${chatBaseUrl}${endpoint}`);
                    const params = {
                        peerUid,
                        count,
                        msgId: "0",
                    };
                    const encryptedParams = utils.encodeAES(JSON.stringify(params));
                    if (!encryptedParams) throw new Error('Failed to encrypt params');
                    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
                        method: 'GET',
                    });
                    const result = utils.resolve(response, (result: any) => {
                        let data = result.data;
                        if (typeof data === 'string') data = JSON.parse(data);
                        return data;
                    });
                    console.log(`[ZaloService] getDMHistory via ${endpoint}: success`);
                    return result;
                } catch (err: any) {
                    console.log(`[ZaloService] getDMHistory via ${endpoint}: ${err.message}`);
                    continue;
                }
            }
            throw new Error('All DM history endpoints failed');
        });
        (session as any)._dmHistoryRegistered = true;
        console.log('[ZaloService] Custom getDMHistory API registered');
    } catch (err: any) {
        console.warn('[ZaloService] Failed to register getDMHistory:', err.message);
    }
}

// Helper: extract image URLs from Zalo message content
function extractMediaUrls(content: unknown): { attachmentUrl: string; thumbUrl: string; mediaType: string } {
    let attachmentUrl = '';
    let thumbUrl = '';
    let mediaType = 'media';
    
    let obj: Record<string, unknown> | null = null;
    if (content && typeof content === 'object') {
        obj = content as Record<string, unknown>;
    } else if (typeof content === 'string' && content.startsWith('{')) {
        try { obj = JSON.parse(content); } catch { /* ignore */ }
    }
    
    if (obj) {
        if (obj.hdUrl) attachmentUrl = String(obj.hdUrl);
        else if (obj.normalUrl) attachmentUrl = String(obj.normalUrl);
        else if (obj.href) attachmentUrl = String(obj.href);
        if (obj.thumb) thumbUrl = String(obj.thumb);
        else if (obj.thumbUrl) thumbUrl = String(obj.thumbUrl);
        if (attachmentUrl || thumbUrl) mediaType = 'image';
    }
    
    return { attachmentUrl, thumbUrl, mediaType };
}

export async function getZaloMessages(
    sessionId: string,
    threadId: string,
    threadType: 'user' | 'group',
    count: number = 30,
): Promise<any[]> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        return [];
    }

    try {
        if (threadType === 'group') {
            try {
                const history = await session.api.getGroupChatHistory(threadId, count);
                const groupMsgs = history?.data?.msgs || history?.data?.groupMsgs || history?.groupMsgs || history?.msgs || [];
                console.log(`[ZaloService] getGroupChatHistory: ${groupMsgs.length} messages for ${threadId}`);

                return groupMsgs.map((gm: any, i: number) => {
                    const data = gm.data || gm;
                    const rawContent = data.content || data.content_str;
                    const content = normalizeMessageContent(rawContent);
                    const ts = resolveTimestamp(data.ts);
                    const senderId = data.uidFrom || data.uid || '';
                    const isText = typeof rawContent === 'string' && !rawContent.startsWith('{');
                    const media = isText ? { attachmentUrl: '', thumbUrl: '', mediaType: 'text' } : extractMediaUrls(rawContent);
                    return {
                        id: data.msgId || `zca_gmsg_${Date.now()}_${i}`,
                        cliMsgId: data.cliMsgId || undefined,
                        content,
                        senderType: gm.isSelf ? 'me' : 'other',
                        senderName: data.dName || (gm.isSelf ? 'Bạn' : 'Thành viên'),
                        createdAt: new Date(ts).toISOString(),
                        type: isText ? 'text' : media.mediaType,
                        senderId: String(senderId),
                        attachmentUrl: media.attachmentUrl || undefined,
                        thumbUrl: media.thumbUrl || undefined,
                    };
                });
            } catch (err: any) {
                console.error(`[ZaloService] getGroupChatHistory error:`, err.message);
                const cached = getCachedMessages(sessionId, threadId);
                return cached.slice(-count).map(mapCachedToOutput);
            }
        } else {
            // User DM: try custom getDMHistory API first, fallback to cache
            try {
                registerDMHistoryAPI(session);
                const dmHistory = await (session.api as any).getDMHistory({ peerUid: threadId, count });
                const msgs = dmHistory?.data?.msgs || dmHistory?.msgs || dmHistory?.groupMsgs || [];
                
                if (msgs.length > 0) {
                    console.log(`[ZaloService] getDMHistory: ${msgs.length} messages for DM ${threadId}`);
                    // Try multiple methods to get own user ID
                    let ownId = '';
                    try { ownId = session.api.getOwnId?.() || ''; } catch {}
                    if (!ownId) {
                        try { ownId = (session.api as any).getContext?.()?.uid || ''; } catch {}
                    }
                    if (!ownId) {
                        try {
                            const ctx = (session.api as any).getContext?.();
                            ownId = ctx?.secretKey?.split?.('_')?.[0] || '';
                        } catch {}
                    }
                    console.log(`[ZaloService] DM ownId resolved: "${ownId}"`);
                    
                    return msgs.map((m: any, i: number) => {
                        const data = m.data || m;
                        const rawContent = data.content || data.content_str;
                        const content = normalizeMessageContent(rawContent);
                        const ts = resolveTimestamp(data.ts);
                        const senderId = data.uidFrom || data.uid || '';
                        // Multiple isSelf detection strategies
                        let isSelf = false;
                        if (m.isSelf !== undefined) {
                            isSelf = !!m.isSelf;
                        } else if (ownId && String(senderId) === String(ownId)) {
                            isSelf = true;
                        } else if (String(senderId) !== '' && String(senderId) !== String(threadId)) {
                            // In a DM, if sender is NOT the peer, it must be us
                            isSelf = true;
                        }
                        const isText = typeof rawContent === 'string' && !rawContent.startsWith('{');
                        const media = isText ? { attachmentUrl: '', thumbUrl: '', mediaType: 'text' } : extractMediaUrls(rawContent);
                        return {
                            id: data.msgId || `zca_dm_${Date.now()}_${i}`,
                            cliMsgId: data.cliMsgId || undefined,
                            content,
                            senderType: isSelf ? 'me' : 'other',
                            senderName: data.dName || (isSelf ? 'Bạn' : 'Người gửi'),
                            createdAt: new Date(ts).toISOString(),
                            type: isText ? 'text' : media.mediaType,
                            senderId: String(senderId),
                            attachmentUrl: media.attachmentUrl || undefined,
                            thumbUrl: media.thumbUrl || undefined,
                        };
                    });
                }
            } catch (err: any) {
                console.warn(`[ZaloService] getDMHistory failed (fallback to cache):`, err.message);
            }

            // Fallback: return cached messages from listener
            const cached = getCachedMessages(sessionId, threadId);
            console.log(`[ZaloService] DM cache: ${cached.length} messages for ${threadId}`);
            return cached.slice(-count).map(mapCachedToOutput);
        }
    } catch (err) {
        console.error(`[ZaloService] getMessages error:`, err);
        return [];
    }
}

function mapCachedToOutput(msg: ZaloIncomingMessage) {
    return {
        id: msg.msgId,
        cliMsgId: msg.cliMsgId || undefined,
        content: msg.content,
        senderType: msg.isSelf ? 'me' : 'other',
        senderName: msg.senderName,
        createdAt: new Date(msg.timestamp).toISOString(),
        type: msg.msgType,
        senderId: msg.senderId,
        attachmentUrl: msg.attachmentUrl,
        thumbUrl: msg.thumbUrl,
    };
}

// ========================
// SEND MESSAGE
// ========================


export async function sendZaloMsg(
    sessionId: string,
    threadId: string,
    threadType: 'user' | 'group',
    text: string,
): Promise<{ success: boolean; error?: string; msgId?: string; cliMsgId?: string }> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        return { success: false, error: 'Session chưa kết nối' };
    }

    try {
        const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
        // Capture cliMsgId (clientId) right before send — zca-js uses Date.now() internally
        const approxCliMsgId = String(Date.now());
        const result = await session.api.sendMessage(text, threadId, type);
        const msgId = result?.msgId ?? result?.message?.msgId ?? result?.attachment?.[0]?.msgId;

        console.log(`[ZaloService] Sent to ${threadType} ${threadId}: "${text.substring(0, 50)}" (msgId=${msgId}, approxCliMsgId=${approxCliMsgId})`);

        // Store cliMsgId mapping for undo
        if (msgId) {
            sentMsgCliIds.set(String(msgId), approxCliMsgId);
        }

        // Cache sent message with cliMsgId
        cacheMessage(sessionId, {
            msgId: msgId ? String(msgId) : `sent_${Date.now()}`,
            cliMsgId: approxCliMsgId,
            threadId,
            threadType,
            content: text,
            senderId: 'self',
            senderName: 'Bạn',
            isSelf: true,
            timestamp: Date.now(),
            msgType: 'text',
        });

        return { success: true, msgId: msgId ? String(msgId) : undefined, cliMsgId: approxCliMsgId };
    } catch (err: any) {
        console.error(`[ZaloService] sendMessage error:`, err);
        return { success: false, error: err.message || 'Lỗi gửi tin nhắn' };
    }
}

// ========================
// SEND IMAGE
// ========================

export async function sendZaloImage(
    sessionId: string,
    threadId: string,
    threadType: 'user' | 'group',
    imageUrl: string,
    caption?: string,
): Promise<{ success: boolean; error?: string; msgId?: string }> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        return { success: false, error: 'Session chưa kết nối' };
    }

    let tempFilePath = '';
    let isTempFile = false;
    try {
        if (imageUrl.startsWith('data:')) {
            // Handle base64 data URLs from Inbox
            const os = await import('os');
            const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) throw new Error('Invalid data URL format');
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const base64Data = matches[2];
            const fileName = `zalo_img_${Date.now()}.${ext}`;
            tempFilePath = path.join(os.tmpdir(), fileName);
            isTempFile = true;
            fs.writeFileSync(tempFilePath, Buffer.from(base64Data, 'base64'));
            console.log(`[ZaloService] sendImage: decoded data URL to ${tempFilePath} (${fs.statSync(tempFilePath).size}b)`);
        } else if (imageUrl.includes('/uploads/')) {
            // Optimization for local uploads: read directly from public/uploads folder
            const fileName = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
            tempFilePath = path.join(process.cwd(), 'public', 'uploads', fileName);
        } else {
            // Download external image to temp file
            const https = await import('https');
            const http = await import('http');
            const os = await import('os');
            
            const fileName = `zalo_img_${Date.now()}.jpg`;
            tempFilePath = path.join(os.tmpdir(), fileName);
            isTempFile = true;
            
            await new Promise<void>((resolve, reject) => {
                const mod = imageUrl.startsWith('https') ? https : http;
                const req = mod.get(imageUrl, (response: any) => {
                    // Handle redirects
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        const redirectMod = response.headers.location.startsWith('https') ? https : http;
                        redirectMod.get(response.headers.location, (res2: any) => {
                            const fileStream = fs.createWriteStream(tempFilePath);
                            res2.pipe(fileStream);
                            fileStream.on('finish', () => { fileStream.close(); resolve(); });
                            fileStream.on('error', reject);
                        }).on('error', reject);
                        return;
                    }
                    const fileStream = fs.createWriteStream(tempFilePath);
                    response.pipe(fileStream);
                    fileStream.on('finish', () => { fileStream.close(); resolve(); });
                    fileStream.on('error', reject);
                });
                req.on('error', reject);
            });
        }

        const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
        
        // Send image via zca-js sendMessage with attachment
        console.log(`[ZaloService] sendImage: file=${tempFilePath}, exists=${fs.existsSync(tempFilePath)}, size=${fs.existsSync(tempFilePath) ? fs.statSync(tempFilePath).size : 'N/A'}b`);
        const result = await session.api.sendMessage(
            {
                msg: caption || '',
                attachments: [tempFilePath],
            },
            threadId,
            type,
        );
        console.log(`[ZaloService] sendMessage+image result:`, JSON.stringify(result).substring(0, 200));
        const msgId = result?.message?.msgId ?? result?.attachment?.[0]?.msgId;

        console.log(`[ZaloService] Sent image to ${threadType} ${threadId} (msgId=${msgId})`);

        // Cache sent message
        cacheMessage(sessionId, {
            msgId: msgId ? String(msgId) : `sent_img_${Date.now()}`,
            threadId,
            threadType,
            content: caption || '[Hình ảnh]',
            senderId: 'self',
            senderName: 'Bạn',
            isSelf: true,
            timestamp: Date.now(),
            msgType: 'image',
            attachmentUrl: imageUrl,
        });

        return { success: true, msgId: msgId ? String(msgId) : undefined };
    } catch (err: any) {
        console.error(`[ZaloService] sendImage error:`, err);
        return { success: false, error: err.message || 'Lỗi gửi ảnh' };
    } finally {
        // Cleanup temp file
        try { if (isTempFile && tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
    }
}

// ========================
// SESSION MANAGEMENT
// ========================

/**
 * Migrate an in-memory session from one ID to another.
 * Used after QR login to move the session from tempSessionId to accountId.
 */
export function migrateZaloSession(oldSessionId: string, newSessionId: string): boolean {
    const session = sessions.get(oldSessionId);
    if (!session) {
        console.warn(`[ZaloService] migrateZaloSession: no session found for ${oldSessionId}`);
        return false;
    }
    // Move session entry
    session.sessionId = newSessionId;
    sessions.set(newSessionId, session);
    sessions.delete(oldSessionId);

    // Move message cache entries
    for (const key of [...messageCache.keys()]) {
        if (key.startsWith(`${oldSessionId}:`)) {
            const suffix = key.substring(oldSessionId.length);
            const data = messageCache.get(key);
            if (data) {
                messageCache.set(`${newSessionId}${suffix}`, data);
            }
            messageCache.delete(key);
        }
    }

    // Move activity entries
    for (const key of [...recentConvActivity.keys()]) {
        if (key.startsWith(`${oldSessionId}:`)) {
            const suffix = key.substring(oldSessionId.length);
            const data = recentConvActivity.get(key);
            if (data) {
                recentConvActivity.set(`${newSessionId}${suffix}`, data);
            }
            recentConvActivity.delete(key);
        }
    }

    // Move reconnect tracking
    const attempts = reconnectAttempts.get(oldSessionId);
    if (attempts !== undefined) {
        reconnectAttempts.set(newSessionId, attempts);
        reconnectAttempts.delete(oldSessionId);
    }

    console.log(`[ZaloService] ✅ Migrated session ${oldSessionId} → ${newSessionId}`);
    return true;
}

/**
 * Copy credential files from one session ID to another.
 * Copies main credentials, activity, and contacts JSON files.
 */
export function copyZaloCredentials(fromSessionId: string, toSessionId: string): boolean {
    try {
        ensureCredentialsDir();
        const filesToCopy = [
            { from: credentialsPath(fromSessionId), to: credentialsPath(toSessionId) },
            { from: activityPath(fromSessionId), to: activityPath(toSessionId) },
            { from: contactDataPath(fromSessionId), to: contactDataPath(toSessionId) },
        ];
        let copiedAny = false;
        for (const { from, to } of filesToCopy) {
            if (fs.existsSync(from)) {
                fs.copyFileSync(from, to);
                copiedAny = true;
            }
        }
        if (copiedAny) {
            console.log(`[ZaloService] ✅ Credentials copied ${fromSessionId} → ${toSessionId}`);
        }
        return copiedAny;
    } catch (err: any) {
        console.error(`[ZaloService] Failed to copy credentials:`, err.message);
        return false;
    }
}

export async function destroyZaloSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;

    // Cancel any pending auto-reconnect for this session
    const reconnectTimer = reconnectTimers.get(sessionId);
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimers.delete(sessionId);
    }
    reconnectAttempts.delete(sessionId);

    cleanupListener(sessionId);
    session.status = 'disconnected';
    sessions.delete(sessionId);

    for (const key of messageCache.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            messageCache.delete(key);
        }
    }

    console.log(`[ZaloService] Session ${sessionId} destroyed`);
}

export function logoutZaloSession(sessionId: string): void {
    clearCredentials(sessionId);
    destroyZaloSession(sessionId);
    console.log(`[ZaloService] Session ${sessionId} logged out and credentials cleared`);
}

export function getZaloSessionStatus(sessionId: string): string {
    const session = sessions.get(sessionId);
    return session?.status || 'not_found';
}

export function isZaloSessionConnected(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    return session?.status === 'connected' && !!session.api;
}

/**
 * Register an additional message callback for an existing connected session.
 * Used by socket handlers to forward messages to the frontend in realtime
 * when a session was already booted by bootActiveAccounts.
 */
export function addSessionMessageCallback(
    sessionId: string,
    callback: (msg: ZaloIncomingMessage) => void
): boolean {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') return false;
    if (!session.additionalCallbacks) session.additionalCallbacks = [];
    session.additionalCallbacks.push(callback);
    console.log(`[ZaloService] Added additional message callback for session ${sessionId} (total: ${session.additionalCallbacks.length})`);
    return true;
}

/**
 * Remove all additional message callbacks for a session.
 * Called when the socket disconnects to prevent memory leaks.
 */
export function clearSessionMessageCallbacks(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
        session.additionalCallbacks = [];
        console.log(`[ZaloService] Cleared additional message callbacks for session ${sessionId}`);
    }
}

export function getActiveZaloSessions(): string[] {
    return Array.from(sessions.entries())
        .filter(([_, s]) => s.status === 'connected')
        .map(([id]) => id);
}

// ========================
// ADVANCED ACTIONS
// ========================

/**
 * Undo (recall) a sent message
 */
export async function undoZaloMessage(
    sessionId: string,
    msgId: string,
    cliMsgId: string,
    threadId: string,
    threadType: 'user' | 'group' = 'user'
): Promise<{ status: number }> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }
    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;

    // If cliMsgId is same as msgId or empty, try to find real cliMsgId
    let realCliMsgId = cliMsgId;
    if (!realCliMsgId || realCliMsgId === msgId) {
        // 1. Check sentMsgCliIds map first (most reliable for self-sent messages)
        if (sentMsgCliIds.has(msgId)) {
            realCliMsgId = sentMsgCliIds.get(msgId)!;
            console.log(`[ZaloService] undo: found cliMsgId from sentMsgCliIds map: ${realCliMsgId}`);
        } else if (sentMsgCliIds.has(String(msgId))) {
            realCliMsgId = sentMsgCliIds.get(String(msgId))!;
            console.log(`[ZaloService] undo: found cliMsgId from sentMsgCliIds map (string): ${realCliMsgId}`);
        } else {
            // 2. Check message cache
            const cacheKey = `${sessionId}:${threadId}`;
            if (messageCache.has(cacheKey)) {
                const cached = messageCache.get(cacheKey)!;
                const found = cached.find((m: any) => m.msgId === msgId || m.msgId === String(msgId));
                if (found?.cliMsgId && found.cliMsgId !== msgId) {
                    realCliMsgId = found.cliMsgId;
                    console.log(`[ZaloService] undo: found real cliMsgId from cache: ${realCliMsgId}`);
                }
            }
        }
    }

    console.log(`[ZaloService] undo: msgId=${msgId}, cliMsgId=${realCliMsgId}, threadId=${threadId}, type=${threadType}`);
    try {
        const result = await session.api.undo({ msgId, cliMsgId: realCliMsgId }, threadId, type);
        console.log(`[ZaloService] undo result:`, JSON.stringify(result));
        // Also remove from message cache
        const cacheKey = `${sessionId}:${threadId}`;
        if (messageCache.has(cacheKey)) {
            const cached = messageCache.get(cacheKey)!;
            messageCache.set(cacheKey, cached.filter((m: any) => m.msgId !== String(msgId)));
        }
        return result;
    } catch (err: any) {
        console.error(`[ZaloService] undo error:`, err.message || err);
        throw err;
    }
}

/**
 * Send a reply (quote) message
 */
export async function sendZaloReply(
    sessionId: string,
    threadId: string,
    threadType: 'user' | 'group',
    text: string,
    quotedMsg: {
        msgId: string;
        cliMsgId: string;
        content: string;
        uidFrom: string;
        ts: number;
    }
): Promise<any> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }
    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    console.log(`[ZaloService] reply: text="${text}", threadId=${threadId}, type=${threadType}`);
    console.log(`[ZaloService] reply quote:`, JSON.stringify(quotedMsg));
    try {
        const result = await session.api.sendMessage({
            msg: text,
            quote: {
                content: quotedMsg.content,
                msgType: '0',
                propertyExt: undefined,
                uidFrom: quotedMsg.uidFrom,
                msgId: quotedMsg.msgId,
                cliMsgId: quotedMsg.cliMsgId,
                ts: String(quotedMsg.ts),
                ttl: 0,
            },
        }, threadId, type);
        console.log(`[ZaloService] reply result:`, JSON.stringify(result));
        return result;
    } catch (err: any) {
        console.error(`[ZaloService] reply error:`, err.message || err);
        throw err;
    }
}

/**
 * Search for stickers by keyword, returning full detail
 */
export async function searchZaloStickers(
    sessionId: string,
    keyword: string,
    limit: number = 20
): Promise<Array<{ id: number; cateId: number; type: number; stickerUrl: string; stickerWebpUrl: string | null }>> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }

    // Search for stickers
    const basics = await session.api.searchSticker(keyword, limit);
    if (!basics || basics.length === 0) return [];

    // Get detailed info (with URLs)
    const stickerIds = basics.map((s: any) => s.sticker_id || s.id);
    try {
        const details = await session.api.getStickersDetail(stickerIds);
        return details.map((d: any) => ({
            id: d.id,
            cateId: d.cateId,
            type: d.type,
            stickerUrl: d.stickerSpriteUrl || d.stickerUrl || '',
            stickerWebpUrl: d.stickerWebpUrl || null,
        }));
    } catch {
        // Return basic info without URLs
        return basics.map((s: any) => ({
            id: s.sticker_id || s.id,
            cateId: s.cate_id || s.cateId,
            type: s.type || 0,
            stickerUrl: '',
            stickerWebpUrl: null,
        }));
    }
}

/**
 * Send a sticker to a thread
 */
export async function sendZaloSticker(
    sessionId: string,
    sticker: { id: number; cateId: number; type: number },
    threadId: string,
    threadType: 'user' | 'group' = 'user'
): Promise<{ msgId: number }> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }
    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    return session.api.sendSticker(sticker, threadId, type);
}

/**
 * Send a voice message
 */
export async function sendZaloVoice(
    sessionId: string,
    voiceUrl: string,
    threadId: string,
    threadType: 'user' | 'group' = 'user',
    ttl: number = 0
): Promise<{ msgId: string }> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }
    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    return session.api.sendVoice({ voiceUrl, ttl }, threadId, type);
}

// ========================
// GROUP MEMBERS
// ========================

export interface ZaloGroupItem {
    groupId: string;
    name: string;
    avatar: string;
    memberCount: number;
    creatorId: string;
    description: string;
}

export interface ZaloGroupMember {
    userId: string;
    displayName: string;
    avatar: string;
    role: 'admin' | 'moderator' | 'member';
    isAdmin?: boolean;
    joinedAt?: number;
}

/**
 * Get all Zalo groups for a session with name, avatar, member count
 */
export async function getZaloGroups(sessionId: string): Promise<ZaloGroupItem[]> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }

    const allGroups = await session.api.getAllGroups();
    const gridVerMap = allGroups?.gridVerMap || {};
    const groupIds = Object.keys(gridVerMap);

    if (groupIds.length === 0) return [];

    const result: ZaloGroupItem[] = [];

    for (let i = 0; i < groupIds.length; i += GROUP_INFO_CHUNK_SIZE) {
        const chunk = groupIds.slice(i, i + GROUP_INFO_CHUNK_SIZE);
        try {
            const infoResponse = await session.api.getGroupInfo(chunk);
            const gridInfoMap = infoResponse?.gridInfoMap || {};
            for (const [groupId, info] of Object.entries(gridInfoMap) as [string, any][]) {
                const members = info?.memVerList || info?.members || [];
                result.push({
                    groupId,
                    name: info?.name?.trim() || `Nhóm ${groupId}`,
                    avatar: info?.avt || info?.fullAvt || '',
                    memberCount: Array.isArray(members) ? members.length : (info?.totalMember || info?.memberCount || 0),
                    creatorId: info?.creatorId || info?.creator || '',
                    description: info?.desc || info?.description || '',
                });
            }
        } catch (err: any) {
            console.error(`[ZaloService] getGroups chunk error:`, err.message);
            for (const gid of chunk) {
                result.push({ groupId: gid, name: `Nhóm ${gid}`, avatar: '', memberCount: 0, creatorId: '', description: '' });
            }
        }
    }

    return result;
}

/**
 * Get members of a specific Zalo group
 */
export async function getZaloGroupMembers(sessionId: string, groupId: string): Promise<ZaloGroupMember[]> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        throw new Error('Zalo session not connected');
    }

    const infoResponse = await session.api.getGroupInfo([groupId]);
    const gridInfoMap = infoResponse?.gridInfoMap || {};
    const groupInfo = gridInfoMap[groupId];

    if (!groupInfo) {
        throw new Error(`Group ${groupId} not found`);
    }

    const memVerList = groupInfo.memVerList || groupInfo.members || [];
    const adminIds = new Set<string>();
    const modIds = new Set<string>();

    // Collect admin IDs
    if (groupInfo.creatorId) adminIds.add(String(groupInfo.creatorId));
    if (groupInfo.creator) adminIds.add(String(groupInfo.creator));
    if (Array.isArray(groupInfo.adminIds)) {
        for (const id of groupInfo.adminIds) adminIds.add(String(id));
    }
    if (Array.isArray(groupInfo.admins)) {
        for (const id of groupInfo.admins) adminIds.add(String(id));
    }
    // Collect moderator/sub-admin IDs (phó nhóm)
    if (Array.isArray(groupInfo.subAdminIds)) {
        for (const id of groupInfo.subAdminIds) modIds.add(String(id));
    }
    if (Array.isArray(groupInfo.moderatorIds)) {
        for (const id of groupInfo.moderatorIds) modIds.add(String(id));
    }

    // Extract member data — memVerList items are usually { id, ..., ts? } or just userId strings
    const members: ZaloGroupMember[] = [];

    for (const mem of memVerList) {
        const userId = String(mem.id || mem.uid || mem.userId || mem);
        if (!userId || userId === 'undefined') continue;

        const isAdmin = adminIds.has(userId);
        const isMod = modIds.has(userId);

        members.push({
            userId,
            displayName: mem.dName || mem.displayName || mem.zaloName || mem.name || '',
            avatar: mem.avatar || mem.thumbAvatar || '',
            role: isAdmin ? 'admin' : isMod ? 'moderator' : 'member',
            isAdmin,
            joinedAt: mem.ts || mem.joinedAt || undefined,
        });
    }

    // If members don't have display names, try fetching from friends list
    const needNames = members.filter(m => !m.displayName);
    if (needNames.length > 0 && session.api.getAllFriends) {
        try {
            const friends = await session.api.getAllFriends();
            const friendMap = new Map<string, any>();
            if (Array.isArray(friends)) {
                for (const f of friends) {
                    const fid = String(f.userId || f.uid || f.id || '');
                    if (fid) friendMap.set(fid, f);
                }
            }
            for (const m of members) {
                if (!m.displayName) {
                    const friend = friendMap.get(m.userId);
                    if (friend) {
                        m.displayName = friend.displayName || friend.zaloName || friend.name || '';
                        if (!m.avatar) m.avatar = friend.avatar || friend.thumbAvatar || '';
                    }
                }
                // Fallback name
                if (!m.displayName) m.displayName = `Thành viên ${m.userId.slice(-6)}`;
            }
        } catch { /* silent — friends API may fail */ }
    }

    console.log(`[ZaloService] Got ${members.length} members for group ${groupId}`);
    return members;
}

/**
 * Remove a member from a Zalo group (kick)
 */
export async function removeZaloGroupMember(
    sessionId: string,
    groupId: string,
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        return { success: false, error: 'Zalo session not connected' };
    }

    try {
        // zca-js API: removeGroupMember or removeMember
        if (typeof session.api.removeGroupMember === 'function') {
            await session.api.removeGroupMember(groupId, [userId]);
        } else if (typeof (session.api as any).removeMemberFromGroup === 'function') {
            await (session.api as any).removeMemberFromGroup(groupId, userId);
        } else {
            return { success: false, error: 'API xóa thành viên chưa được hỗ trợ trong phiên bản này' };
        }
        console.log(`[ZaloService] Removed user ${userId} from group ${groupId}`);
        return { success: true };
    } catch (err: any) {
        console.error(`[ZaloService] removeGroupMember error:`, err.message);
        return { success: false, error: err.message || 'Không thể xóa thành viên' };
    }
}

// ========================
// FRIEND REQUESTS
// ========================

export interface FriendRequestResult {
    userId: string;
    success: boolean;
    error?: string;
}

/**
 * Send a friend request to a Zalo user
 */
export async function sendZaloFriendRequest(
    sessionId: string,
    userId: string,
    message: string = 'Xin chào, mình muốn kết bạn!'
): Promise<FriendRequestResult> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') {
        return { userId, success: false, error: 'Zalo session not connected' };
    }

    try {
        await session.api.sendFriendRequest(message, userId);
        console.log(`[ZaloService] Friend request sent to ${userId}`);
        return { userId, success: true };
    } catch (err: any) {
        console.error(`[ZaloService] Friend request failed for ${userId}:`, err.message);
        return { userId, success: false, error: err.message };
    }
}

/**
 * Get IDs of all current friends (for dedup before sending friend requests)
 */
export async function getZaloFriendIds(sessionId: string): Promise<Set<string>> {
    const session = sessions.get(sessionId);
    if (!session?.api || session.status !== 'connected') return new Set();

    try {
        const friends = await session.api.getAllFriends();
        const ids = new Set<string>();
        if (Array.isArray(friends)) {
            for (const f of friends) {
                const fid = String(f.userId || f.uid || f.id || '');
                if (fid) ids.add(fid);
            }
        }
        return ids;
    } catch {
        return new Set();
    }
}
