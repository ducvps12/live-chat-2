import { MessageModel, IMessage } from './message.model';

export const messageRepo = {
    async create(data: Partial<IMessage>): Promise<IMessage> {
        return MessageModel.create(data);
    },

    async findById(messageId: string): Promise<IMessage | null> {
        return MessageModel.findById(messageId).exec();
    },

    /**
     * Find existing message by clientMessageId (idempotency check).
     * Returns null if no clientMessageId provided or not found.
     */
    async findByClientMessageId(
        conversationId: string,
        clientMessageId: string
    ): Promise<IMessage | null> {
        if (!clientMessageId) return null;
        return MessageModel.findOne({ conversationId, clientMessageId }).exec();
    },

    async findByConversation(
        conversationId: string,
        options?: { page?: number; limit?: number; excludeInternal?: boolean }
    ): Promise<{ items: IMessage[]; total: number }> {
        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const skip = (page - 1) * limit;

        const filter: any = { conversationId };
        if (options?.excludeInternal) {
            filter.$or = [{ isInternal: { $ne: true } }, { isInternal: { $exists: false } }];
        }

        const [items, total] = await Promise.all([
            MessageModel.find(filter)
                .sort({ createdAt: -1 }) // newest first for pagination
                .skip(skip)
                .limit(limit)
                .exec(),
            MessageModel.countDocuments(filter).exec(),
        ]);
        
        // Reverse so they are in chronological order for the chat UI
        return { items: items.reverse(), total };
    },

    async getLatest(conversationId: string, limit: number = 30): Promise<IMessage[]> {
        const msgs = await MessageModel.find({ conversationId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
        return msgs.reverse(); // return in chronological order
    },

    /**
     * Get the pagination page number that contains the target message.
     */
    async getMessagePage(conversationId: string, messageId: string, limit: number = 50): Promise<number | null> {
        const targetMessage = await MessageModel.findOne({ _id: messageId, conversationId });
        if (!targetMessage) return null;

        // Count messages that are newer or equal to targetMessage (since pagination sorts by createdAt: -1)
        const count = await MessageModel.countDocuments({
            conversationId,
            createdAt: { $gte: targetMessage.createdAt }
        });

        if (count === 0) return 1;
        return Math.floor((count - 1) / limit) + 1;
    },

    /**
     * Get messages created after a timestamp (for reconnect sync).
     */
    async findSince(conversationId: string, since: Date, limit: number = 50): Promise<IMessage[]> {
        return MessageModel.find({ conversationId, createdAt: { $gt: since } })
            .sort({ createdAt: 1 })
            .limit(limit)
            .exec();
    },

    /**
     * Mark a batch of messages as delivered
     */
    async markAsDelivered(messageIds: string[]): Promise<void> {
        await MessageModel.updateMany(
            { _id: { $in: messageIds }, status: 'sent' },
            { $set: { status: 'delivered' } }
        ).exec();
    },

    /**
     * Mark messages up to a specific message ID as read for a given sender type.
     * Note: `senderTypeToMatch` is the type of the sender whose messages are being read
     * (e.g. if Visitor is reading, we mark Agent's messages as read).
     */
    async markAsReadUpTo(
        conversationId: string, 
        messageId: string, 
        senderTypeToMatch: 'visitor' | 'agent' | 'system'
    ): Promise<void> {
        const targetMessage = await MessageModel.findOne({ _id: messageId, conversationId });
        if (!targetMessage) return;

        await MessageModel.updateMany(
            {
                conversationId,
                'sender.type': senderTypeToMatch,
                createdAt: { $lte: targetMessage.createdAt },
                status: { $ne: 'read' }
            },
            { $set: { status: 'read' } }
        ).exec();
    },

    async findLatest(conversationId: string): Promise<IMessage | null> {
        return MessageModel.findOne({ conversationId }).sort({ createdAt: -1 }).exec();
    },

    /**
     * Count unread messages for a specific participant since their last read cursor.
     * @param conversationId The ID of the conversation
     * @param participantType The type of the participant checking for unread ('visitor' or 'agent')
     * @param lastReadMessageId The message ID of the last read message, or null if none ever read
     */
    async countUnreadSince(
        conversationId: string,
        participantType: 'visitor' | 'agent' | 'system',
        lastReadMessageId: string | null
    ): Promise<number> {
        const query: any = {
            conversationId,
            'sender.type': { $ne: participantType }, // Count messages sent by others
        };

        if (lastReadMessageId) {
            const lastReadMessage = await MessageModel.findOne({ _id: lastReadMessageId, conversationId });
            if (lastReadMessage) {
                query.createdAt = { $gt: lastReadMessage.createdAt };
            }
        }

        return MessageModel.countDocuments(query).exec();
    },
};
