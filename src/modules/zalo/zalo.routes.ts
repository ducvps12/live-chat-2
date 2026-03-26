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
router.post('/broadcast', zaloController.broadcast);             // POST { messages, recipientIds, delayMs }

// ── History & Search ──
router.get('/history', zaloController.getHistory);               // GET ?threadId=...&before=...&limit=50
router.get('/search', zaloController.searchMessages);            // GET ?q=keyword&threadId=...
router.get('/summaries', zaloController.getConversationSummaries); // GET (latest per thread)

// ── Contacts ──
router.get('/contacts', zaloController.getContacts);             // GET ?search=...&page=1&limit=20
router.get('/contacts/export', zaloController.exportContacts);   // GET export CSV
router.get('/contacts/:zaloUserId', zaloController.getContact);  // GET single
router.patch('/contacts/:zaloUserId', zaloController.updateContact); // PATCH (update phone, name)

// ── Friends (live from Zalo session) ──
router.get('/friends', zaloController.getFriends);               // GET ?search=...&page=1&limit=50
router.post('/backfill-avatars', zaloController.backfillAvatars); // POST — backfill missing avatars

// ── Historical Sync ──
router.post('/sync', zaloController.startSync);                  // POST — start full history sync
router.get('/sync/status', zaloController.getSyncStatus);        // GET — poll sync progress

// ── Groups & Members ──
router.get('/groups', zaloController.getGroups);                  // GET — list all Zalo groups
router.get('/groups/:groupId/members', zaloController.getGroupMembers); // GET — members of a group
router.delete('/groups/:groupId/members/:userId', zaloController.kickMember); // DELETE — kick member from group
router.post('/groups/sync-all-to-leads', zaloController.bulkSyncGroupsToLeads); // POST — bulk sync all groups → leads
router.post('/groups/:groupId/auto-friend', zaloController.autoFriendGroup); // POST — auto-friend group members

// ── Auto Friend Status ──
router.get('/auto-friend/status', zaloController.getAutoFriendStatus); // GET ?groupId=...

// ── Behavior Analysis ──
router.get('/analyze/:userId', zaloController.analyzeMember);      // GET — analyze single member
router.post('/analyze/batch', zaloController.batchAnalyzeMembers); // POST { userIds: [] }

export const zaloRoutes = router;

