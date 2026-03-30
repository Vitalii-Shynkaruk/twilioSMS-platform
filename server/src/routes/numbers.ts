import { Router } from 'express';
import { NumberController } from '../controllers/numberController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { createNumberSchema, updateNumberSchema, assignNumberSchema, createPoolSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

// Read-only endpoints accessible to all authenticated users (REPs see only their assigned numbers)
router.get('/', asyncHandler(NumberController.list));
router.get('/assignments', asyncHandler(NumberController.getAssignments));
router.get('/pools', asyncHandler(NumberController.getPools));

// Admin/Manager-only endpoints
router.use(requireRole('ADMIN', 'MANAGER'));
router.post('/', validate(createNumberSchema), asyncHandler(NumberController.create));
router.post('/sync-twilio', asyncHandler(NumberController.syncFromTwilio));
router.post('/assign', validate(assignNumberSchema), asyncHandler(NumberController.assignToRep));
router.delete('/assignments/:repId', asyncHandler(NumberController.unassignFromRep));
router.post('/pools', asyncHandler(NumberController.createPool));
router.put('/:id', asyncHandler(NumberController.update));
router.delete('/:id', asyncHandler(NumberController.remove));
router.post('/:id/cool', asyncHandler(NumberController.coolDown));
router.post('/:id/activate', asyncHandler(NumberController.activate));

export default router;
