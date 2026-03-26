import { Router } from 'express';
import { businessHoursController } from './businessHours.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, businessHoursController.get);
router.put('/workspace/:workspaceId', requireAuth, scopeCheck, businessHoursController.upsert);
router.get('/workspace/:workspaceId/status', requireAuth, scopeCheck, businessHoursController.checkStatus);

export default router;
