/**
 * In-memory Presence Store
 *
 * Tracks agent + visitor presence across multiple connections (tabs/devices).
 * Each userId maps to a set of socketIds and a computed status.
 *
 * Agent statuses: 'online' | 'away' | 'offline'
 * Visitor statuses: 'online' | 'idle' | 'offline'
 */

export type AgentStatus = 'online' | 'away' | 'offline';
export type VisitorStatus = 'online' | 'idle' | 'offline';

interface AgentEntry {
    connections: Set<string>;     // socketIds
    status: AgentStatus;
    name?: string;
    workspaceId?: string;
    lastActivity: number;         // Date.now()
}

interface VisitorEntry {
    connections: Set<string>;
    status: VisitorStatus;
    lastActivity: number;
}

// ── Agent Store ──
const agentPresence = new Map<string, AgentEntry>();

// ── Visitor Store ──
const visitorPresence = new Map<string, VisitorEntry>();

// Idle threshold: 5 minutes of no heartbeat → away
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export const presenceStore = {
    // ──────────── AGENT ────────────

    agentConnect(userId: string, socketId: string, meta?: { name?: string; workspaceId?: string }) {
        const existing = agentPresence.get(userId);
        if (existing) {
            existing.connections.add(socketId);
            existing.status = 'online';
            existing.lastActivity = Date.now();
            if (meta?.name) existing.name = meta.name;
            if (meta?.workspaceId) existing.workspaceId = meta.workspaceId;
        } else {
            agentPresence.set(userId, {
                connections: new Set([socketId]),
                status: 'online',
                name: meta?.name,
                workspaceId: meta?.workspaceId,
                lastActivity: Date.now(),
            });
        }
    },

    agentDisconnect(userId: string, socketId: string): AgentStatus {
        const entry = agentPresence.get(userId);
        if (!entry) return 'offline';

        entry.connections.delete(socketId);

        // Only go offline if NO connections remain (multi-device)
        if (entry.connections.size === 0) {
            entry.status = 'offline';
            agentPresence.delete(userId);
            return 'offline';
        }
        return entry.status;
    },

    agentHeartbeat(userId: string) {
        const entry = agentPresence.get(userId);
        if (entry) {
            entry.lastActivity = Date.now();
            if (entry.status === 'away') {
                entry.status = 'online';
            }
        }
    },

    setAgentStatus(userId: string, status: AgentStatus) {
        const entry = agentPresence.get(userId);
        if (entry) {
            entry.status = status;
            if (status === 'online') entry.lastActivity = Date.now();
        }
    },

    getAgentStatus(userId: string): AgentStatus {
        return agentPresence.get(userId)?.status || 'offline';
    },

    getAgentEntry(userId: string): AgentEntry | undefined {
        return agentPresence.get(userId);
    },

    /**
     * Get all online agents for a workspace
     */
    getOnlineAgents(workspaceId: string): Array<{ userId: string; status: AgentStatus; name?: string }> {
        const result: Array<{ userId: string; status: AgentStatus; name?: string }> = [];
        for (const [userId, entry] of agentPresence.entries()) {
            if (entry.workspaceId === workspaceId && entry.status !== 'offline') {
                result.push({ userId, status: entry.status, name: entry.name });
            }
        }
        return result;
    },

    /**
     * Count online agents for a workspace (for widget "we're online" check)
     */
    countOnlineAgents(workspaceId: string): number {
        let count = 0;
        for (const entry of agentPresence.values()) {
            if (entry.workspaceId === workspaceId && entry.status === 'online') count++;
        }
        return count;
    },

    /**
     * Check idle agents and move them to 'away'. Returns list of agents whose status changed.
     */
    checkIdleAgents(): Array<{ userId: string; workspaceId?: string }> {
        const now = Date.now();
        const changed: Array<{ userId: string; workspaceId?: string }> = [];
        for (const [userId, entry] of agentPresence.entries()) {
            if (entry.status === 'online' && now - entry.lastActivity > IDLE_THRESHOLD_MS) {
                entry.status = 'away';
                changed.push({ userId, workspaceId: entry.workspaceId });
            }
        }
        return changed;
    },

    // ──────────── VISITOR ────────────

    visitorConnect(visitorId: string, socketId: string) {
        const existing = visitorPresence.get(visitorId);
        if (existing) {
            existing.connections.add(socketId);
            existing.status = 'online';
            existing.lastActivity = Date.now();
        } else {
            visitorPresence.set(visitorId, {
                connections: new Set([socketId]),
                status: 'online',
                lastActivity: Date.now(),
            });
        }
    },

    visitorDisconnect(visitorId: string, socketId: string): VisitorStatus {
        const entry = visitorPresence.get(visitorId);
        if (!entry) return 'offline';

        entry.connections.delete(socketId);
        if (entry.connections.size === 0) {
            entry.status = 'offline';
            visitorPresence.delete(visitorId);
            return 'offline';
        }
        return entry.status;
    },

    visitorHeartbeat(visitorId: string) {
        const entry = visitorPresence.get(visitorId);
        if (entry) {
            entry.lastActivity = Date.now();
            if (entry.status === 'idle') entry.status = 'online';
        }
    },

    getVisitorStatus(visitorId: string): VisitorStatus {
        return visitorPresence.get(visitorId)?.status || 'offline';
    },

    /**
     * Check idle visitors (no heartbeat > threshold) and mark 'idle'
     */
    checkIdleVisitors(): Array<{ visitorId: string }> {
        const now = Date.now();
        const changed: Array<{ visitorId: string }> = [];
        for (const [visitorId, entry] of visitorPresence.entries()) {
            if (entry.status === 'online' && now - entry.lastActivity > IDLE_THRESHOLD_MS) {
                entry.status = 'idle';
                changed.push({ visitorId });
            }
        }
        return changed;
    },

    // ──────────── DEBUG ────────────

    getAllAgents() {
        const result: Record<string, { status: AgentStatus; connections: number; name?: string }> = {};
        for (const [userId, entry] of agentPresence.entries()) {
            result[userId] = { status: entry.status, connections: entry.connections.size, name: entry.name };
        }
        return result;
    },

    getAllVisitors() {
        const result: Record<string, { status: VisitorStatus; connections: number }> = {};
        for (const [visitorId, entry] of visitorPresence.entries()) {
            result[visitorId] = { status: entry.status, connections: entry.connections.size };
        }
        return result;
    },
};
