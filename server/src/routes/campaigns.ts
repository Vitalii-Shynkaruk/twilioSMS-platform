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
router.post('/', requireRole('ADMIN', 'MANAGER'), validate(createCampaignSchema), asyncHandler(CampaignController.create));
router.put('/:id', requireRole('ADMIN', 'MANAGER'), validate(updateCampaignSchema), asyncHandler(CampaignController.update));
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(CampaignController.delete));
router.post('/:id/start', requireRole('ADMIN', 'MANAGER'), asyncHandler(CampaignController.start));
router.post('/:id/pause', requireRole('ADMIN', 'MANAGER'), asyncHandler(CampaignController.pause));
router.post('/:id/cancel', requireRole('ADMIN', 'MANAGER'), asyncHandler(CampaignController.cancel));

export default router;
