import { Router } from 'express';
import { externalSessionController } from './externalSession.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';
import { PERMISSIONS } from '../../config/permissions';

const router = Router();

// All routes require auth + workspace scope
const auth = [requireAuth, scopeCheck];

// ── Session CRUD ──
router.post(
    '/:workspaceId/sessions',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_CREATE),
    externalSessionController.create
);

router.get(
    '/:workspaceId/sessions',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_VIEW),
    externalSessionController.list
);

router.get(
    '/:workspaceId/sessions/:sessionId',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_VIEW),
    externalSessionController.getOne
);

router.get(
    '/:workspaceId/sessions/:sessionId/login-state',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_VIEW),
    externalSessionController.checkLoginState
);

// ── Session lifecycle ──
router.post(
    '/:workspaceId/sessions/:sessionId/reconnect',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_CREATE),
    externalSessionController.reconnect
);

router.delete(
    '/:workspaceId/sessions/:sessionId',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_REVOKE),
    externalSessionController.revoke
);

// ── Control ──
router.post(
    '/:workspaceId/sessions/:sessionId/control/take',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_CONTROL),
    externalSessionController.takeControl
);

router.post(
    '/:workspaceId/sessions/:sessionId/control/release',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_CONTROL),
    externalSessionController.releaseControl
);

// ── Audit ──
router.get(
    '/:workspaceId/sessions/:sessionId/audit',
    ...auth,
    requirePermission(PERMISSIONS.REMOTE_SESSION_CREATE),
    externalSessionController.getAuditLog
);

export default router;
