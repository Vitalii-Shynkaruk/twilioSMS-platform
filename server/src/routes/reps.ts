import { Router } from 'express';
import { RepController } from '../controllers/repController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(RepController.getReps));
router.get('/:id', asyncHandler(RepController.getRep));
router.post('/', requireRole('ADMIN'), asyncHandler(RepController.createRep));
router.put('/team-goals', requireRole('ADMIN'), asyncHandler(RepController.updateTeamGoals));
router.put('/:id', requireRole('ADMIN'), asyncHandler(RepController.updateRep));
router.put('/:id/goals', requireRole('ADMIN'), asyncHandler(RepController.updateGoals));

export default router;
