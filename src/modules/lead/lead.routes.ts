import { Router } from 'express';
import { leadController } from './lead.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router({ mergeParams: true });

// All lead routes require auth — mounted under /workspaces/:workspaceId/leads
router.get('/', requireAuth, scopeCheck, leadController.list);
router.get('/stats', requireAuth, scopeCheck, leadController.getStats);
router.post('/', requireAuth, scopeCheck, leadController.create);
router.post('/convert', requireAuth, scopeCheck, leadController.convertFromContact);
router.post('/convert-group', requireAuth, scopeCheck, leadController.bulkConvertFromGroup);

router.get('/:leadId', requireAuth, scopeCheck, leadController.getById);
router.patch('/:leadId', requireAuth, scopeCheck, leadController.update);
router.patch('/:leadId/stage', requireAuth, scopeCheck, leadController.updateStage);
router.post('/:leadId/notes', requireAuth, scopeCheck, leadController.addNote);
router.delete('/:leadId', requireAuth, scopeCheck, leadController.delete);

export default router;
