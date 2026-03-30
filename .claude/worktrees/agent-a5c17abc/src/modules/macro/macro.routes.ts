import { Router } from 'express';
import { macroController } from './macro.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';
import { requirePermission } from '../../middlewares/permission.middleware';
import { PERMISSIONS } from '../../config/permissions';

const router = Router();

// ────────── Get all macros for agent (personal + team) ──────────
router.get(
    '/workspace/:workspaceId',
    requireAuth,
    scopeCheck,
    macroController.getAll
);

// ────────── Get only team macros ──────────
router.get(
    '/workspace/:workspaceId/team',
    requireAuth,
    scopeCheck,
    macroController.getTeam
);

// ────────── Create personal macro ──────────
router.post(
    '/workspace/:workspaceId/personal',
    requireAuth,
    scopeCheck,
    macroController.createPersonal
);

// ────────── Create team macro (manager/admin) ──────────
router.post(
    '/workspace/:workspaceId/team',
    requireAuth,
    scopeCheck,
    requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
    macroController.createTeam
);

// ────────── Update macro ──────────
router.patch(
    '/workspace/:workspaceId/:macroId',
    requireAuth,
    scopeCheck,
    macroController.update
);

// ────────── Delete macro ──────────
router.delete(
    '/workspace/:workspaceId/:macroId',
    requireAuth,
    scopeCheck,
    macroController.remove
);

export default router;
