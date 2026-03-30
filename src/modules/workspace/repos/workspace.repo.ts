import prisma from '../../../infra/prisma';
import type { Workspace, WorkspaceMember } from '@prisma/client';

type WorkspaceWithMembers = Workspace & { members: WorkspaceMember[] };

export const workspaceRepo = {
    async create(data: {
        name: string;
        slug: string;
        ownerId: string;
        plan?: string;
        logoUrl?: string;
        members?: Array<{ userId: string; role: string; joinedAt?: Date }>;
    }): Promise<Workspace> {
        const { members, ...workspaceData } = data;
        return prisma.workspace.create({
            data: {
                ...workspaceData,
                ...(members && members.length > 0
                    ? { members: { create: members } }
                    : {}),
            },
        });
    },

    async findById(id: string): Promise<WorkspaceWithMembers | null> {
        return prisma.workspace.findUnique({
            where: { id },
            include: { members: true },
        });
    },

    async findBySlug(slug: string): Promise<Workspace | null> {
        return prisma.workspace.findUnique({ where: { slug } });
    },

    async findByMemberUserId(userId: string): Promise<WorkspaceWithMembers[]> {
        return prisma.workspace.findMany({
            where: {
                isActive: true,
                members: { some: { userId } },
            },
            include: { members: true },
        });
    },

    async update(id: string, data: Partial<Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workspace | null> {
        return prisma.workspace.update({ where: { id }, data });
    },

    async addMember(workspaceId: string, member: { userId: string; role: string }): Promise<WorkspaceWithMembers | null> {
        await prisma.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId, userId: member.userId } },
            create: { workspaceId, userId: member.userId, role: member.role, joinedAt: new Date() },
            update: { role: member.role },
        });
        return prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: true } });
    },

    async removeMember(workspaceId: string, userId: string): Promise<WorkspaceWithMembers | null> {
        await prisma.workspaceMember.deleteMany({ where: { workspaceId, userId } });
        return prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: true } });
    },

    async delete(id: string): Promise<void> {
        await prisma.workspace.update({ where: { id }, data: { isActive: false } });
    },

    async getMembers(workspaceId: string) {
        return prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
            },
        });
    },

    // ── Tag registry CRUD ──

    async getTags(workspaceId: string): Promise<string[]> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { tags: true } });
        return (ws?.tags as string[]) || [];
    },

    async addTag(workspaceId: string, tag: string): Promise<string[]> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { tags: true } });
        const tags = (ws?.tags as string[]) || [];
        if (!tags.includes(tag)) tags.push(tag);
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { tags } });
        return (updated.tags as string[]) || [];
    },

    async removeTag(workspaceId: string, tag: string): Promise<string[]> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { tags: true } });
        const tags = ((ws?.tags as string[]) || []).filter((t: string) => t !== tag);
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { tags } });
        return (updated.tags as string[]) || [];
    },

    async updateTag(workspaceId: string, oldTag: string, newTag: string): Promise<string[]> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { tags: true } });
        let tags = ((ws?.tags as string[]) || []).filter((t: string) => t !== oldTag);
        if (!tags.includes(newTag)) tags.push(newTag);
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { tags } });
        return (updated.tags as string[]) || [];
    },

    // ── Label registry CRUD (colored tags, Zalo-style) ──

    async getLabels(workspaceId: string): Promise<Array<{ name: string; color: string }>> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { labels: true } });
        return (ws?.labels as Array<{ name: string; color: string }>) || [];
    },

    async addLabel(workspaceId: string, label: { name: string; color: string }): Promise<Array<{ name: string; color: string }>> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { labels: true } });
        const labels = (ws?.labels as Array<{ name: string; color: string }>) || [];
        labels.push(label);
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { labels } });
        return (updated.labels as Array<{ name: string; color: string }>) || [];
    },

    async removeLabel(workspaceId: string, labelName: string): Promise<Array<{ name: string; color: string }>> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { labels: true } });
        const labels = ((ws?.labels as Array<{ name: string; color: string }>) || []).filter(l => l.name !== labelName);
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { labels } });
        return (updated.labels as Array<{ name: string; color: string }>) || [];
    },

    async updateLabel(workspaceId: string, oldName: string, newLabel: { name: string; color: string }): Promise<Array<{ name: string; color: string }>> {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { labels: true } });
        const labels = ((ws?.labels as Array<{ name: string; color: string }>) || []).map(l =>
            l.name === oldName ? newLabel : l
        );
        const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { labels } });
        return (updated.labels as Array<{ name: string; color: string }>) || [];
    },
};
