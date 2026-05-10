import { Router } from 'express';
import { AutomationController } from '../controllers/automationController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { createRuleSchema, updateRuleSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/rules', asyncHandler(AutomationController.listRules));
router.get('/rules/:id', asyncHandler(AutomationController.getRule));
router.post('/rules', requireRole('ADMIN', 'MANAGER'), validate(createRuleSchema), asyncHandler(AutomationController.createRule));
router.put('/rules/:id', requireRole('ADMIN', 'MANAGER'), validate(updateRuleSchema), asyncHandler(AutomationController.updateRule));
router.delete('/rules/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(AutomationController.deleteRule));
router.post('/start', requireRole('ADMIN', 'MANAGER'), asyncHandler(AutomationController.startForLead));
router.post('/start-bulk', requireRole('ADMIN', 'MANAGER'), asyncHandler(AutomationController.startForLeads));
router.post('/runs/:id/pause', asyncHandler(AutomationController.pauseRun));
router.post('/runs/:id/resume', asyncHandler(AutomationController.resumeRun));

export default router;
