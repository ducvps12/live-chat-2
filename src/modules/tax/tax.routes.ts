import { Router } from 'express';
import { taxController } from './tax.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, taxController.list);
router.post('/workspace/:workspaceId', requireAuth, scopeCheck, taxController.create);
router.patch('/workspace/:workspaceId/:taxId', requireAuth, scopeCheck, taxController.update);
router.delete('/workspace/:workspaceId/:taxId', requireAuth, scopeCheck, taxController.remove);

export default router;
