import { workspaceRepo } from './repos/workspace.repo';
import { widgetRepo } from './repos/widget.repo';
import { offlineMessageRepo } from './repos/offlineMessage.repo';
import { AppError } from '../../middlewares/errorHandler';
import { userRepo } from '../auth/repos/user.repo';
import { conversationRepo } from '../conversation/repos/conversation.repo';

export const workspaceService = {
    async createWorkspace(name: string, slug: string, ownerId: string) {
        const existing = await workspaceRepo.findBySlug(slug);
        if (existing) throw new AppError('Slug đã được sử dụng', 409, 'DUPLICATE_SLUG');

        const workspace = await workspaceRepo.create({
            name,
            slug,
            ownerId: ownerId as any,
            members: [{ userId: ownerId as any, role: 'owner', joinedAt: new Date() }],
        });

        return workspace;
    },

    async getWorkspace(id: string) {
        const ws = await workspaceRepo.findById(id);
        if (!ws || !ws.isActive) throw new AppError('Workspace không tồn tại', 404, 'NOT_FOUND');
        return ws;
    },

    async getDashboardStats(workspaceId: string) {
        const workspace = await workspaceRepo.findById(workspaceId);
        if (!workspace || !workspace.isActive) throw new AppError('Workspace không tồn tại', 404, 'NOT_FOUND');

        const [
            totalConversations,
            openConversations,
            closedConversations,
            widgets,
            pendingMessages
        ] = await Promise.all([
            conversationRepo.countByWorkspace(workspaceId),
            conversationRepo.countByWorkspace(workspaceId, 'open'),
            conversationRepo.countByWorkspace(workspaceId, 'closed'),
            widgetRepo.findByWorkspace(workspaceId),
            offlineMessageRepo.countPending(workspaceId)
        ]);

        return {
            overview: {
                name: workspace.name,
                domain: workspace.slug,
                status: workspace.isActive ? 'Hoạt động' : 'Tạm dừng',
                totalMembers: workspace.members.length,
                totalConversations,
                totalTickets: 0,
                totalCustomers: 0,
            },
            conversations: {
                total: totalConversations,
                open: openConversations,
                closed: closedConversations,
                missed: pendingMessages,
                transferred: 0,
            },
            customers: {
                totalVisitors: totalConversations, // simple proxy
                totalContacts: 0,
            },
            members: {
                total: workspace.members.length,
                online: 0, // To be hydrated by presence on client
            },
            config: {
                totalWidgets: widgets.length,
                activeRules: 0,
            },
            reports: {
                responseRate: '98%',
                csat: '4.8/5',
            },
            billing: {
                plan: 'Pro Plan',
                status: 'Active',
            }
        };
    },

    async getMyWorkspaces(userId: string) {
        return workspaceRepo.findByMemberUserId(userId);
    },

    async updateWorkspace(id: string, data: any) {
        const ws = await workspaceRepo.update(id, data);
        if (!ws) throw new AppError('Workspace không tồn tại', 404, 'NOT_FOUND');
        return ws;
    },

    async addMember(workspaceId: string, email: string, role: string) {
        const ws = await workspaceRepo.findById(workspaceId);
        if (!ws) throw new AppError('Workspace không tồn tại', 404, 'NOT_FOUND');

        const user = await userRepo.findByEmail(email);
        if (!user) throw new AppError('Người dùng chưa đăng ký tài khoản trong hệ thống', 404, 'USER_NOT_FOUND');

        const userId = user._id.toString();

        const alreadyMember = ws.members.find((m) => m.userId.toString() === userId);
        if (alreadyMember) throw new AppError('Người dùng đã là thành viên', 409, 'ALREADY_MEMBER');

        return workspaceRepo.addMember(workspaceId, { userId, role });
    },

    async removeMember(workspaceId: string, userId: string) {
        return workspaceRepo.removeMember(workspaceId, userId);
    },

    async deleteWorkspace(id: string) {
        await workspaceRepo.delete(id);
    },

    async getMembers(workspaceId: string) {
        return workspaceRepo.getMembers(workspaceId);
    },

    // ── Tag registry CRUD ──

    async getTags(workspaceId: string) {
        return workspaceRepo.getTags(workspaceId);
    },

    async addTag(workspaceId: string, tag: string) {
        if (!tag || tag.trim().length === 0) throw new AppError('Tag không được rỗng', 400, 'VALIDATION_ERROR');
        return workspaceRepo.addTag(workspaceId, tag.trim().toLowerCase());
    },

    async removeTag(workspaceId: string, tag: string) {
        return workspaceRepo.removeTag(workspaceId, tag);
    },

    async updateTag(workspaceId: string, oldTag: string, newTag: string) {
        if (!newTag || newTag.trim().length === 0) throw new AppError('Tag mới không được rỗng', 400, 'VALIDATION_ERROR');
        return workspaceRepo.updateTag(workspaceId, oldTag, newTag.trim().toLowerCase());
    },

    // ── Label registry CRUD (colored tags, Zalo-style) ──

    async getLabels(workspaceId: string) {
        return workspaceRepo.getLabels(workspaceId);
    },

    async addLabel(workspaceId: string, name: string, color: string) {
        if (!name || name.trim().length === 0) throw new AppError('Tên nhãn không được rỗng', 400, 'VALIDATION_ERROR');
        if (!color || color.trim().length === 0) throw new AppError('Màu nhãn không được rỗng', 400, 'VALIDATION_ERROR');
        return workspaceRepo.addLabel(workspaceId, { name: name.trim(), color: color.trim() });
    },

    async removeLabel(workspaceId: string, name: string) {
        return workspaceRepo.removeLabel(workspaceId, name);
    },

    async updateLabel(workspaceId: string, oldName: string, newName: string, color: string) {
        if (!newName || newName.trim().length === 0) throw new AppError('Tên nhãn mới không được rỗng', 400, 'VALIDATION_ERROR');
        return workspaceRepo.updateLabel(workspaceId, oldName, { name: newName.trim(), color: color.trim() });
    },

    async getAgentPerformance(workspaceId: string) {
        const workspace = await workspaceRepo.findById(workspaceId);
        if (!workspace || !workspace.isActive) throw new AppError('Workspace không tồn tại', 404, 'NOT_FOUND');

        const memberIds = workspace.members.map((m) => m.userId.toString());

        const [convStats, msgCounts, users] = await Promise.all([
            conversationRepo.getAgentConversationStats(workspaceId),
            conversationRepo.getAgentMessageCounts(workspaceId),
            userRepo.findByIds(memberIds),
        ]);

        // Build user info map
        const userMap = new Map<string, { name: string; email: string }>();
        for (const u of users) {
            userMap.set(u._id.toString(), { name: u.name || 'Unknown', email: u.email || '' });
        }

        // Build message count map (sender.id is stored as string)
        const msgMap = new Map<string, number>();
        for (const m of msgCounts) {
            msgMap.set(String(m._id), m.messagesSent);
        }

        // Build conv stats map
        const statsMap = new Map<string, {
            total: number; open: number; closed: number; pending: number;
            lastActivity: Date | null;
        }>();
        for (const s of convStats) {
            statsMap.set(String(s._id), s);
        }

        // Merge with workspace members
        const results = workspace.members.map((member) => {
            const memberId = member.userId.toString();
            const stat = statsMap.get(memberId);
            const userInfo = userMap.get(memberId);

            const total = stat?.total ?? 0;
            const open = stat?.open ?? 0;
            const closed = stat?.closed ?? 0;
            const pending = stat?.pending ?? 0;
            const messagesSent = msgMap.get(memberId) ?? 0;
            const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;

            return {
                userId: memberId,
                name: userInfo?.name ?? 'Unknown',
                email: userInfo?.email ?? '',
                role: member.role,
                joinedAt: member.joinedAt,
                stats: {
                    total,
                    open,
                    closed,
                    pending,
                    closeRate,
                    messagesSent,
                    lastActivity: stat?.lastActivity ?? null,
                },
            };
        });

        // Sort by total conversations descending
        results.sort((a, b) => b.stats.total - a.stats.total);

        return results;
    },
};

