import { Router } from 'express';
import multer from 'multer';
import { DealController } from '../controllers/dealController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

// Deal CRUD
router.get('/', asyncHandler(DealController.getDeals));
router.get('/board', asyncHandler(DealController.getBoard));
router.get('/stats', asyncHandler(DealController.getStats));
router.get('/revive-queue', asyncHandler(DealController.getReviveQueue));
router.get('/outbound-gate', asyncHandler(DealController.getOutboundGate));
router.post('/import-csv', requireRole('ADMIN'), upload.single('file'), asyncHandler(DealController.importCSV));
router.post(
  '/import-leads',
  requireRole('ADMIN', 'MANAGER'),
  upload.single('file'),
  asyncHandler(DealController.importLeads),
);
router.get('/import-batches', requireRole('ADMIN'), asyncHandler(DealController.getImportBatches));
router.delete('/import-batch/:batchId', requireRole('ADMIN'), asyncHandler(DealController.deleteImportBatch));
router.get('/:id', asyncHandler(DealController.getDeal));
router.post('/', asyncHandler(DealController.createDeal));
router.put('/:id', asyncHandler(DealController.updateDeal));
router.put('/:id/move', asyncHandler(DealController.moveDeal));
router.delete('/:id', asyncHandler(DealController.deleteDeal));

// Deal actions
router.post('/:id/offers', asyncHandler(DealController.addOffer));
router.delete('/:id/offers/:offerId', asyncHandler(DealController.deleteOffer));
router.post('/:id/fund', asyncHandler(DealController.markFunded));
router.post('/:id/complete-action', asyncHandler(DealController.completeAction));
router.put('/:id/share', asyncHandler(DealController.shareDeal));
router.post('/:id/log-attempt', asyncHandler(DealController.logAttempt));
router.post('/:id/call-log', asyncHandler(DealController.logCall));
router.get('/:id/sms', asyncHandler(DealController.getDealSms));
router.post('/:id/sms/send', asyncHandler(DealController.sendDealSms));
router.put('/renewal-tasks/:taskId/complete', asyncHandler(DealController.completeRenewalTask));

export default router;
