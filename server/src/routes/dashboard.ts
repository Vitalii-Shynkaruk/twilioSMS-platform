import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get('/stats', asyncHandler(DashboardController.getStats));
router.get('/delivery-metrics', asyncHandler(DashboardController.getDeliveryMetrics));
router.get('/diagnostics', requireRole('ADMIN', 'MANAGER'), asyncHandler(DashboardController.getDiagnostics));
router.get('/twilio-diagnostics', requireRole('ADMIN'), asyncHandler(DashboardController.getTwilioDiagnostics));

export default router;
