import { Router } from 'express';
import { conversationController } from './conversation.controller';
import { conversationValidate } from './conversation.validate';
import { validateRequest } from '../../middlewares/validateRequest';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

// ────────── Public endpoints (widget calls, no auth) ──────────
router.post(
    '/public/find-or-create',
    validateRequest(conversationValidate.findOrCreate),
    conversationController.findOrCreate
);

router.get(
    '/public/visitor/:visitorId/widget/:widgetId',
    conversationController.getByVisitor
);

router.get(
    '/public/:conversationId/messages',
    conversationController.getMessages
);

router.post(
    '/public/:conversationId/messages',
    validateRequest(conversationValidate.sendMessage),
    conversationController.sendMessage
);

router.patch(
    '/public/:conversationId/tracking',
    conversationController.updateTracking
);

router.patch(
    '/public/visitor/enrich',
    conversationController.enrichVisitor
);

router.get(
    '/public/:conversationId/sync',
    conversationController.syncMessages
);

// ────────── Authenticated endpoints (agent dashboard) ──────────
router.get(
    '/workspace/:workspaceId',
    requireAuth,
    scopeCheck,
    conversationController.getByWorkspace
);

router.get(
    '/workspace/:workspaceId/domains',
    requireAuth,
    scopeCheck,
    conversationController.getDomainsByWorkspace
);

router.get(
    '/workspace/:workspaceId/unread-count',
    requireAuth,
    scopeCheck,
    conversationController.getUnreadCount
);

router.delete(
    '/workspace/:workspaceId/reset-messages',
    requireAuth,
    scopeCheck,
    conversationController.resetMessages
);

// ────────── Visitors (must be before generic /:conversationId) ──────────
router.get(
    '/workspace/:workspaceId/visitors',
    requireAuth,
    scopeCheck,
    conversationController.getVisitors
);

router.get(
    '/workspace/:workspaceId/visitors/export',
    requireAuth,
    scopeCheck,
    conversationController.exportVisitors
);

router.get(
    '/workspace/:workspaceId/visitors/:visitorId',
    requireAuth,
    scopeCheck,
    conversationController.getVisitor
);

router.patch(
    '/workspace/:workspaceId/visitors/:visitorId',
    requireAuth,
    scopeCheck,
    conversationController.updateVisitor
);

// ────────── SLA (must be before generic /:conversationId) ──────────
router.get(
    '/workspace/:workspaceId/sla/check',
    requireAuth,
    scopeCheck,
    conversationController.checkSLA
);

// ────────── Conversation-specific routes ──────────
router.get(
    '/workspace/:workspaceId/:conversationId',
    requireAuth,
    scopeCheck,
    conversationController.getOne
);

router.get(
    '/workspace/:workspaceId/:conversationId/messages',
    requireAuth,
    scopeCheck,
    conversationController.getConversationMessages
);

router.post(
    '/workspace/:workspaceId/:conversationId/messages',
    requireAuth,
    scopeCheck,
    validateRequest(conversationValidate.agentSendMessage),
    conversationController.agentSendMessage
);

router.patch(
    '/workspace/:workspaceId/:conversationId/close',
    requireAuth,
    scopeCheck,
    conversationController.closeConversation
);

router.patch(
    '/workspace/:workspaceId/:conversationId/reopen',
    requireAuth,
    scopeCheck,
    conversationController.reopenConversation
);

router.patch(
    '/workspace/:workspaceId/:conversationId/pending',
    requireAuth,
    scopeCheck,
    conversationController.setPending
);

router.patch(
    '/workspace/:workspaceId/:conversationId/assign',
    requireAuth,
    scopeCheck,
    conversationController.assignToMe
);

router.patch(
    '/workspace/:workspaceId/:conversationId/unassign',
    requireAuth,
    scopeCheck,
    conversationController.unassign
);

router.patch(
    '/workspace/:workspaceId/:conversationId/assign-agent',
    requireAuth,
    scopeCheck,
    conversationController.assignToAgent
);

router.patch(
    '/workspace/:workspaceId/:conversationId/transfer',
    requireAuth,
    scopeCheck,
    conversationController.transfer
);

router.patch(
    '/workspace/:workspaceId/:conversationId/read',
    requireAuth,
    scopeCheck,
    conversationController.markRead
);

router.patch(
    '/workspace/:workspaceId/:conversationId/priority',
    requireAuth,
    scopeCheck,
    conversationController.setPriority
);

router.get(
    '/workspace/:workspaceId/:conversationId/messages/:messageId/context',
    requireAuth,
    scopeCheck,
    conversationController.getMessageContext
);

router.get(
    '/workspace/:workspaceId/:conversationId/receipts',
    requireAuth,
    scopeCheck,
    conversationController.getReceipts
);

router.patch(
    '/workspace/:workspaceId/:conversationId/messages/:messageId',
    requireAuth,
    scopeCheck,
    validateRequest(conversationValidate.editMessage),
    conversationController.editMessage
);

router.delete(
    '/workspace/:workspaceId/:conversationId/messages/:messageId',
    requireAuth,
    scopeCheck,
    conversationController.recallMessage
);
// ────────── Tags on conversation ──────────
router.post(
    '/workspace/:workspaceId/:conversationId/tags',
    requireAuth,
    scopeCheck,
    conversationController.addTag
);

router.delete(
    '/workspace/:workspaceId/:conversationId/tags',
    requireAuth,
    scopeCheck,
    conversationController.removeConvTag
);

// ────────── Internal notes ──────────
router.post(
    '/workspace/:workspaceId/:conversationId/notes',
    requireAuth,
    scopeCheck,
    validateRequest(conversationValidate.addNote),
    conversationController.addNote
);

export default router;
