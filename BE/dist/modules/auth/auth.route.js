"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const auth_controller_js_1 = require("./auth.controller.js");
const auth_middleware_js_1 = require("../../middlewares/auth.middleware.js");
const router = (0, express_1.Router)();
const authController = new auth_controller_js_1.AuthController();
router.post('/google', (req, res) => authController.loginWithGoogle(req, res));
router.post('/login', authController.login);
// ==================== DÒNG MỚI THÊM VÀO ĐÂY ====================
router.post('/register', authController.requestRegistrationOtp);
router.post('/register/verify-otp', authController.verifyRegistrationOtp);
// --- CÁC ROUTE MỚI ---
// Đổi mật khẩu (Cần token vì phải đăng nhập mới đổi được)
router.post('/change-password', auth_middleware_js_1.verifyToken, authController.changePassword);
// Quên mật khẩu (Không cần token)
router.post('/forgot-password', authController.forgotPassword);
// Đặt lại mật khẩu từ link email (Không cần token)
router.post('/reset-password', authController.resetPassword);
console.log(' File auth.route.ts đã được nạp thành công!');
exports.authRouter = router;
