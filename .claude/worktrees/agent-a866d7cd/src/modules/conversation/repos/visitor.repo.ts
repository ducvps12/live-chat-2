import { VisitorModel, IVisitor } from './visitor.model';

export const visitorRepo = {
    async findOrCreate(
        visitorId: string,
        widgetId: string,
        workspaceId: string,
        info: { name?: string; email?: string; phone?: string; [key: string]: any }
    ): Promise<{ visitor: IVisitor; isNew: boolean }> {
        let visitor = await VisitorModel.findOne({ visitorId, widgetId }).exec();

        if (visitor) {
            // Update lastSeenAt + merge info
            const updates: any = { lastSeenAt: new Date() };
            if (info.name) updates.name = info.name;
            if (info.email) updates.email = info.email;
            if (info.phone) updates.phone = info.phone;

            visitor = await VisitorModel.findByIdAndUpdate(visitor._id, updates, { new: true }).exec();
            return { visitor: visitor!, isNew: false };
        }

        // Create new
        visitor = await VisitorModel.create({
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
        });
        return { visitor, isNew: true };
    },

    async incrementConversations(visitorId: string, widgetId: string): Promise<void> {
        await VisitorModel.findOneAndUpdate(
            { visitorId, widgetId },
            { $inc: { totalConversations: 1 }, lastSeenAt: new Date() }
        ).exec();
    },

    async findByWorkspace(
        workspaceId: string,
        options?: { page?: number; limit?: number; search?: string }
    ): Promise<{ items: IVisitor[]; total: number }> {
        const filter: any = { workspaceId };
        if (options?.search) {
            filter.$or = [
                { name: { $regex: options.search, $options: 'i' } },
                { email: { $regex: options.search, $options: 'i' } },
                { visitorId: { $regex: options.search, $options: 'i' } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            VisitorModel.find(filter).sort({ lastSeenAt: -1 }).skip(skip).limit(limit).exec(),
            VisitorModel.countDocuments(filter).exec(),
        ]);
        return { items, total };
    },

    async findOne(visitorId: string, widgetId: string): Promise<IVisitor | null> {
        return VisitorModel.findOne({ visitorId, widgetId }).exec();
    },

    async enrichProfile(
        visitorId: string,
        widgetId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ): Promise<IVisitor | null> {
        const updates: any = { lastSeenAt: new Date() };

        // Update contact fields if provided
        if (data.name) updates.name = data.name;
        if (data.email) updates.email = data.email;
        if (data.phone) updates.phone = data.phone;

        // Merge attributes (dot-notation $set = deep merge, not replace)
        if (data.attributes) {
            for (const [key, val] of Object.entries(data.attributes)) {
                updates[`attributes.${key}`] = val;
            }
        }

        return VisitorModel.findOneAndUpdate(
            { visitorId, widgetId },
            { $set: updates },
            { new: true }
        ).exec();
    },

    async findOneByWorkspaceAndVisitorId(workspaceId: string, visitorId: string): Promise<IVisitor | null> {
        return VisitorModel.findOne({ workspaceId, visitorId }).exec();
    },

    async updateByWorkspaceAndVisitorId(
        workspaceId: string,
        visitorId: string,
        data: { name?: string; email?: string; phone?: string; attributes?: Record<string, any> }
    ): Promise<IVisitor | null> {
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.email !== undefined) updates.email = data.email;
        if (data.phone !== undefined) updates.phone = data.phone;

        if (data.attributes) {
            for (const [key, val] of Object.entries(data.attributes)) {
                updates[`attributes.${key}`] = val;
            }
        }

        if (Object.keys(updates).length > 0) {
            updates.lastSeenAt = new Date();
            return VisitorModel.findOneAndUpdate(
                { workspaceId, visitorId },
                { $set: updates },
                { new: true }
            ).exec();
        }
        return VisitorModel.findOne({ workspaceId, visitorId }).exec();
    },
};
