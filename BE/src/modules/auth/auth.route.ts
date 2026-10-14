import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();
const authController = new AuthController();

router.post('/google', (req, res) => authController.loginWithGoogle(req, res));
router.post('/login', authController.login);

// ==================== DÒNG MỚI THÊM VÀO ĐÂY ====================
router.post('/register', authController.requestRegistrationOtp);
router.post('/register/verify-otp', authController.verifyRegistrationOtp);

// --- CÁC ROUTE MỚI ---
// Đổi mật khẩu (Cần token vì phải đăng nhập mới đổi được)
router.post('/change-password', verifyToken, authController.changePassword);

// Quên mật khẩu (Không cần token)
router.post('/forgot-password', authController.forgotPassword);

// Đặt lại mật khẩu từ link email (Không cần token)
router.post('/reset-password', authController.resetPassword);

console.log(' File auth.route.ts đã được nạp thành công!');
export const authRouter = router;