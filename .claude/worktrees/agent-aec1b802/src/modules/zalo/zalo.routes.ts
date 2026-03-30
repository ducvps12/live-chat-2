import { Router } from 'express';
import { zaloController } from './zalo.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router({ mergeParams: true }); // /api/v1/workspaces/:workspaceId/zalo

// Yêu cầu quyền admin của workspace
router.use(requireAuth);
router.use(scopeCheck);

// ── Core ──
router.get('/status', zaloController.getStatus);
router.post('/qr', zaloController.generateQR);
router.delete('/disconnect', zaloController.disconnect);
router.post('/send', zaloController.sendMessage);

// ── History & Search ──
router.get('/history', zaloController.getHistory);               // GET ?threadId=...&before=...&limit=50
router.get('/search', zaloController.searchMessages);            // GET ?q=keyword&threadId=...
router.get('/summaries', zaloController.getConversationSummaries); // GET (latest per thread)

// ── Contacts ──
router.get('/contacts', zaloController.getContacts);             // GET ?search=...&page=1&limit=20
router.get('/contacts/export', zaloController.exportContacts);   // GET export CSV
router.get('/contacts/:zaloUserId', zaloController.getContact);  // GET single
router.patch('/contacts/:zaloUserId', zaloController.updateContact); // PATCH (update phone, name)

export const zaloRoutes = router;
