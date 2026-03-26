import { Router } from 'express';
import { distributionController } from './distribution.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, distributionController.list);
router.get('/workspace/:workspaceId/:ruleId', requireAuth, scopeCheck, distributionController.getById);
router.post('/workspace/:workspaceId', requireAuth, scopeCheck, distributionController.create);
router.patch('/workspace/:workspaceId/:ruleId', requireAuth, scopeCheck, distributionController.update);
router.delete('/workspace/:workspaceId/:ruleId', requireAuth, scopeCheck, distributionController.remove);

export default router;
