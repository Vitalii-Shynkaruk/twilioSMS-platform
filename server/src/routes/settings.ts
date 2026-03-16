import { Router } from 'express';
import { SettingsController } from '../controllers/settingsController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

// ── Tags ──
router.get('/tags', asyncHandler(SettingsController.listTags));
router.post('/tags', requireRole('ADMIN', 'MANAGER'), asyncHandler(SettingsController.createTag));
router.put('/tags/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(SettingsController.updateTag));
router.delete('/tags/:id', requireRole('ADMIN'), asyncHandler(SettingsController.deleteTag));

// ── System Settings ──
router.get('/settings', requireRole('ADMIN'), asyncHandler(SettingsController.getSettings));
router.put('/settings', requireRole('ADMIN'), asyncHandler(SettingsController.bulkUpdateSettings));
router.put('/settings/:key', requireRole('ADMIN'), asyncHandler(SettingsController.updateSetting));

// ── Settings Export ──
router.post('/export', requireRole('ADMIN'), asyncHandler(SettingsController.exportSettings));

// ── Suppression List ──
router.get('/suppression', requireRole('ADMIN', 'MANAGER'), asyncHandler(SettingsController.listSuppression));
router.get('/suppression/export', requireRole('ADMIN'), asyncHandler(SettingsController.exportSuppression));
router.post('/suppression', requireRole('ADMIN', 'MANAGER'), asyncHandler(SettingsController.addSuppression));
router.post('/suppression/bulk', requireRole('ADMIN', 'MANAGER'), asyncHandler(SettingsController.bulkAddSuppression));
router.delete('/suppression/:id', requireRole('ADMIN'), asyncHandler(SettingsController.removeSuppression));

// ── Activity Log ──
router.get('/activity', requireRole('ADMIN'), asyncHandler(SettingsController.getActivityLog));

export default router;
