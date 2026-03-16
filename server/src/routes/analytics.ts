import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/overview', asyncHandler(AnalyticsController.getOverview));
router.get('/lead-funnel', asyncHandler(AnalyticsController.getLeadFunnel));
router.get('/messaging', asyncHandler(AnalyticsController.getMessaging));
router.get('/campaigns', asyncHandler(AnalyticsController.getCampaigns));
router.get('/numbers', asyncHandler(AnalyticsController.getNumbers));
router.get('/rep-performance', asyncHandler(AnalyticsController.getRepPerformance));
router.get('/automation', asyncHandler(AnalyticsController.getAutomation));

export default router;
