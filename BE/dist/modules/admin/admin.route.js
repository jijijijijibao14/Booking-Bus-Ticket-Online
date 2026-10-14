import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { verifyToken, verifyRole } from '../../middlewares/auth.middleware.js';
const router = Router();
const adminController = new AdminController();
// Bức tường bảo vệ: Phải đăng nhập VÀ có quyền Platform Admin mới được đi qua
router.use(verifyToken, verifyRole(['Admin']));
router.get('/schedules', adminController.getSchedules);
router.get('/fleet', adminController.getFleet);
router.get('/approvals', adminController.getApprovals);
router.post('/approvals/:merchantId', adminController.handleMerchantAction);
// Routes cho luồng hoàn tiền của Admin
router.get('/refunds/waiting', adminController.getWaitingRefunds);
router.patch('/refunds/:id/process', adminController.processAdminRefund);
export default router;
