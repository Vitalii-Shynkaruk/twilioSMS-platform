import { Router } from 'express';
import { PipelineController } from '../controllers/pipelineController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { createStageSchema, moveCardSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/stages', asyncHandler(PipelineController.getStages));
router.post('/stages', requireRole('ADMIN', 'MANAGER'), validate(createStageSchema), asyncHandler(PipelineController.createStage));
router.put('/stages/reorder', requireRole('ADMIN', 'MANAGER'), asyncHandler(PipelineController.reorderStages));
router.put('/stages/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(PipelineController.updateStage));
router.delete('/stages/:id', requireRole('ADMIN'), asyncHandler(PipelineController.deleteStage));
router.put('/cards/:cardId/move', validate(moveCardSchema), asyncHandler(PipelineController.moveCard));

export default router;
