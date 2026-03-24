import { Router } from 'express';
import { subscriptionController } from './subscription.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { scopeCheck } from '../../middlewares/scopeCheck';

const router = Router({ mergeParams: true }); // /api/v1/workspaces/:workspaceId/subscription

router.use(requireAuth);
router.use(scopeCheck);

// Plan tiers (could be public but keeping behind auth for now)
router.get('/plans', subscriptionController.getPlans);

// Current subscription
router.get('/', subscriptionController.getSubscription);

// Change plan (upgrade/downgrade)
router.post('/change', subscriptionController.changePlan);

// Cancel
router.post('/cancel', subscriptionController.cancelSubscription);

// Invoices
router.get('/invoices', subscriptionController.getInvoices);

// Pay invoice (demo)
router.post('/invoices/:invoiceId/pay', subscriptionController.payInvoice);

export const subscriptionRoutes = router;
