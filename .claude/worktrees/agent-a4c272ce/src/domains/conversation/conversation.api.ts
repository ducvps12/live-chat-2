import { conversationService } from '../../services/conversation.service';

export const conversationApi = {
    getVisitor: conversationService.getVisitor,
    updateVisitor: conversationService.updateVisitor,
    getUnreadCount: conversationService.getUnreadCount,
};
