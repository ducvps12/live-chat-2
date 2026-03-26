import { Router } from 'express';
import { orderController } from './order.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, orderController.list);
router.get('/workspace/:workspaceId/stats', requireAuth, scopeCheck, orderController.getStats);
router.get('/workspace/:workspaceId/:orderId', requireAuth, scopeCheck, orderController.getById);
router.post('/workspace/:workspaceId', requireAuth, scopeCheck, orderController.create);
router.patch('/workspace/:workspaceId/:orderId', requireAuth, scopeCheck, orderController.update);
router.patch('/workspace/:workspaceId/:orderId/status', requireAuth, scopeCheck, orderController.updateStatus);
router.delete('/workspace/:workspaceId/:orderId', requireAuth, scopeCheck, orderController.remove);

export default router;
