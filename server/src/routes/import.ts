import { Router } from 'express';
import { CsvImportController } from '../controllers/csvImportController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.post('/csv', asyncHandler(CsvImportController.importCsv));
router.get('/batches', asyncHandler(CsvImportController.getBatches));
router.delete('/batches/:batchId', asyncHandler(CsvImportController.rollbackBatch));

export default router;
