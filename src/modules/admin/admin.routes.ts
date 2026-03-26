import { Router } from 'express';
import { adminController } from './admin.controller';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/overview', adminController.overview);
router.get('/workspaces', adminController.listWorkspaces);
router.get('/users', adminController.listUsers);
router.get('/bots', adminController.listBots);
router.patch('/bots/:botId/toggle', adminController.toggleBot);
router.get('/ai/health', adminController.aiHealth);
router.get('/messages/recent', adminController.recentMessages);
router.get('/collections', adminController.collections);

export default router;
