import { Router } from 'express';
import { InboxController } from '../controllers/inboxController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../validation/middleware';
import {
  sendReplySchema,
  assignRepSchema,
  updateConversationStatusSchema,
  createNoteSchema,
  createClassificationFeedbackSchema,
  createTemplateSchema,
  updateTemplateSchema,
  createScheduledMessageSchema,
  addToPipelineSchema,
} from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(InboxController.listConversations));
router.get('/unread-summary', asyncHandler(InboxController.getUnreadSummary));
router.get('/by-lead/:leadId', asyncHandler(InboxController.getOrCreateByLead));
router.get('/:id', asyncHandler(InboxController.getConversation));
router.post('/:id/read', asyncHandler(InboxController.markRead));
router.post('/:id/unread', asyncHandler(InboxController.markUnread));
router.post('/:id/reply', validate(sendReplySchema), asyncHandler(InboxController.sendReply));
router.put(
  '/:id/assign',
  requireRole('ADMIN', 'MANAGER'),
  validate(assignRepSchema),
  asyncHandler(InboxController.assignRep),
);

router.patch(
  '/:id/status',
  validate(updateConversationStatusSchema),
  asyncHandler(InboxController.updateConversationStatus),
);

router.get('/:id/notes', asyncHandler(InboxController.listNotes));
router.post('/:id/notes', validate(createNoteSchema), asyncHandler(InboxController.createNote));
router.delete('/:id/notes/:noteId', asyncHandler(InboxController.deleteNote));
router.post(
  '/:id/classification-feedback',
  validate(createClassificationFeedbackSchema),
  asyncHandler(InboxController.createClassificationFeedback),
);

router.get('/templates/list', asyncHandler(InboxController.listTemplates));
router.post('/templates', validate(createTemplateSchema), asyncHandler(InboxController.createTemplate));
router.put('/templates/:templateId', validate(updateTemplateSchema), asyncHandler(InboxController.updateTemplate));
router.delete('/templates/:templateId', asyncHandler(InboxController.deleteTemplate));
router.post('/templates/:templateId/favorite', asyncHandler(InboxController.toggleFavorite));
router.post('/templates/:templateId/use', asyncHandler(InboxController.logTemplateUsage));

router.get('/:id/scheduled', asyncHandler(InboxController.listScheduledMessages));
router.post('/scheduled', validate(createScheduledMessageSchema), asyncHandler(InboxController.createScheduledMessage));
router.delete('/scheduled/:scheduledId', asyncHandler(InboxController.cancelScheduledMessage));

router.post('/:id/add-to-pipeline', validate(addToPipelineSchema), asyncHandler(InboxController.addToPipeline));

export default router;
