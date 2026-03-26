import { Router } from 'express';
import { knowledgeController } from './knowledge.controller';
import { requireAuth } from '../../middlewares/auth.middleware';

const router = Router({ mergeParams: true });

// All routes require auth
router.use(requireAuth);

// ────────── Sync from Google Sheets ──────────
router.post('/sync', knowledgeController.syncFromSheet);

// ────────── Search / Suggest ──────────
router.get('/search', knowledgeController.search);
router.get('/suggest', knowledgeController.suggest);

// ────────── Stats & Products ──────────
router.get('/stats', knowledgeController.getStats);
router.get('/products', knowledgeController.getProducts);

// ────────── CRUD ──────────
router.get('/', knowledgeController.getAll);
router.post('/', knowledgeController.create);
router.put('/:id', knowledgeController.update);
router.delete('/:id', knowledgeController.remove);

export default router;
