import { Router } from 'express';
import { emailController } from './email.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, emailController.list);
router.get('/workspace/:workspaceId/:accountId', requireAuth, scopeCheck, emailController.getById);
router.post('/workspace/:workspaceId', requireAuth, scopeCheck, emailController.create);
router.patch('/workspace/:workspaceId/:accountId', requireAuth, scopeCheck, emailController.update);
router.delete('/workspace/:workspaceId/:accountId', requireAuth, scopeCheck, emailController.remove);

export default router;
