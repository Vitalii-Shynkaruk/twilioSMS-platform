import { Router } from 'express';
import multer from 'multer';
import { DealController } from '../controllers/dealController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

// Deal CRUD
router.get('/', asyncHandler(DealController.getDeals));
router.get('/board', asyncHandler(DealController.getBoard));
router.get('/stats', asyncHandler(DealController.getStats));
router.get('/revive-queue', asyncHandler(DealController.getReviveQueue));
router.get('/:id', asyncHandler(DealController.getDeal));
router.post('/', asyncHandler(DealController.createDeal));
router.post('/import-csv', upload.single('file'), asyncHandler(DealController.importCSV));
router.put('/:id', asyncHandler(DealController.updateDeal));
router.put('/:id/move', asyncHandler(DealController.moveDeal));

// Deal actions
router.post('/:id/offers', asyncHandler(DealController.addOffer));
router.post('/:id/fund', asyncHandler(DealController.markFunded));
router.post('/:id/complete-action', asyncHandler(DealController.completeAction));
router.put('/:id/share', asyncHandler(DealController.shareDeal));
router.post('/:id/call-log', asyncHandler(DealController.logCall));
router.get('/:id/sms', asyncHandler(DealController.getDealSms));

export default router;
