import { Server, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { security } from './security';
import { messageRepo } from '../modules/conversation/repos/message.repo';
import { conversationRepo } from '../modules/conversation/repos/conversation.repo';
import { presenceStore } from './presence';
import { browserPool } from './browserPool';
import { startScreencast, stopScreencast, dispatchMouse, dispatchKeyboard, dispatchScroll, detectLoginState } from './sessionStream';
import { createZaloSession, restoreZaloSession, getZaloConversations, getZaloMessages, sendZaloMsg, sendZaloImage, destroyZaloSession, isZaloSessionConnected, hasStoredCredentials, logoutZaloSession, addSessionMessageCallback, clearSessionMessageCallbacks, undoZaloMessage, sendZaloReply, searchZaloStickers, sendZaloSticker, sendZaloVoice, getThreadContactData, getAllContactData, loadContactData } from './zaloService';
import { externalSessionRepo } from '../modules/external-session/repos/externalSession.repo';
import { zaloMessageRepo } from '../modules/zalo/repos/zalo-message.repo';
import type { ZaloIncomingMessage } from './zaloService';

let io: Server;

// ── Workspace ID cache for Zalo sessions (avoid repeated DB queries) ──
const sessionWorkspaceCache = new Map<string, string>();

async function getWorkspaceIdForSession(sessionId: string): Promise<string | null> {
    if (sessionWorkspaceCache.has(sessionId)) return sessionWorkspaceCache.get(sessionId)!;
    try {
        const session = await externalSessionRepo.findById(sessionId);
        const wsId = session?.workspaceId?.toString() || null;
        if (wsId) sessionWorkspaceCache.set(sessionId, wsId);
        return wsId;
    } catch { return null; }
}

async function saveZaloMessageToDB(sessionId: string, msg: ZaloIncomingMessage): Promise<void> {
    try {
        const workspaceId = await getWorkspaceIdForSession(sessionId);
        if (!workspaceId) {
            console.warn(`[ZaloDB] Cannot save message — no workspaceId for session ${sessionId}`);
            return;
        }
        await zaloMessageRepo.saveMessage({
            workspaceId,
            threadId: msg.threadId,
            threadType: msg.threadType,
            msgId: msg.msgId,
            senderId: msg.senderId,
            senderName: msg.senderName,
            content: msg.content,
            msgType: msg.msgType,
            attachmentUrl: msg.attachmentUrl,
            thumbUrl: msg.thumbUrl,
            isSelf: msg.isSelf,
            timestamp: new Date(msg.timestamp),
        });
        console.log(`[ZaloDB] Message ${msg.msgId} saved (thread: ${msg.threadId}, self: ${msg.isSelf})`);
    } catch (err) {
        console.error(`[ZaloDB] Failed to save message ${msg.msgId}:`, err);
    }
}

// ── Room naming conventions ──
export const rooms = {
    conversation: (id: string) => `conv:${id}`,
    workspace: (id: string) => `ws:${id}`,
    visitor: (visitorId: string) => `visitor:${visitorId}`,
    user: (userId: string) => `user:${userId}`,
};

// ── Socket data attached after handshake ──
interface SocketData {
    type: 'visitor' | 'agent';
    id: string;
    name?: string;
    visitorId?: string;     // for visitors
    widgetId?: string;      // for visitors
    workspaceId?: string;   // for agents
}

/**
 * Initialize Socket.IO on the HTTP server.
 */
export function initSocketGateway(server: http.Server): Server {
    io = new Server(server, {
        cors: {
            origin: true,
            credentials: true,
        },
        pingTimeout: 30000,
        pingInterval: 10000,
        transports: ['websocket', 'polling'],
    });

    // ── Visitor namespace (token authenticated) ──
    const visitorNs = io.of('/visitor');

    // Auth middleware for visitors
    visitorNs.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('MISSING_TOKEN'));

        const decoded = security.verifyVisitorToken(token as string);
        if (!decoded) return next(new Error('INVALID_TOKEN'));

        (socket as any).data = {
            type: 'visitor',
            id: decoded.visitorId,
            visitorId: decoded.visitorId,
            widgetId: decoded.widgetId,
        } as SocketData;

        next();
    });

    visitorNs.on('connection', (socket: Socket) => {
        const data = (socket as any).data as SocketData;
        const vid = data.visitorId!;
        const conversationId = socket.handshake.query?.conversationId as string;

        // Join visitor room
        socket.join(rooms.visitor(vid));

        // Join conversation room if provided
        if (conversationId) {
            socket.join(rooms.conversation(conversationId));
        }

        console.log(`[Socket] Visitor connected: ${vid} (socket: ${socket.id})`);

        // ── Presence: visitor online ──
        presenceStore.visitorConnect(vid, socket.id);
        if (data.widgetId) {
            // Notify agents in this widget's workspace
            // (widgetId → workspaceId mapping comes from the conversation)
            if (conversationId) {
                conversationRepo.findById(conversationId).then(conv => {
                    if (conv) {
                        emitToWorkspace((conv.workspaceId as any).toString(), 'presence:visitorOnline', {
                            visitorId: vid, status: 'online',
                        });
                    }
                }).catch(() => {});
            }
        }

        // Send current agents:status to visitor on connect
        socket.emit('agents:status', { hasOnlineAgent: true });

        // ── Visitor events ──

        // Join a conversation room (when conversation is created/resumed later)
        socket.on('join:conversation', (joinData: { conversationId: string }) => {
            if (joinData.conversationId) {
                socket.join(rooms.conversation(joinData.conversationId));
                console.log(`[Socket] Visitor ${vid} joined room: ${rooms.conversation(joinData.conversationId)}`);
            }
        });

        // Typing indicator
        socket.on('typing:start', (typingData: { conversationId: string }) => {
            socket.to(rooms.conversation(typingData.conversationId)).emit('typing:start', {
                conversationId: typingData.conversationId,
                sender: { type: 'visitor', id: vid },
            });
        });

        socket.on('typing:stop', (typingData: { conversationId: string }) => {
            socket.to(rooms.conversation(typingData.conversationId)).emit('typing:stop', {
                conversationId: typingData.conversationId,
                sender: { type: 'visitor', id: vid },
            });
        });

        // ── Message Status Updates ──
        socket.on('message:delivered', async (msgData: { messageIds: string[], conversationId: string }) => {
            if (msgData.messageIds?.length > 0) {
                await messageRepo.markAsDelivered(msgData.messageIds);
                socket.to(rooms.conversation(msgData.conversationId)).emit('message:updated', {
                    messageIds: msgData.messageIds,
                    status: 'delivered'
                });
            }
        });

        socket.on('message:seen', async (seenData: { conversationId: string, messageId: string }) => {
            if (seenData.conversationId && seenData.messageId) {
                // Update cursor for visitor
                await conversationRepo.updateReadCursor(seenData.conversationId, vid, 'visitor', seenData.messageId);
                // Mark agent messages as read
                await messageRepo.markAsReadUpTo(seenData.conversationId, seenData.messageId, 'agent');
                
                socket.to(rooms.conversation(seenData.conversationId)).emit('messages:read', {
                    conversationId: seenData.conversationId,
                    lastReadMessageId: seenData.messageId,
                    participantId: vid,
                    participantType: 'visitor'
                });
            }
        });

        // Visitor heartbeat for idle detection
        socket.on('heartbeat', () => {
            presenceStore.visitorHeartbeat(vid);
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Visitor disconnected: ${vid} (${reason})`);

            // ── Presence: visitor disconnect ──
            const newStatus = presenceStore.visitorDisconnect(vid, socket.id);
            if (newStatus === 'offline' && conversationId) {
                conversationRepo.findById(conversationId).then(conv => {
                    if (conv) {
                        emitToWorkspace((conv.workspaceId as any).toString(), 'presence:visitorOffline', {
                            visitorId: vid, status: 'offline',
                        });
                    }
                }).catch(() => {});
            }
        });
    });

    // ── Agent namespace (JWT authenticated) ──
    const agentNs = io.of('/agent');

    // Auth middleware for agents
    agentNs.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('UNAUTHORIZED'));

        try {
            const decoded = jwt.verify(token, env.JWT_SECRET) as any;
            (socket as any).data = {
                type: 'agent',
                id: decoded.id || decoded.userId,
                name: decoded.name || 'Agent',
                workspaceId: socket.handshake.query?.workspaceId as string,
            } as SocketData;
            next();
        } catch (err) {
            next(new Error('INVALID_TOKEN'));
        }
    });

    agentNs.on('connection', (socket: Socket) => {
        const data = (socket as any).data as SocketData;
        const workspaceId = data.workspaceId;

        console.log(`[Socket] Agent connected: ${data.id} (socket: ${socket.id})`);

        // ── Presence: agent online ──
        presenceStore.agentConnect(data.id, socket.id, { name: data.name, workspaceId });

        // Broadcast to workspace agents
        if (workspaceId) {
            emitToWorkspace(workspaceId, 'presence:agentStatus', {
                userId: data.id, name: data.name, status: 'online',
            });
            // Broadcast to all visitors in this workspace (widget "we're online")
            getIO().of('/visitor').emit('agents:status', {
                workspaceId,
                hasOnlineAgent: presenceStore.countOnlineAgents(workspaceId) > 0,
                onlineCount: presenceStore.countOnlineAgents(workspaceId),
            });
        }

        // Auto-join workspace room on connect
        if (workspaceId) {
            socket.join(rooms.workspace(workspaceId));
        }

        // Join personal user room for direct notifications
        socket.join(rooms.user(data.id));

        // ── Workspace room management ──

        // Switch workspace (leave old, join new)
        socket.on('join:workspace', (wsData: { workspaceId: string }) => {
            // Leave all current workspace rooms first
            socket.rooms.forEach((room) => {
                if (room.startsWith('ws:')) socket.leave(room);
            });
            if (wsData.workspaceId) {
                socket.join(rooms.workspace(wsData.workspaceId));
                (socket as any).data.workspaceId = wsData.workspaceId;
            }
        });

        socket.on('leave:workspace', (wsData: { workspaceId: string }) => {
            if (wsData.workspaceId) {
                socket.leave(rooms.workspace(wsData.workspaceId));
            }
        });

        // ── Conversation room management ──

        // Join a single conversation
        socket.on('join:conversation', (convData: { conversationId: string }) => {
            if (convData.conversationId) {
                socket.join(rooms.conversation(convData.conversationId));
                console.log(`[Socket] Agent ${data.id} joined room: ${rooms.conversation(convData.conversationId)}`);
            }
        });

        // Batch join conversations (e.g. agent opens inbox, subscribes to all active convs)
        socket.on('join:conversations', (convData: { conversationIds: string[] }) => {
            if (Array.isArray(convData.conversationIds)) {
                convData.conversationIds.forEach((cid) => {
                    socket.join(rooms.conversation(cid));
                });
            }
        });

        // Leave a conversation room
        socket.on('leave:conversation', (convData: { conversationId: string }) => {
            if (convData.conversationId) {
                socket.leave(rooms.conversation(convData.conversationId));
            }
        });

        // ── Typing indicators ──

        socket.on('typing:start', (typingData: { conversationId: string }) => {
            socket.to(rooms.conversation(typingData.conversationId)).emit('typing:start', {
                conversationId: typingData.conversationId,
                sender: { type: 'agent', id: data.id, name: data.name },
            });
        });

        socket.on('typing:stop', (typingData: { conversationId: string }) => {
            socket.to(rooms.conversation(typingData.conversationId)).emit('typing:stop', {
                conversationId: typingData.conversationId,
                sender: { type: 'agent', id: data.id, name: data.name },
            });
        });

        // ── Message Status Updates ──
        socket.on('message:delivered', async (msgData: { messageIds: string[], conversationId: string }) => {
            if (msgData.messageIds?.length > 0) {
                await messageRepo.markAsDelivered(msgData.messageIds);
                socket.to(rooms.conversation(msgData.conversationId)).emit('message:updated', {
                    messageIds: msgData.messageIds,
                    status: 'delivered'
                });
            }
        });

        socket.on('message:seen', async (seenData: { conversationId: string, messageId: string }) => {
            if (seenData.conversationId && seenData.messageId) {
                // Update cursor for agent
                await conversationRepo.updateReadCursor(seenData.conversationId, data.id, 'agent', seenData.messageId);
                // Mark visitor/system messages as read
                await messageRepo.markAsReadUpTo(seenData.conversationId, seenData.messageId, 'visitor');
                
                // Reset unread count for agent inbox
                await conversationRepo.markRead(seenData.conversationId);
                
                socket.to(rooms.conversation(seenData.conversationId)).emit('messages:read', {
                    conversationId: seenData.conversationId,
                    lastReadMessageId: seenData.messageId,
                    participantId: data.id,
                    participantType: 'agent'
                });
                
                if (workspaceId) {
                    emitToWorkspace(workspaceId, 'conversation:updated', {
                        conversationId: seenData.conversationId,
                        unreadCount: 0
                    });
                }
            }
        });

        // Agent heartbeat for idle detection
        socket.on('heartbeat', () => {
            const wasAway = presenceStore.getAgentStatus(data.id) === 'away';
            presenceStore.agentHeartbeat(data.id);
            if (wasAway && workspaceId) {
                emitToWorkspace(workspaceId, 'presence:agentStatus', {
                    userId: data.id, name: data.name, status: 'online',
                });
            }
        });

        // Manual status change (e.g. agent sets themselves as 'away')
        socket.on('presence:setStatus', (statusData: { status: 'online' | 'away' }) => {
            presenceStore.setAgentStatus(data.id, statusData.status);
            if (workspaceId) {
                emitToWorkspace(workspaceId, 'presence:agentStatus', {
                    userId: data.id, name: data.name, status: statusData.status,
                });
            }
        });

        socket.on('disconnect', async (reason) => {
            console.log(`[Socket] Agent disconnected: ${data.id} (${reason})`);

            // ── Presence: agent disconnect ──
            const newStatus = presenceStore.agentDisconnect(data.id, socket.id);
            if (newStatus === 'offline' && workspaceId) {
                emitToWorkspace(workspaceId, 'presence:agentStatus', {
                    userId: data.id, name: data.name, status: 'offline',
                });
                // Update widget "agents online" indicator
                getIO().of('/visitor').emit('agents:status', {
                    workspaceId,
                    hasOnlineAgent: presenceStore.countOnlineAgents(workspaceId) > 0,
                    onlineCount: presenceStore.countOnlineAgents(workspaceId),
                });
            }

            // Requeue conversations if agent disconnected unexpectedly and fully offline
            if (newStatus === 'offline' && (reason === 'transport close' || reason === 'ping timeout')) {
                try {
                    const count = await conversationRepo.requeueByAgent(data.id);
                    if (count > 0 && workspaceId) {
                        console.log(`[Socket] Requeued ${count} conversations from agent ${data.id}`);
                        const wsRoom = rooms.workspace(workspaceId);
                        agentNs.to(wsRoom).emit('conversation:requeued', { agentId: data.id, count });
                    }
                } catch (err) {
                    console.error('[Socket] Error requeuing conversations:', err);
                }
            }
        });
    });

    console.log('[Socket] Realtime gateway initialized (namespaces: /visitor, /agent)');

    // ── Presence idle check cron (every 60 seconds) ──
    setInterval(() => {
        // Check idle agents
        const idleAgents = presenceStore.checkIdleAgents();
        for (const agent of idleAgents) {
            console.log(`[Presence] Agent ${agent.userId} → away (idle)`);
            if (agent.workspaceId) {
                emitToWorkspace(agent.workspaceId, 'presence:agentStatus', {
                    userId: agent.userId, status: 'away',
                });
            }
        }
        // Check idle visitors
        const idleVisitors = presenceStore.checkIdleVisitors();
        for (const v of idleVisitors) {
            console.log(`[Presence] Visitor ${v.visitorId} → idle`);
        }
    }, 60 * 1000);

    // ── SLA check cron (every 5 minutes) ──
    setInterval(async () => {
        try {
            const { conversationService } = require('../modules/conversation/conversation.service');
            await conversationService.checkSLABreaching();
        } catch (err) {
            console.error('[SLA Cron] Error checking SLA:', err);
        }
    }, 5 * 60 * 1000);

    // ────────── Remote Session Namespace ──────────
    const remoteNs = io.of('/remote');

    // Auth middleware (JWT same as agent)
    remoteNs.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('MISSING_TOKEN'));
        try {
            const decoded = jwt.verify(token as string, env.JWT_SECRET) as any;
            (socket as any).data = {
                type: 'agent',
                id: decoded.id || decoded.userId,
                name: decoded.name || 'Unknown',
                workspaceId: socket.handshake.query?.workspaceId || decoded.workspaceId,
            } as SocketData;
            next();
        } catch {
            next(new Error('INVALID_TOKEN'));
        }
    });

    // Track active screencasts per socket
    const activeScreencasts = new Map<string, string>(); // socketId → sessionId

    remoteNs.on('connection', (socket: Socket) => {
        const data = (socket as any).data as SocketData;
        console.log(`[Remote] User ${data.name} (${data.id}) connected`);

        // ── Join a browser session ──
        socket.on('session:join', async ({ sessionId }: { sessionId: string }) => {
            try {
                const instance = browserPool.get(sessionId);
                if (!instance || instance.status !== 'running') {
                    socket.emit('session:error', { message: 'Phiên trình duyệt không hoạt động' });
                    return;
                }

                const room = `remote:${sessionId}`;
                socket.join(room);

                // Track viewer
                await externalSessionRepo.addViewer(sessionId, data.id);
                await externalSessionRepo.logAudit({
                    sessionId, workspaceId: data.workspaceId || '', userId: data.id, action: 'viewer_joined',
                });

                // Broadcast viewer list + control state
                const session = await externalSessionRepo.findById(sessionId);
                remoteNs.to(room).emit('viewers:updated', session?.viewers || []);
                remoteNs.to(room).emit('control:changed', { userId: session?.controlledBy?.toString() || null });
                socket.emit('session:status', { status: session?.status });

                // Start screencast — send base64 data URL instead of raw Buffer
                activeScreencasts.set(socket.id, sessionId);
                if (!instance.browser.connected) {
                    socket.emit('session:error', { message: 'Trình duyệt đã mất kết nối' });
                    return;
                }
                startScreencast(instance.cdpSession, (frameBuffer) => {
                    const base64 = frameBuffer.toString('base64');
                    socket.emit('session:frame', { image: `data:image/jpeg;base64,${base64}` });
                });

                // Check login state
                const loginState = await detectLoginState(instance.page);
                socket.emit('session:loginState', { state: loginState });

                console.log(`[Remote] ${data.name} joined session ${sessionId}`);
            } catch (err: any) {
                socket.emit('session:error', { message: err.message });
            }
        });

        // ── Leave session ──
        socket.on('session:leave', async ({ sessionId }: { sessionId: string }) => {
            socket.leave(`remote:${sessionId}`);
            activeScreencasts.delete(socket.id);
            await externalSessionRepo.removeViewer(sessionId, data.id);
            const session = await externalSessionRepo.findById(sessionId);
            remoteNs.to(`remote:${sessionId}`).emit('viewers:updated', session?.viewers || []);
        });

        // ── Mouse input (control-locked) ──
        socket.on('input:mouse', async (p: any) => {
            try {
                const session = await externalSessionRepo.findById(p.sessionId);
                if (!session || session.controlledBy?.toString() !== data.id) return;
                const inst = browserPool.get(p.sessionId);
                if (!inst) return;
                await dispatchMouse(inst.cdpSession, p.type, p.x, p.y, p.button || 'left', p.clickCount || 1);
            } catch { /* silent */ }
        });

        // ── Keyboard input (control-locked) ──
        socket.on('input:keyboard', async (p: any) => {
            try {
                const session = await externalSessionRepo.findById(p.sessionId);
                if (!session || session.controlledBy?.toString() !== data.id) return;
                const inst = browserPool.get(p.sessionId);
                if (!inst) return;
                await dispatchKeyboard(inst.cdpSession, p.type, p.key, p.code || '', p.text || '');
            } catch { /* silent */ }
        });

        // ── Scroll input (control-locked) ──
        socket.on('input:scroll', async (p: any) => {
            try {
                const session = await externalSessionRepo.findById(p.sessionId);
                if (!session || session.controlledBy?.toString() !== data.id) return;
                const inst = browserPool.get(p.sessionId);
                if (!inst) return;
                await dispatchScroll(inst.cdpSession, p.x, p.y, p.deltaX, p.deltaY);
            } catch { /* silent */ }
        });

        // ── Take control ──
        socket.on('control:take', async ({ sessionId }: { sessionId: string }) => {
            try {
                await externalSessionRepo.setController(sessionId, data.id);
                await externalSessionRepo.logAudit({
                    sessionId, workspaceId: data.workspaceId || '', userId: data.id, action: 'control_taken',
                });
                remoteNs.to(`remote:${sessionId}`).emit('control:changed', { userId: data.id, name: data.name });
            } catch (err: any) {
                socket.emit('session:error', { message: err.message });
            }
        });

        // ── Release control ──
        socket.on('control:release', async ({ sessionId }: { sessionId: string }) => {
            try {
                const session = await externalSessionRepo.findById(sessionId);
                if (session?.controlledBy?.toString() !== data.id) return;
                await externalSessionRepo.setController(sessionId, null);
                await externalSessionRepo.logAudit({
                    sessionId, workspaceId: data.workspaceId || '', userId: data.id, action: 'control_released',
                });
                remoteNs.to(`remote:${sessionId}`).emit('control:changed', { userId: null, name: null });
            } catch { /* silent */ }
        });

        // ── Manual login check (for non-Zalo sessions only) ──
        socket.on('session:checkLogin', async ({ sessionId }: { sessionId: string }) => {
            try {
                const inst = browserPool.get(sessionId);
                if (!inst) return;
                const state = await detectLoginState(inst.page);
                socket.emit('session:loginState', { state });
                if (state === 'logged_in') {
                    const session = await externalSessionRepo.findById(sessionId);
                    if (session && session.status === 'pending_login') {
                        await externalSessionRepo.updateStatus(sessionId, 'connected', { connectedAt: new Date() });
                        await externalSessionRepo.logAudit({
                            sessionId, workspaceId: data.workspaceId || '', userId: data.id, action: 'login_success',
                        });
                        remoteNs.to(`remote:${sessionId}`).emit('session:status', { status: 'connected' });
                        remoteNs.to(`remote:${sessionId}`).emit('session:loginDetected', {});
                    }
                }
            } catch { /* silent */ }
        });

        // ── Start zca-js session (native Zalo API) ──
        socket.on('zalo:connectZCA', async ({ sessionId }: { sessionId: string }) => {
            try {
                console.log(`[ZaloZCA] Starting zca-js session for ${sessionId}...`);

                await createZaloSession(
                    sessionId,
                    // onQR: send QR code data to frontend
                    (qrDataUrl) => {
                        socket.emit('zalo:qrCode', { sessionId, qrDataUrl });
                    },
                    // onLogin: session connected
                    async (session) => {
                        console.log(`[ZaloZCA] Session ${sessionId} logged in via thành công`);
                        try { await externalSessionRepo.updateStatus(sessionId, 'connected', { connectedAt: new Date() }); } catch { /* virtual account */ }
                        socket.emit('session:status', { status: 'connected' });
                        socket.emit('session:loginDetected', {});
                        socket.emit('zalo:zcaConnected', { sessionId });
                    },
                    // onMessage: realtime incoming message
                    (msg) => {
                        // Persist to DB (fire-and-forget, non-blocking)
                        saveZaloMessageToDB(sessionId, msg).catch(() => {});
                        remoteNs.to(`remote:${sessionId}`).emit('zalo:newMessage', {
                            msgId: msg.msgId,
                            content: msg.content,
                            senderId: msg.senderId,
                            senderName: msg.senderName,
                            conversationId: msg.threadId,
                            isGroup: msg.threadType === 'group',
                            isSelf: msg.isSelf,
                            timestamp: msg.timestamp,
                            msgType: msg.msgType,
                            threadType: msg.threadType,
                            attachmentUrl: msg.attachmentUrl,
                            thumbUrl: msg.thumbUrl,
                        });
                    },
                    // onError
                    (error) => {
                        socket.emit('zalo:zcaError', { sessionId, error });
                    },
                );
            } catch (err: any) {
                console.error(`[ZaloZCA] connectZCA error:`, err);
                socket.emit('zalo:zcaError', { sessionId, error: err.message });
            }
        });

        // ── Join Zalo session room for realtime events (zca-js) ──
        socket.on('zalo:join', ({ sessionId }: { sessionId: string }) => {
            const room = `remote:${sessionId}`;
            const roomsToLeave = Array.from(socket.rooms).filter(r => r.startsWith('remote:') && r !== room);
            for (const r of roomsToLeave) socket.leave(r);
            socket.join(room);
            console.log(`[ZaloZCA] Socket ${socket.id} joined room ${room} for realtime events`);
        });

        // ── Restore zca-js session from saved credentials (no QR needed) ──
        socket.on('zalo:restoreSession', async ({ sessionId }: { sessionId: string }) => {
            try {
                console.log(`[ZaloZCA] Attempting session restore for ${sessionId}...`);

                if (isZaloSessionConnected(sessionId)) {
                    console.log(`[ZaloZCA] Session ${sessionId} already connected — registering socket forwarder`);
                    // Register an additional callback so incoming messages are forwarded to this socket
                    addSessionMessageCallback(sessionId, (msg) => {
                        saveZaloMessageToDB(sessionId, msg).catch(() => {});
                        remoteNs.to(`remote:${sessionId}`).emit('zalo:newMessage', {
                            msgId: msg.msgId,
                            content: msg.content,
                            senderId: msg.senderId,
                            senderName: msg.senderName,
                            conversationId: msg.threadId,
                            isGroup: msg.threadType === 'group',
                            isSelf: msg.isSelf,
                            timestamp: msg.timestamp,
                            msgType: msg.msgType,
                            threadType: msg.threadType,
                            attachmentUrl: msg.attachmentUrl,
                            thumbUrl: msg.thumbUrl,
                        });
                    });
                    socket.emit('zalo:zcaConnected', { sessionId });
                    return;
                }

                const restored = await restoreZaloSession(
                    sessionId,
                    // onMessage
                    (msg) => {
                        // Persist to DB (fire-and-forget, non-blocking)
                        saveZaloMessageToDB(sessionId, msg).catch(() => {});
                        remoteNs.to(`remote:${sessionId}`).emit('zalo:newMessage', {
                            msgId: msg.msgId,
                            content: msg.content,
                            senderId: msg.senderId,
                            senderName: msg.senderName,
                            conversationId: msg.threadId,
                            isGroup: msg.threadType === 'group',
                            isSelf: msg.isSelf,
                            timestamp: msg.timestamp,
                            msgType: msg.msgType,
                            threadType: msg.threadType,
                            attachmentUrl: msg.attachmentUrl,
                            thumbUrl: msg.thumbUrl,
                        });
                    },
                    // onError
                    (error) => {
                        socket.emit('zalo:zcaError', { sessionId, error });
                    },
                );

                if (restored) {
                    try { await externalSessionRepo.updateStatus(sessionId, 'connected', { connectedAt: new Date() }); } catch { /* virtual account — no DB entry */ }
                    socket.emit('session:status', { status: 'connected' });
                    socket.emit('zalo:zcaConnected', { sessionId });
                    console.log(`[ZaloZCA] Session ${sessionId} restored successfully!`);
                } else {
                    socket.emit('zalo:zcaError', { sessionId, error: 'Không có session đã lưu — vui lòng quét QR' });
                }
            } catch (err: any) {
                console.error(`[ZaloZCA] restoreSession error:`, err);
                socket.emit('zalo:zcaError', { sessionId, error: err.message });
            }
        });

        // ── Get Zalo conversations (pure zca-js) ──
        socket.on('zalo:getConversations', async ({ sessionId }: { sessionId: string }) => {
            try {
                if (!isZaloSessionConnected(sessionId)) {
                    socket.emit('zalo:conversations', { conversations: [], error: 'Zalo chưa kết nối — vui lòng quét QR hoặc đợi restore session' });
                    return;
                }

                console.log(`[Zalo] Getting conversations via zca-js for ${sessionId}...`);
                const conversations = await getZaloConversations(sessionId);
                console.log(`[Zalo] zca-js returned ${conversations.length} conversations`);

                const mapped = conversations.map((c) => ({
                    _id: `zca_${c.threadId}`,
                    contactName: c.displayName,
                    avatar: c.avatar || '',
                    lastMsg: c.lastMessage || '',
                    lastMsgTime: c.lastMessageAt || '',
                    threadId: c.threadId,
                    threadType: c.threadType,
                }));

                socket.emit('zalo:conversations', { conversations: mapped });
            } catch (err: any) {
                console.error(`[Zalo] getConversations error:`, err);
                socket.emit('zalo:conversations', { conversations: [], error: err.message || 'Lỗi không xác định' });
            }
        });

        // ── Get Zalo messages (pure zca-js) ──
        socket.on('zalo:getMessages', async ({ sessionId, threadId, threadType }: {
            sessionId: string; contactName?: string; threadId?: string; threadType?: 'user' | 'group';
        }) => {
            try {
                if (!isZaloSessionConnected(sessionId) || !threadId) {
                    socket.emit('zalo:messages', { messages: [], error: !threadId ? 'Thiếu threadId' : 'Zalo chưa kết nối' });
                    return;
                }

                console.log(`[Zalo] Getting messages via zca-js for thread ${threadId}...`);
                const messages = await getZaloMessages(sessionId, threadId, threadType || 'user');
                console.log(`[Zalo] zca-js returned ${messages.length} messages`);

                // SAVE HISTORY TO DB (fire-and-forget)
                getWorkspaceIdForSession(sessionId).then(workspaceId => {
                    if (workspaceId && messages.length > 0) {
                        const toSave = messages.map((m: any) => ({
                            workspaceId,
                            threadId,
                            threadType: threadType || 'user',
                            msgId: m.id,
                            senderId: String(m.senderId),
                            senderName: m.senderName || (m.senderType === 'me' ? 'Agent' : 'Khách'),
                            content: m.content || '',
                            msgType: m.type || 'text',
                            attachmentUrl: m.attachmentUrl,
                            thumbUrl: m.thumbUrl,
                            isSelf: m.senderType === 'me',
                            timestamp: new Date(m.createdAt),
                        }));
                        zaloMessageRepo.saveMany(toSave).catch(err => {
                            console.error('[ZaloDB] Failed to save scraped history messages:', err);
                        });
                    }
                }).catch(() => {});

                socket.emit('zalo:messages', { messages });
            } catch (err: any) {
                console.error(`[Zalo] getMessages error:`, err);
                socket.emit('zalo:messages', { messages: [], error: err.message || 'Lỗi không xác định' });
            }
        });

        // ── Send message (pure zca-js) ──
        socket.on('zalo:sendMessage', async ({ sessionId, text, threadId, threadType, imageUrl }: {
            sessionId: string; text: string; contactName?: string; threadId?: string; threadType?: 'user' | 'group'; imageUrl?: string;
        }) => {
            try {
                if (!isZaloSessionConnected(sessionId) || !threadId) {
                    socket.emit('zalo:messageSent', { success: false, error: !threadId ? 'Thiếu threadId' : 'Zalo chưa kết nối' });
                    return;
                }

                let result;
                if (imageUrl) {
                    console.log(`[Zalo] Sending image via zca-js to ${threadType} ${threadId}: "${imageUrl.substring(0, 60)}"...`);
                    result = await sendZaloImage(sessionId, threadId, threadType || 'user', imageUrl, text);
                } else {
                    console.log(`[Zalo] Sending via zca-js to ${threadType} ${threadId}: "${text.substring(0, 50)}"...`);
                    result = await sendZaloMsg(sessionId, threadId, threadType || 'user', text);
                }
                socket.emit('zalo:messageSent', result);

                if (result.success) {
                    // Lưu tin nhắn ĐÃ GỬI vào DB
                    const workspaceId = await getWorkspaceIdForSession(sessionId);
                    if (workspaceId && text) {
                        zaloMessageRepo.saveMessage({
                            workspaceId,
                            threadId: threadId!,
                            threadType: threadType || 'user',
                            msgId: result.msgId || `sent_${Date.now()}`,
                            senderId: data.id,
                            senderName: data.name || 'Agent',
                            content: text,
                            msgType: imageUrl ? 'image' : 'text',
                            attachmentUrl: imageUrl,
                            isSelf: true,
                            timestamp: new Date(),
                        }).catch((err: any) => console.error('[ZaloDB] Failed to save sent message:', err));
                    }
                    // Re-fetch messages after send for updated list
                    await new Promise(r => setTimeout(r, 300));
                    const messages = await getZaloMessages(sessionId, threadId, threadType || 'user');
                    socket.emit('zalo:messages', { messages });
                }
            } catch (err: any) {
                console.error(`[Zalo] sendMessage error:`, err);
                socket.emit('zalo:messageSent', { success: false, error: err.message || 'Lỗi không xác định' });
            }
        });

        // ── Logout Zalo (clear credentials) ──
        socket.on('zalo:logout', async ({ sessionId }: { sessionId: string }) => {
            try {
                logoutZaloSession(sessionId);
                await externalSessionRepo.updateStatus(sessionId, 'disconnected');
                socket.emit('session:status', { status: 'disconnected' });
                console.log(`[ZaloZCA] Session ${sessionId} logged out`);
            } catch (err: any) {
                socket.emit('zalo:zcaError', { sessionId, error: err.message });
            }
        });

        // ── Undo (recall) a message ──
        socket.on('zalo:undoMessage', async ({ sessionId, msgId, cliMsgId, threadId, threadType }: {
            sessionId: string; msgId: string; cliMsgId: string; threadId: string; threadType?: 'user' | 'group';
        }) => {
            try {
                const result = await undoZaloMessage(sessionId, msgId, cliMsgId, threadId, threadType || 'user');
                socket.emit('zalo:undoResult', { success: true, msgId, result });
                // Broadcast to room so UI removes the message
                remoteNs.to(`remote:${sessionId}`).emit('zalo:messageRecalled', { msgId, threadId });
            } catch (err: any) {
                socket.emit('zalo:undoResult', { success: false, error: err.message });
            }
        });

        // ── Reply (quote) a message ──
        socket.on('zalo:replyMessage', async ({ sessionId, threadId, threadType, text, quotedMsg }: {
            sessionId: string; threadId: string; threadType: 'user' | 'group'; text: string;
            quotedMsg: { msgId: string; cliMsgId: string; content: string; uidFrom: string; ts: number };
        }) => {
            try {
                const result = await sendZaloReply(sessionId, threadId, threadType, text, quotedMsg);
                socket.emit('zalo:messageSent', { success: true, result });
                // Re-fetch messages
                await new Promise(r => setTimeout(r, 300));
                const messages = await getZaloMessages(sessionId, threadId, threadType);
                socket.emit('zalo:messages', { messages });
            } catch (err: any) {
                socket.emit('zalo:messageSent', { success: false, error: err.message });
            }
        });

        // ── Search stickers ──
        socket.on('zalo:searchStickers', async ({ sessionId, keyword }: {
            sessionId: string; keyword: string;
        }) => {
            try {
                const stickers = await searchZaloStickers(sessionId, keyword);
                socket.emit('zalo:stickersResult', { stickers });
            } catch (err: any) {
                socket.emit('zalo:stickersResult', { stickers: [], error: err.message });
            }
        });

        // ── Send sticker ──
        socket.on('zalo:sendSticker', async ({ sessionId, sticker, threadId, threadType }: {
            sessionId: string; sticker: { id: number; cateId: number; type: number };
            threadId: string; threadType?: 'user' | 'group';
        }) => {
            try {
                await sendZaloSticker(sessionId, sticker, threadId, threadType || 'user');
                socket.emit('zalo:messageSent', { success: true });
                // Re-fetch messages
                await new Promise(r => setTimeout(r, 300));
                const messages = await getZaloMessages(sessionId, threadId, threadType || 'user');
                socket.emit('zalo:messages', { messages });
            } catch (err: any) {
                socket.emit('zalo:messageSent', { success: false, error: err.message });
            }
        });

        // ── Send voice ──
        socket.on('zalo:sendVoice', async ({ sessionId, voiceUrl, threadId, threadType }: {
            sessionId: string; voiceUrl: string; threadId: string; threadType?: 'user' | 'group';
        }) => {
            try {
                await sendZaloVoice(sessionId, voiceUrl, threadId, threadType || 'user');
                socket.emit('zalo:messageSent', { success: true });
            } catch (err: any) {
                socket.emit('zalo:messageSent', { success: false, error: err.message });
            }
        });

        // ── Get contact data for a thread ──
        socket.on('zalo:getContactData', async ({ sessionId, threadId }: {
            sessionId: string; threadId: string;
        }) => {
            try {
                loadContactData(sessionId); // ensure loaded
                const data = getThreadContactData(sessionId, threadId);
                socket.emit('zalo:contactData', { threadId, data });
            } catch (err: any) {
                socket.emit('zalo:contactData', { threadId, data: null, error: err.message });
            }
        });

        // ── Get all contact data for a session ──
        socket.on('zalo:getAllContacts', async ({ sessionId }: { sessionId: string }) => {
            try {
                loadContactData(sessionId);
                const contacts = getAllContactData(sessionId);
                socket.emit('zalo:allContacts', { contacts });
            } catch (err: any) {
                socket.emit('zalo:allContacts', { contacts: [], error: err.message });
            }
        });

        // ── Disconnect cleanup ──
        socket.on('disconnect', async () => {
            const sessionId = activeScreencasts.get(socket.id);
            if (sessionId) {
                activeScreencasts.delete(socket.id);
                await externalSessionRepo.removeViewer(sessionId, data.id);
                const session = await externalSessionRepo.findById(sessionId);
                if (session?.controlledBy?.toString() === data.id) {
                    await externalSessionRepo.setController(sessionId, null);
                    remoteNs.to(`remote:${sessionId}`).emit('control:changed', { userId: null, name: null });
                }
                const updated = await externalSessionRepo.findById(sessionId);
                remoteNs.to(`remote:${sessionId}`).emit('viewers:updated', updated?.viewers || []);
            }
            console.log(`[Remote] User ${data.name} disconnected`);
        });
    });

    return io;
}

/**
 * Get the Socket.IO server instance.
 */
export function getIO(): Server {
    if (!io) throw new Error('Socket.IO not initialized — call initSocketGateway first');
    return io;
}

/**
 * Emit event to a conversation room (both visitors and agents in this conversation).
 */
export function emitToConversation(conversationId: string, event: string, data: any) {
    const server = getIO();
    const room = rooms.conversation(conversationId);
    console.log(`[Socket] emitToConversation room=${room} event=${event}`);
    server.of('/visitor').to(room).emit(event, data);
    server.of('/agent').to(room).emit(event, data);
}

/**
 * Emit event to a workspace room (all agents in this workspace).
 */
export function emitToWorkspace(workspaceId: string, event: string, data: any) {
    getIO().of('/agent').to(rooms.workspace(workspaceId)).emit(event, data);
}

/**
 * Emit event to a specific agent user.
 */
export function emitToUser(userId: string, event: string, data: any) {
    getIO().of('/agent').to(rooms.user(userId)).emit(event, data);
}

/**
 * Get online agents for a workspace (for REST API).
 */
export function getWorkspacePresence(workspaceId: string) {
    return presenceStore.getOnlineAgents(workspaceId);
}

/**
 * Get visitor presence status.
 */
export function getVisitorPresence(visitorId: string) {
    return presenceStore.getVisitorStatus(visitorId);
}
