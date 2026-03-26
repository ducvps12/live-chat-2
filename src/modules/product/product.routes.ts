import { Router } from 'express';
import { productController } from './product.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router();

router.get('/workspace/:workspaceId', requireAuth, scopeCheck, productController.list);
router.get('/workspace/:workspaceId/categories', requireAuth, scopeCheck, productController.getCategories);
router.get('/workspace/:workspaceId/:productId', requireAuth, scopeCheck, productController.getById);
router.post('/workspace/:workspaceId', requireAuth, scopeCheck, productController.create);
router.post('/workspace/:workspaceId/sync-google-sheet', requireAuth, scopeCheck, productController.syncGoogleSheet);
router.patch('/workspace/:workspaceId/:productId', requireAuth, scopeCheck, productController.update);
router.delete('/workspace/:workspaceId/:productId', requireAuth, scopeCheck, productController.remove);

export default router;
