import prisma from '../../../infra/prisma';
import type { Visitor } from '@prisma/client';

export const visitorRepo = {
    async findOrCreate(
        visitorId: string,
        widgetId: string,
        workspaceId: string,
        info: { name?: string; email?: string; phone?: string; avatar?: string; attributes?: Record<string, any>; [key: string]: any }
    ): Promise<{ visitor: Visitor; isNew: boolean }> {
        let visitor = await prisma.visitor.findUnique({
            where: { visitorId_widgetId: { visitorId, widgetId } },
        });

        if (visitor) {
            const updates: any = { lastSeenAt: new Date() };
            if (info.name) updates.name = info.name;
            if (info.email) updates.email = info.email;
            if (info.phone) updates.phone = info.phone;

            // Merge attributes
            const attrs = (visitor.attributes as Record<string, any>) || {};
            if (info.avatar) attrs.avatar = info.avatar;
            if (info.attributes) Object.assign(attrs, info.attributes);
            updates.attributes = attrs;

            visitor = await prisma.visitor.update({
                where: { id: visitor.id },
                data: updates,
            });
            return { visitor, isNew: false };
        }

        // Create new
        visitor = await prisma.visitor.create({
            data: {
                visitorId,
                widgetId,
                workspaceId,
                name: info.name || '',
                email: info.email || '',
                phone: info.phone || '',
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                totalConversations: 0,
                attributes: {},
            },
        });
        return { visitor, isNew: true };
    },

    async incrementConversations(visitorId: string, widgetId: string): Promise<void> {
        await prisma.visitor.updateMany({
            where: { visitorId, widgetId },
            data: {
                totalConversations: { increment: 1 },
                lastSeenAt: new Date(),
            },
        });
    },

    async findByWorkspace(
        workspaceId: string,
        options?: { page?: number; limit?: number; search?: string }
    ): Promise<{ items: Visitor[]; total: number }> {
        const where: any = { workspaceId };
        if (options?.search) {
            where.OR = [
                { name: { contains: options.search } },
                { email: { contains: options.search } },
                { visitorId: { contains: options.search } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.visitor.findMany({
                where,
                orderBy: { lastSeenAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.visitor.count({ where }),
        ]);
        return { items, total };
    },

    async findOne(visitorId: string, widgetId: string): Promise<Visitor | null> {
        return prisma.visitor.findUnique({ where: { visitorId_widgetId: { visitorId, widgetId } } });
    },

    async enrichProfile(
        visitorId: string,
        widgetId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ): Promise<Visitor | null> {
        const visitor = await prisma.visitor.findUnique({
            where: { visitorId_widgetId: { visitorId, widgetId } },
        });
        if (!visitor) return null;

        const updates: any = { lastSeenAt: new Date() };
        if (data.name) updates.name = data.name;
        if (data.email) updates.email = data.email;
        if (data.phone) updates.phone = data.phone;

        if (data.attributes) {
            const attrs = (visitor.attributes as Record<string, any>) || {};
            Object.assign(attrs, data.attributes);
            updates.attributes = attrs;
        }

        return prisma.visitor.update({ where: { id: visitor.id }, data: updates });
    },

    async findOneByWorkspaceAndVisitorId(workspaceId: string, visitorId: string): Promise<Visitor | null> {
        return prisma.visitor.findFirst({ where: { workspaceId, visitorId } });
    },

    async updateByWorkspaceAndVisitorId(
        workspaceId: string,
        visitorId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ): Promise<Visitor | null> {
        const visitor = await prisma.visitor.findFirst({ where: { workspaceId, visitorId } });
        if (!visitor) return null;

        const updates: any = { lastSeenAt: new Date() };
        if (data.name !== undefined) updates.name = data.name;
        if (data.email !== undefined) updates.email = data.email;
        if (data.phone !== undefined) updates.phone = data.phone;

        if (data.attributes) {
            const attrs = (visitor.attributes as Record<string, any>) || {};
            Object.assign(attrs, data.attributes);
            updates.attributes = attrs;
        }

        return prisma.visitor.update({ where: { id: visitor.id }, data: updates });
    },
};
