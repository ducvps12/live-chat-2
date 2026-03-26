import { Router } from 'express';
import { facebookController } from './facebook.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router({ mergeParams: true });

// ── Public webhook endpoints (no auth — Facebook calls these directly) ──
// These are registered at /api/v1/facebook/webhook
router.get('/webhook', facebookController.verifyWebhook);
router.post('/webhook', facebookController.handleWebhook);

// ── OAuth callback (no workspace auth — redirect from Facebook) ──
router.get('/callback', facebookController.handleCallback);

export const facebookPublicRoutes = router;

// ── Protected workspace-scoped routes ──
const protectedRouter = Router({ mergeParams: true });
protectedRouter.use(requireAuth);
protectedRouter.use(scopeCheck);

// /api/v1/workspaces/:workspaceId/facebook/...
protectedRouter.get('/oauth-url', facebookController.getOAuthUrl);
protectedRouter.get('/pages', facebookController.getPages);
protectedRouter.post('/pages', facebookController.connectPage);
protectedRouter.delete('/pages/:pageDbId', facebookController.disconnectPage);
protectedRouter.post('/send', facebookController.sendMessage);
protectedRouter.post('/pages/:pageDbId/sync', facebookController.syncPageMessages);

export const facebookRoutes = protectedRouter;
