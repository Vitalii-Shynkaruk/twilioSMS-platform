import { Router } from 'express';
import { NumberController } from '../controllers/numberController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { createNumberSchema, updateNumberSchema, assignNumberSchema, createPoolSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/', asyncHandler(NumberController.list));
router.post('/', validate(createNumberSchema), asyncHandler(NumberController.create));
router.post('/sync-twilio', asyncHandler(NumberController.syncFromTwilio));
router.post('/assign', validate(assignNumberSchema), asyncHandler(NumberController.assignToRep));
router.get('/assignments', asyncHandler(NumberController.getAssignments));
router.delete('/assignments/:repId', asyncHandler(NumberController.unassignFromRep));
router.get('/pools', asyncHandler(NumberController.getPools));
router.post('/pools', asyncHandler(NumberController.createPool));
router.put('/:id', asyncHandler(NumberController.update));
router.delete('/:id', asyncHandler(NumberController.remove));
router.post('/:id/cool', asyncHandler(NumberController.coolDown));
router.post('/:id/activate', asyncHandler(NumberController.activate));

export default router;