export const widgetService = {
    async createWidget(workspaceId: string, data: any) {
        return widgetRepo.create({ ...data, workspaceId: workspaceId as any });
    },

    async getWidget(id: string) {
        const w = await widgetRepo.findById(id);
        if (!w || !w.isActive) throw new AppError('Widget không tồn tại', 404, 'NOT_FOUND');
        return w;
    },

    async getWidgetsByWorkspace(workspaceId: string) {
        return widgetRepo.findByWorkspace(workspaceId);
    },

    async updateWidget(id: string, data: any) {
        const w = await widgetRepo.update(id, data);
        if (!w) throw new AppError('Widget không tồn tại', 404, 'NOT_FOUND');
        return w;
    },

    async deleteWidget(id: string) {
        await widgetRepo.delete(id);
    },

    /**
     * Check if a domain is allowed to load the widget.
     * Returns true if allowed, false if blocked.
     */
    async checkDomain(widgetId: string, origin: string): Promise<boolean> {
        const widget = await widgetRepo.findById(widgetId);
        if (!widget || !widget.isActive) return false;

        const { mode, domains } = widget.domainRules;
        // Normalise: extract hostname from origin
        let hostname: string;
        try {
            hostname = new URL(origin).hostname;
        } catch {
            hostname = origin; // fallback if just a hostname string
        }

        const matches = domains.some((d) => {
            // Support wildcard: *.example.com
            if (d.startsWith('*.')) {
                const suffix = d.slice(2);
                return hostname === suffix || hostname.endsWith('.' + suffix);
            }
            return hostname === d;
        });

        if (mode === 'allowlist') return matches;
        if (mode === 'blocklist') return !matches;
        return true;
    },

    /**
     * Public endpoint to load widget config (no auth needed).
     * Used by the embedded widget script.
     */
    async getPublicConfig(widgetId: string) {
        const widget = await widgetRepo.findById(widgetId);
        if (!widget || !widget.isActive) throw new AppError('Widget không tồn tại', 404, 'NOT_FOUND');

        // Populate workspace for business hours
        const workspace = await workspaceRepo.findById(widget.workspaceId.toString());
        const bh = workspace?.settings?.businessHours;
        const tz = workspace?.settings?.timezone || 'Asia/Ho_Chi_Minh';

        return {
            id: widget._id,
            name: widget.name,
            config: widget.config,
            domainRules: widget.domainRules,
            businessHours: {
                enabled: bh?.enabled || false,
                timezone: tz,
                schedule: bh?.schedule || [],
                holidays: bh?.holidays || [],
            },
        };
    },
};

