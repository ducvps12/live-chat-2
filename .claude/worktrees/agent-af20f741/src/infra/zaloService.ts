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
    watchdogTimer?: ReturnType<typeof setInterval>;
    lastWatchdogTickAt?: number;
    createdAt: Date;
    connectedAt?: Date;
}

export interface ZaloIncomingMessage {
    msgId: string;
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

function cacheMessage(sessionId: string, msg: ZaloIncomingMessage): void {
    const key = `${sessionId}:${msg.threadId}`;
    let list = messageCache.get(key);
    if (!list) {
        list = [];
        messageCache.set(key, list);
    }
    if (list.some(m => m.msgId === msg.msgId)) return;
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

        const zalo = new Zalo({ logging: false, selfListen: false });

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

        const zalo = new Zalo({ logging: false, selfListen: false });
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

        const onMessage = (message: any) => {
            try {
                session.lastWatchdogTickAt = Date.now(); // only reset on actual message
                const rawContent = message.data?.content;
                const content = normalizeMessageContent(rawContent);
                const isPlainText = typeof rawContent === 'string' && !rawContent.startsWith('{');
                const threadType = message.type === ThreadType.User ? 'user' : 'group';

                // Extract image/media URLs from structured content
                let attachmentUrl = '';
                let thumbUrl = '';
                let msgType: string = isPlainText ? 'text' : 'media';
                
                if (!isPlainText && rawContent && typeof rawContent === 'object') {
                    const rc = rawContent as Record<string, unknown>;
                    // Zalo image messages typically have hdUrl/normalUrl/thumb
                    if (rc.hdUrl) attachmentUrl = String(rc.hdUrl);
                    else if (rc.normalUrl) attachmentUrl = String(rc.normalUrl);
                    else if (rc.href) attachmentUrl = String(rc.href);
                    if (rc.thumb) thumbUrl = String(rc.thumb);
                    else if (rc.thumbUrl) thumbUrl = String(rc.thumbUrl);
                    
                    // Determine specific media type
                    if (attachmentUrl || thumbUrl) {
                        msgType = 'image';
                    }
                } else if (!isPlainText && typeof rawContent === 'string') {
                    try {
                        const parsed = JSON.parse(rawContent);
                        if (parsed.hdUrl) attachmentUrl = parsed.hdUrl;
                        else if (parsed.normalUrl) attachmentUrl = parsed.normalUrl;
                        else if (parsed.href) attachmentUrl = parsed.href;
                        if (parsed.thumb) thumbUrl = parsed.thumb;
                        else if (parsed.thumbUrl) thumbUrl = parsed.thumbUrl;
                        if (attachmentUrl || thumbUrl) msgType = 'image';
                    } catch { /* not JSON */ }
                }

                const incomingMsg: ZaloIncomingMessage = {
                    msgId: message.data?.msgId || `zca_${Date.now()}`,
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
                };

                console.log(`[ZaloService] New message in ${threadType} ${message.threadId}: "${incomingMsg.content.substring(0, 50)}" (type=${msgType}, self=${incomingMsg.isSelf}${attachmentUrl ? ', img=' + attachmentUrl.substring(0, 60) : ''})`);

                cacheMessage(sessionId, incomingMsg);

                if (session.onMessage) {
                    session.onMessage(incomingMsg);
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

// ========================
// CONVERSATIONS
// ========================

export async function getZaloConversations(sessionId: string): Promise<ZaloConversationItem[]> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        console.warn(`[ZaloService] Session ${sessionId} not connected`);
        return [];
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

        return conversations;
    } catch (err) {
        console.error(`[ZaloService] getConversations error:`, err);
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
            const serviceURL = utils.makeURL(`${chatBaseUrl}/api/message/history`);
            const params = {
                peerUid,
                count,
                msgId: "0", // String "0" is often required by Zalo for history
            };
            const encryptedParams = utils.encodeAES(JSON.stringify(params));
            if (!encryptedParams) throw new Error('Failed to encrypt params');
            const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
                method: 'GET',
            });
            return utils.resolve(response, (result: any) => {
                let data = result.data;
                if (typeof data === 'string') data = JSON.parse(data);
                return data;
            });
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
                    const ownId = session.api.getOwnId?.() || '';
                    return msgs.map((m: any, i: number) => {
                        const data = m.data || m;
                        const rawContent = data.content || data.content_str;
                        const content = normalizeMessageContent(rawContent);
                        const ts = resolveTimestamp(data.ts);
                        const senderId = data.uidFrom || data.uid || '';
                        const isSelf = m.isSelf ?? (String(senderId) === String(ownId));
                        const isText = typeof rawContent === 'string' && !rawContent.startsWith('{');
                        const media = isText ? { attachmentUrl: '', thumbUrl: '', mediaType: 'text' } : extractMediaUrls(rawContent);
                        return {
                            id: data.msgId || `zca_dm_${Date.now()}_${i}`,
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
): Promise<{ success: boolean; error?: string; msgId?: string }> {
    const session = sessions.get(sessionId);
    if (!session || !session.api || session.status !== 'connected') {
        return { success: false, error: 'Session chưa kết nối' };
    }

    try {
        const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
        const result = await session.api.sendMessage(text, threadId, type);
        const msgId = result?.msgId ?? result?.message?.msgId ?? result?.attachment?.[0]?.msgId;

        console.log(`[ZaloService] Sent to ${threadType} ${threadId}: "${text.substring(0, 50)}" (msgId=${msgId})`);

        // Cache sent message
        cacheMessage(sessionId, {
            msgId: msgId ? String(msgId) : `sent_${Date.now()}`,
            threadId,
            threadType,
            content: text,
            senderId: 'self',
            senderName: 'Bạn',
            isSelf: true,
            timestamp: Date.now(),
            msgType: 'text',
        });

        return { success: true, msgId: msgId ? String(msgId) : undefined };
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
        if (imageUrl.includes('/uploads/')) {
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
        
        // Send image via zca-js
        const result = await session.api.sendImage(tempFilePath, threadId, type);
        const msgId = result?.msgId ?? result?.message?.msgId ?? result?.attachment?.[0]?.msgId;

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

export function getActiveZaloSessions(): string[] {
    return Array.from(sessions.entries())
        .filter(([_, s]) => s.status === 'connected')
        .map(([id]) => id);
}
