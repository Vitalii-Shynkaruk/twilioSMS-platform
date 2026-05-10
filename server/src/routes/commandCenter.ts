import { Router } from 'express';
import { CommandCenterController } from '../controllers/commandCenterController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get('/metrics', asyncHandler(CommandCenterController.getMetrics));
router.get('/operator-queue', asyncHandler(CommandCenterController.getOperatorQueue));
router.get('/hot-leads', asyncHandler(CommandCenterController.getHotLeads));
router.get('/stale-deals', asyncHandler(CommandCenterController.getStaleDeals));
router.get('/overdue-tasks', asyncHandler(CommandCenterController.getOverdueTasks));
router.get('/intelligence', requireRole('ADMIN', 'MANAGER'), asyncHandler(CommandCenterController.getIntelligence));
router.get(
  '/execution-scores',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(CommandCenterController.getExecutionScores),
);
router.get('/product-mix', asyncHandler(CommandCenterController.getProductMix));
router.get('/activity-feed', asyncHandler(CommandCenterController.getActivityFeed));
router.get('/sms-metrics', asyncHandler(CommandCenterController.getSmsMetrics));

export default router;
