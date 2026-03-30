import { Router } from 'express';
import { CampaignController } from '../controllers/campaignController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { createCampaignSchema, updateCampaignSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(CampaignController.list));
router.get('/:id', asyncHandler(CampaignController.get));
router.get('/:id/analytics', asyncHandler(CampaignController.getAnalytics));
router.post(
  '/',
  requireRole('ADMIN', 'MANAGER', 'REP'),
  validate(createCampaignSchema),
  asyncHandler(CampaignController.create),
);
router.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER', 'REP'),
  validate(updateCampaignSchema),
  asyncHandler(CampaignController.update),
);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(CampaignController.delete));
router.post('/:id/start', requireRole('ADMIN', 'MANAGER', 'REP'), asyncHandler(CampaignController.start));
router.post('/:id/pause', requireRole('ADMIN', 'MANAGER', 'REP'), asyncHandler(CampaignController.pause));
router.post('/:id/cancel', requireRole('ADMIN', 'MANAGER', 'REP'), asyncHandler(CampaignController.cancel));
router.post('/:id/sync', requireRole('ADMIN', 'MANAGER', 'REP'), asyncHandler(CampaignController.syncStatuses));

export default router;
