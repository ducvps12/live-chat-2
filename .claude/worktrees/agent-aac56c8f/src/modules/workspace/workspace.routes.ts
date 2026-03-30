import { Router } from 'express';
import { workspaceController, widgetController, offlineMessageController } from './workspace.controller';
import { workspaceValidate, widgetValidate, offlineMessageValidate } from './workspace.validate';
import { validateRequest } from '../../middlewares/validateRequest';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { zaloRoutes } from '../zalo/zalo.routes';
import { scopeCheck } from '../../middlewares/scopeCheck';
import { PERMISSIONS } from '../../config/permissions';

const router = Router();

// ────────── Workspace CRUD ──────────
router.post(
    '/',
    requireAuth,
    requirePermission(PERMISSIONS.WORKSPACE_CREATE),
    validateRequest(workspaceValidate.create),
    workspaceController.create
);

router.get(
    '/',
    requireAuth,
    workspaceController.getMyWorkspaces
);

router.get(
    '/:workspaceId',
    requireAuth,
    scopeCheck,
    workspaceController.getOne
);

router.get(
    '/:workspaceId/dashboard',
    requireAuth,
    scopeCheck,
    workspaceController.getDashboardStats
);

router.patch(
    '/:workspaceId',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
    validateRequest(workspaceValidate.update),
    workspaceController.update
);

router.delete(
    '/:workspaceId',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_DELETE),
    workspaceController.delete
);

// ────────── Workspace Members ──────────
router.get(
    '/:workspaceId/members',
    requireAuth,
    scopeCheck,
    workspaceController.getMembers
);

router.post(
    '/:workspaceId/members',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_MANAGE_MEMBERS),
    validateRequest(workspaceValidate.addMember),
    workspaceController.addMember
);

router.delete(
    '/:workspaceId/members/:userId',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_MANAGE_MEMBERS),
    workspaceController.removeMember
);

// ────────── Workspace Tags ──────────
router.get(
    '/:workspaceId/tags',
    requireAuth,
    scopeCheck,
    workspaceController.getTags
);

router.post(
    '/:workspaceId/tags',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
    workspaceController.addTag
);

router.delete(
    '/:workspaceId/tags',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
    workspaceController.removeTag
);

router.patch(
    '/:workspaceId/tags',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
    workspaceController.updateTag
);
// ────────── Widget CRUD (under workspace scope) ──────────
router.post(
    '/:workspaceId/widgets',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WIDGET_CREATE),
    validateRequest(widgetValidate.create),
    widgetController.create
);

router.get(
    '/:workspaceId/widgets',
    requireAuth,
    scopeCheck,
    widgetController.getByWorkspace
);

router.get(
    '/:workspaceId/widgets/:widgetId',
    requireAuth,
    scopeCheck,
    widgetController.getOne
);

router.patch(
    '/:workspaceId/widgets/:widgetId',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WIDGET_UPDATE),
    validateRequest(widgetValidate.update),
    widgetController.update
);

router.delete(
    '/:workspaceId/widgets/:widgetId',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WIDGET_DELETE),
    widgetController.delete
);

// ────────── Public Widget endpoints (no auth) ──────────
router.get('/public/widgets/:widgetId/config', widgetController.getPublicConfig);
router.get('/public/widgets/:widgetId/check-domain', widgetController.checkDomain);
router.post(
    '/public/widgets/:widgetId/offline-messages',
    validateRequest(offlineMessageValidate.create),
    offlineMessageController.create
);

// ────────── Offline Messages (authenticated, under workspace scope) ──────────
router.get(
    '/:workspaceId/offline-messages',
    requireAuth,
    scopeCheck,
    offlineMessageController.getByWorkspace
);

router.get(
    '/:workspaceId/offline-messages/count',
    requireAuth,
    scopeCheck,
    offlineMessageController.countPending
);

router.patch(
    '/:workspaceId/offline-messages/:messageId/read',
    requireAuth,
    scopeCheck,
    offlineMessageController.markAsRead
);

router.patch(
    '/:workspaceId/offline-messages/:messageId/replied',
    requireAuth,
    scopeCheck,
    offlineMessageController.markAsReplied
);

// ────────── Agent Performance ──────────
router.get(
    '/:workspaceId/agent-performance',
    requireAuth,
    scopeCheck,
    workspaceController.getAgentPerformance
);

// Mount sub-routers
router.use('/:workspaceId/zalo', zaloRoutes); // Tích hợp API Zalo

// ────────── Presence ──────────
router.get(
    '/:workspaceId/presence',
    requireAuth,
    scopeCheck,
    workspaceController.getPresence
);

router.get(
    '/:workspaceId/presence/visitor/:visitorId',
    requireAuth,
    scopeCheck,
    workspaceController.getVisitorPresence
);

export default router;