export const offlineMessageService = {
    async createOfflineMessage(widgetId: string, data: { name: string; email: string; message: string; visitorId: string }) {
        const widget = await widgetRepo.findById(widgetId);
        if (!widget || !widget.isActive) throw new AppError('Widget không tồn tại', 404, 'NOT_FOUND');

        return offlineMessageRepo.create({
            widgetId: widget._id as any,
            workspaceId: widget.workspaceId,
            visitorId: data.visitorId,
            name: data.name,
            email: data.email,
            message: data.message,
            status: 'pending',
        });
    },

    async getOfflineMessages(workspaceId: string, options?: { status?: string; page?: number; limit?: number }) {
        return offlineMessageRepo.findByWorkspace(workspaceId, options);
    },

    async markAsRead(id: string) {
        const msg = await offlineMessageRepo.updateStatus(id, 'read');
        if (!msg) throw new AppError('Tin nhắn không tồn tại', 404, 'NOT_FOUND');
        return msg;
    },

    async markAsReplied(id: string) {
        const msg = await offlineMessageRepo.updateStatus(id, 'replied');
        if (!msg) throw new AppError('Tin nhắn không tồn tại', 404, 'NOT_FOUND');
        return msg;
    },

    async countPending(workspaceId: string) {
        return offlineMessageRepo.countPending(workspaceId);
    },
};
