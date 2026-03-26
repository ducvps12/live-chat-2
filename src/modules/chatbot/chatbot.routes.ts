import { Router } from 'express';
import { chatbotController } from './chatbot.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

// ────────── Public: bot auto-reply (called from widget) ──────────
router.post(
    '/public/:workspaceId/process',
    chatbotController.processMessage
);

// ────────── Authenticated: bot management ──────────
router.get(
    '/workspace/:workspaceId',
    requireAuth,
    scopeCheck,
    chatbotController.list
);

router.get(
    '/workspace/:workspaceId/stats',
    requireAuth,
    scopeCheck,
    chatbotController.getStats
);

router.get(
    '/workspace/:workspaceId/:botId',
    requireAuth,
    scopeCheck,
    chatbotController.getOne
);

router.post(
    '/workspace/:workspaceId',
    requireAuth,
    scopeCheck,
    chatbotController.create
);

router.put(
    '/workspace/:workspaceId/:botId',
    requireAuth,
    scopeCheck,
    chatbotController.update
);

router.patch(
    '/workspace/:workspaceId/:botId/toggle',
    requireAuth,
    scopeCheck,
    chatbotController.toggleActive
);

router.delete(
    '/workspace/:workspaceId/:botId',
    requireAuth,
    scopeCheck,
    chatbotController.remove
);

// ────────── AI Models ──────────
router.get(
    '/ai/models',
    requireAuth,
    chatbotController.listModels
);

export default router;
