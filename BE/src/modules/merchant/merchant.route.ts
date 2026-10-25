import { Router } from 'express';
import { MerchantController } from './merchant.controller.js';
import { verifyToken, verifyRole } from '../../middlewares/auth.middleware.js';
import feedbackController from '../feedback/feedback.controller.js';
import recurringScheduleController from './recurring-schedule.controller.js';

const router = Router();
const controller = new MerchantController();

router.use(verifyToken, verifyRole(['Partner']));

router.get('/profile', controller.getProfile);
router.put('/profile', controller.updateProfile);
router.get('/stats', controller.getStats);
router.get('/fleet', controller.getFleet);
router.get('/drivers', controller.getDrivers);
router.get('/schedules', controller.getSchedules);
router.get('/schedule-templates', recurringScheduleController.getTemplates);
router.post('/schedules/recurring/preview', recurringScheduleController.preview);
router.post('/schedules/recurring', recurringScheduleController.create);
router.patch('/schedule-templates/:id/status', recurringScheduleController.setStatus);
router.get('/refunds', controller.getRefunds);
router.get('/feedback', feedbackController.getPartnerFeedback);
router.post('/feedback/:feedbackId/reply', feedbackController.replyToFeedback);
router.patch('/refunds/:id/approve', controller.approveRefund);
router.patch('/refunds/:id/reject', controller.rejectRefund);
router.get('/wallet', controller.getMerchantWallet);
router.post('/drivers', controller.createDriver);
router.patch('/drivers/:id', controller.updateDriver);
router.delete('/drivers/:id', controller.deleteDriver);
router.post('/schedules', controller.createSchedule);
router.patch('/schedules/:id', controller.updateSchedule);
router.delete('/schedules/:id', controller.deleteSchedule);
router.post('/fleet', controller.createFleet);
router.patch('/fleet/:id', controller.updateFleet);
router.delete('/fleet/:id', controller.deleteFleet);

export default router;
