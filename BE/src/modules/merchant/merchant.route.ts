import { Router } from 'express';
import { MerchantController } from './merchant.controller.js';
import { verifyToken, verifyRole } from '../../middlewares/auth.middleware.js';

const router = Router();
const controller = new MerchantController();

router.use(verifyToken, verifyRole(['Partner']));

router.get('/profile', controller.getProfile);
router.put('/profile', controller.updateProfile);
router.get('/stats', controller.getStats);
router.get('/fleet', controller.getFleet);
router.get('/drivers', controller.getDrivers);
router.get('/schedules', controller.getSchedules);
router.get('/refunds', controller.getRefunds);
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
