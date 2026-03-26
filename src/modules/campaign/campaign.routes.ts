import { Router } from 'express';
import { campaignController } from './campaign.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router({ mergeParams: true }); // /api/v1/workspaces/:workspaceId/campaigns

router.use(requireAuth);
router.use(scopeCheck);

// ── Campaign CRUD ──
router.get('/stats', campaignController.getStats);         // GET  — workspace-level stats
router.get('/', campaignController.list);                   // GET  — list campaigns
router.post('/', campaignController.create);                // POST — create draft
router.get('/:campaignId', campaignController.getById);     // GET  — single campaign + live progress
router.put('/:campaignId', campaignController.update);      // PUT  — update draft

// ── Campaign Execution ──
router.post('/:campaignId/start', campaignController.start);    // POST — start
router.post('/:campaignId/pause', campaignController.pause);    // POST — pause
router.post('/:campaignId/resume', campaignController.resume);  // POST — resume
router.delete('/:campaignId', campaignController.cancel);       // DELETE — cancel/delete

export const campaignRoutes = router;
