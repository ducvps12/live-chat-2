import { campaignRepo } from './repos/campaign.repo';
import { ICampaign, CampaignStatus } from './repos/campaign.model';
import { ZaloContactModel } from '../zalo/repos/zalo-contact.model';
import { zaloService } from '../zalo/zalo.service';
import { getZaloGroupMembers } from '../../infra/zaloService';
import { zaloAccountRepo } from '../zalo/repos/zalo-account.repo';
import { isZaloSessionConnected } from '../../infra/zaloService';
import mongoose from 'mongoose';

interface CampaignProgress {
    campaignId: string;
    status: CampaignStatus;
    sent: number;
    failed: number;
    total: number;
    currentRecipient?: string;
    estimatedRemainingMs?: number;
}

class CampaignService {
    // In-memory tracking for running campaigns
    private activeJobs = new Map<string, {
        paused: boolean;
        abortController: AbortController;
        progress: CampaignProgress;
        hourlySent: number;
        hourlyResetAt: number;
    }>();

    /**
     * Create a new campaign (draft)
     */
    async create(workspaceId: string, userId: string, data: {
        name: string;
        messages: string[];
        audience: ICampaign['audience'];
        schedule?: ICampaign['schedule'];
        antiSpam?: Partial<ICampaign['antiSpam']>;
    }): Promise<ICampaign> {
        // Validate
        if (!data.messages?.length) throw new Error('Cần ít nhất 1 tin nhắn');
        if (data.messages.length > 10) throw new Error('Tối đa 10 tin nhắn mỗi campaign');
        if (!data.name?.trim()) throw new Error('Cần đặt tên campaign');

        const campaign = await campaignRepo.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            name: data.name.trim(),
            status: 'draft',
            messages: data.messages,
            audience: data.audience,
            schedule: data.schedule || { startAt: new Date() },
            antiSpam: {
                delayBetweenMs: Math.max(data.antiSpam?.delayBetweenMs || 8000, 5000),
                maxPerHour: Math.min(Math.max(data.antiSpam?.maxPerHour || 30, 5), 100),
                randomizeDelay: data.antiSpam?.randomizeDelay !== false,
            },
            stats: { total: 0, sent: 0, failed: 0, pending: 0 },
            recipientIds: [],
            failedRecipients: [],
            currentIndex: 0,
            createdBy: new mongoose.Types.ObjectId(userId),
        });

        return campaign;
    }

    /**
     * Update a draft campaign
     */
    async update(campaignId: string, workspaceId: string, data: Partial<{
        name: string;
        messages: string[];
        audience: ICampaign['audience'];
        schedule: ICampaign['schedule'];
        antiSpam: Partial<ICampaign['antiSpam']>;
    }>): Promise<ICampaign | null> {
        const campaign = await campaignRepo.findById(campaignId);
        if (!campaign) throw new Error('Campaign không tồn tại');
        if (campaign.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        if (campaign.status !== 'draft') throw new Error('Chỉ có thể chỉnh sửa campaign ở trạng thái nháp');

        const updateData: any = {};
        if (data.name) updateData.name = data.name.trim();
        if (data.messages) updateData.messages = data.messages;
        if (data.audience) updateData.audience = data.audience;
        if (data.schedule) updateData.schedule = data.schedule;
        if (data.antiSpam) {
            updateData.antiSpam = {
                delayBetweenMs: Math.max(data.antiSpam.delayBetweenMs || campaign.antiSpam.delayBetweenMs, 5000),
                maxPerHour: Math.min(Math.max(data.antiSpam.maxPerHour || campaign.antiSpam.maxPerHour, 5), 100),
                randomizeDelay: data.antiSpam.randomizeDelay ?? campaign.antiSpam.randomizeDelay,
            };
        }

        return campaignRepo.update(campaignId, updateData);
    }

    /**
     * Resolve audience → list of Zalo threadIds
     */
    private async resolveAudience(workspaceId: string, audience: ICampaign['audience']): Promise<string[]> {
        if (audience.type === 'manual' && audience.manualIds?.length) {
            return audience.manualIds;
        }

        // Group audience: fetch members directly from Zalo session
        if (audience.type === 'group' && audience.groupId) {
            const accounts = await zaloAccountRepo.findByWorkspaceId(workspaceId);
            const connected = accounts.find(a => isZaloSessionConnected((a._id as unknown as string).toString()));
            if (!connected) throw new Error('Tài khoản Zalo chưa kết nối');
            const sessionId = (connected._id as unknown as string).toString();
            const members = await getZaloGroupMembers(sessionId, audience.groupId);
            return members.map(m => m.userId);
        }

        // Build filter query
        const filter: any = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };

        if (audience.type === 'filter' && audience.filters) {
            if (audience.filters.source) {
                filter.source = audience.filters.source;
            }
            if (audience.filters.minMessages) {
                filter.totalMessages = { $gte: audience.filters.minMessages };
            }
            if (audience.filters.lastActiveWithinDays) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - audience.filters.lastActiveWithinDays);
                filter.lastMessageAt = { $gte: cutoff };
            }
        }

        // Fetch contacts
        const contacts = await ZaloContactModel
            .find(filter)
            .select('zaloUserId')
            .lean();

        return contacts.map(c => c.zaloUserId);
    }

    /**
     * Start a campaign execution
     */
    async start(campaignId: string, workspaceId: string): Promise<{ total: number }> {
        const campaign = await campaignRepo.findById(campaignId);
        if (!campaign) throw new Error('Campaign không tồn tại');
        if (campaign.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        if (!['draft', 'paused'].includes(campaign.status)) {
            throw new Error(`Không thể bắt đầu campaign ở trạng thái: ${campaign.status}`);
        }

        // Resolve audience if starting fresh (not resuming)
        let recipientIds = campaign.recipientIds || [];
        let startIndex = campaign.currentIndex || 0;

        if (campaign.status === 'draft' || recipientIds.length === 0) {
            recipientIds = await this.resolveAudience(workspaceId, campaign.audience);
            if (recipientIds.length === 0) throw new Error('Không tìm thấy người nhận nào phù hợp');
            await campaignRepo.setRecipientIds(campaignId, recipientIds, recipientIds.length);
            startIndex = 0;
        }

        await campaignRepo.setStatus(campaignId, 'running');

        // Start execution in background
        this.executeInBackground(campaignId, workspaceId, campaign.messages, recipientIds, startIndex, campaign.antiSpam);

        return { total: recipientIds.length };
    }

    /**
     * Pause a running campaign
     */
    async pause(campaignId: string, workspaceId: string): Promise<void> {
        const campaign = await campaignRepo.findById(campaignId);
        if (!campaign) throw new Error('Campaign không tồn tại');
        if (campaign.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        if (campaign.status !== 'running') throw new Error('Campaign không đang chạy');

        const job = this.activeJobs.get(campaignId);
        if (job) {
            job.paused = true;
        }
        await campaignRepo.setStatus(campaignId, 'paused');
    }

    /**
     * Resume a paused campaign
     */
    async resume(campaignId: string, workspaceId: string): Promise<void> {
        return this.start(campaignId, workspaceId).then(() => {});
    }

    /**
     * Cancel/delete a campaign
     */
    async cancel(campaignId: string, workspaceId: string): Promise<void> {
        const campaign = await campaignRepo.findById(campaignId);
        if (!campaign) throw new Error('Campaign không tồn tại');
        if (campaign.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');

        // Abort if running
        const job = this.activeJobs.get(campaignId);
        if (job) {
            job.abortController.abort();
            this.activeJobs.delete(campaignId);
        }

        if (['draft', 'completed', 'failed'].includes(campaign.status)) {
            await campaignRepo.delete(campaignId);
        } else {
            await campaignRepo.setStatus(campaignId, 'failed');
        }
    }

    /**
     * Get live progress
     */
    getProgress(campaignId: string): CampaignProgress | null {
        const job = this.activeJobs.get(campaignId);
        return job?.progress || null;
    }

    /**
     * List campaigns
     */
    async list(workspaceId: string, options?: { status?: CampaignStatus; page?: number; limit?: number }) {
        return campaignRepo.findByWorkspace(workspaceId, options);
    }

    /**
     * Get single campaign
     */
    async getById(campaignId: string, workspaceId: string): Promise<ICampaign & { liveProgress?: CampaignProgress }> {
        const campaign = await campaignRepo.findById(campaignId);
        if (!campaign) throw new Error('Campaign không tồn tại');
        if (campaign.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');

        const liveProgress = this.getProgress(campaignId);
        return { ...campaign, liveProgress } as any;
    }

    /**
     * Get workspace-level campaign stats
     */
    async getStats(workspaceId: string) {
        return campaignRepo.getWorkspaceStats(workspaceId);
    }

    // ═══════════════════════════════════
    // EXECUTION ENGINE
    // ═══════════════════════════════════

    private executeInBackground(
        campaignId: string,
        workspaceId: string,
        messages: string[],
        recipientIds: string[],
        startIndex: number,
        antiSpam: ICampaign['antiSpam'],
    ) {
        const abortController = new AbortController();
        const jobState = {
            paused: false,
            abortController,
            progress: {
                campaignId,
                status: 'running' as CampaignStatus,
                sent: 0,
                failed: 0,
                total: recipientIds.length,
            },
            hourlySent: 0,
            hourlyResetAt: Date.now() + 3600_000,
        };

        this.activeJobs.set(campaignId, jobState);

        // Fire-and-forget async execution
        this.runCampaignLoop(campaignId, workspaceId, messages, recipientIds, startIndex, antiSpam, jobState)
            .catch(err => {
                console.error(`[CampaignService] Fatal error in campaign ${campaignId}:`, err);
                campaignRepo.setStatus(campaignId, 'failed');
                jobState.progress.status = 'failed';
            })
            .finally(() => {
                // Cleanup after 5 minutes (keep progress for polling)
                setTimeout(() => this.activeJobs.delete(campaignId), 300_000);
            });
    }

    private async runCampaignLoop(
        campaignId: string,
        workspaceId: string,
        messages: string[],
        recipientIds: string[],
        startIndex: number,
        antiSpam: ICampaign['antiSpam'],
        jobState: ReturnType<typeof this.activeJobs.get> & {},
    ) {
        let sentCount = startIndex; // Already processed before pause
        let failedCount = 0;

        // Reload stats from DB to get accurate counts after resume
        const existing = await campaignRepo.findById(campaignId);
        if (existing) {
            jobState.progress.sent = existing.stats.sent;
            failedCount = existing.stats.failed;
            jobState.progress.failed = failedCount;
        }

        for (let i = startIndex; i < recipientIds.length; i++) {
            // Check abort/pause
            if (jobState.abortController.signal.aborted) break;
            if (jobState.paused) {
                // Save progress before pausing
                await campaignRepo.updateStats(campaignId, {
                    sent: jobState.progress.sent,
                    failed: failedCount,
                    pending: recipientIds.length - i,
                }, i);
                jobState.progress.status = 'paused';
                return;
            }

            // Hourly rate limit
            if (Date.now() >= jobState.hourlyResetAt) {
                jobState.hourlySent = 0;
                jobState.hourlyResetAt = Date.now() + 3600_000;
            }
            if (jobState.hourlySent >= antiSpam.maxPerHour) {
                const waitMs = jobState.hourlyResetAt - Date.now();
                console.log(`[CampaignService] ${campaignId}: Hourly limit (${antiSpam.maxPerHour}) reached, waiting ${Math.round(waitMs / 60000)}min...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                jobState.hourlySent = 0;
                jobState.hourlyResetAt = Date.now() + 3600_000;
            }

            // Send window check (business hours)
            const now = new Date();
            const hour = now.getHours();
            const campaign = await campaignRepo.findById(campaignId);
            if (campaign?.schedule?.sendWindow) {
                const { startHour, endHour } = campaign.schedule.sendWindow;
                if (hour < startHour || hour >= endHour) {
                    // Wait until start hour
                    const nextStart = new Date();
                    if (hour >= endHour) nextStart.setDate(nextStart.getDate() + 1);
                    nextStart.setHours(startHour, 0, 0, 0);
                    const waitMs = nextStart.getTime() - Date.now();
                    console.log(`[CampaignService] ${campaignId}: Outside send window, waiting until ${startHour}:00...`);
                    await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 60000))); // Check every minute
                    i--; // Retry this index
                    continue;
                }
            }

            const threadId = recipientIds[i];
            jobState.progress.currentRecipient = threadId;

            try {
                // Send each message to this recipient
                for (let j = 0; j < messages.length; j++) {
                    if (j > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between messages
                    }
                    await zaloService.sendMessage(workspaceId, threadId, messages[j]);
                }

                jobState.progress.sent++;
                jobState.hourlySent++;
                sentCount++;

                console.log(`[CampaignService] ${campaignId}: Sent to ${threadId} (${i + 1}/${recipientIds.length})`);
            } catch (err: any) {
                failedCount++;
                jobState.progress.failed = failedCount;
                await campaignRepo.pushFailedRecipient(campaignId, threadId, err.message || 'Unknown error');
                console.error(`[CampaignService] ${campaignId}: Failed for ${threadId}:`, err.message);
            }

            // Update DB every 5 recipients
            if ((i + 1) % 5 === 0 || i === recipientIds.length - 1) {
                await campaignRepo.updateStats(campaignId, {
                    sent: jobState.progress.sent,
                    failed: failedCount,
                    pending: recipientIds.length - (i + 1),
                }, i + 1);
            }

            // Estimated remaining time
            const avgTimePerRecipient = antiSpam.delayBetweenMs + (messages.length * 1000);
            jobState.progress.estimatedRemainingMs = (recipientIds.length - (i + 1)) * avgTimePerRecipient;

            // Anti-spam delay (skip after last)
            if (i < recipientIds.length - 1) {
                let delay = antiSpam.delayBetweenMs;
                if (antiSpam.randomizeDelay) {
                    // ±30% jitter
                    const jitter = delay * 0.3;
                    delay = delay - jitter + Math.random() * jitter * 2;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Campaign complete
        await campaignRepo.updateStats(campaignId, {
            sent: jobState.progress.sent,
            failed: failedCount,
            pending: 0,
        }, recipientIds.length);
        await campaignRepo.setStatus(campaignId, 'completed');
        jobState.progress.status = 'completed';
        console.log(`[CampaignService] ${campaignId}: COMPLETED — ${jobState.progress.sent} sent, ${failedCount} failed`);
    }
}

export const campaignService = new CampaignService();
