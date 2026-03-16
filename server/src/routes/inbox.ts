import { Router } from 'express';
import { InboxController } from '../controllers/inboxController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import { sendReplySchema, assignRepSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(InboxController.listConversations));
router.get('/:id', asyncHandler(InboxController.getConversation));
router.post('/:id/read', asyncHandler(InboxController.markRead));
router.post('/:id/reply', validate(sendReplySchema), asyncHandler(InboxController.sendReply));
router.put('/:id/assign', validate(assignRepSchema), asyncHandler(InboxController.assignRep));

export default router;
