import { Request, Response } from 'express';
import authService from './auth.service';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'vietgo_secret_key_2026';

export class AuthController {
    
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifier, email, username, password } = req.body;
      const loginIdentifier = identifier ?? email ?? username;
      if (
        typeof loginIdentifier !== 'string' ||
        !loginIdentifier.trim() ||
        typeof password !== 'string' ||
        !password
      ) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng nhập username hoặc email và mật khẩu.',
        });
        return;
      }

      const user = await authService.login(loginIdentifier, password);

      if (!user) {
        res.status(401).json({ 
          success: false, 
          message: 'Username/email hoặc mật khẩu không chính xác.'
        });
        return;
      }

      if (user.status === 'Pending Approval') {
        res.status(403).json({ 
          success: false, 
          message: 'Tài khoản của bạn đang chờ quản trị viên phê duyệt.' 
        });
        return;
      }

      if (user.status === 'Rejected') {
        res.status(403).json({ 
          success: false, 
          message: 'Tài khoản của bạn đã bị từ chối truy cập hệ thống.' 
        });
        return;
      }

      if (user.status === 'Suspended' || user.status === 'Deleted') {
        res.status(403).json({
          success: false,
          message: user.status === 'Suspended'
            ? 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.'
            : 'Tài khoản của bạn đã được lưu trữ.',
        });
        return;
      }

      const token = jwt.sign(
        { user_id: user.user_id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({ success: true, token, user });
    } catch (error: any) {
      console.error('❌ LỖI ĐĂNG NHẬP NGHIÊM TRỌNG:', error); 
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  requestRegistrationOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      await authService.requestRegistrationOtp(req.body);

      res.status(200).json({
        success: true,
        message: 'Mã OTP đã được gửi đến email của bạn và có hiệu lực trong 2 phút.'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Không thể gửi mã OTP đăng ký.'
      });
    }
  };

  verifyRegistrationOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await authService.verifyRegistrationOtp(req.body);
      const message = user.role === 'Partner'
        ? 'Xác minh email và đăng ký thành công! Tài khoản đối tác đang chờ quản trị viên phê duyệt.'
        : 'Xác minh email và đăng ký thành công!';

      res.status(201).json({ success: true, message, user });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Mã OTP không hợp lệ.'
      });
    }
  };

  // Hàm login với Google đã được sửa: Đổi thành arrow function và bỏ "this."
  loginWithGoogle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ success: false, message: 'Thiếu Token từ Google!' });
        return;
      }

      // Đã sửa thành authService (bỏ this.) để khớp với cấu trúc import đầu file của bạn
      const result = await authService.loginWithGoogle(token);

      if (result.user.status === 'Suspended' || result.user.status === 'Deleted') {
        res.status(403).json({
          success: false,
          message: result.user.status === 'Suspended'
            ? 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.'
            : 'Tài khoản của bạn đã được lưu trữ.',
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        message: '🎉 Đăng nhập bằng Google thành công!',
        ...result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi hệ thống khi xác thực Google'
      });
    }
  };

  // thêm 3 hàm xử lý request/response
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.user_id; // Lấy từ verifyToken middleware
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, message: 'Vui lòng điền đủ mật khẩu cũ và mới.' });
        return;
      }

      await authService.changePassword(userId, currentPassword, newPassword);
      res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, message: 'Vui lòng cung cấp email.' });
        return;
      }

      await authService.forgotPassword(email);
      res.status(200).json({
        success: true,
        message: 'Mã OTP khôi phục mật khẩu đã được gửi đến email và có hiệu lực trong 5 phút.',
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, email, otp, newPassword } = req.body;
      if (!newPassword || (!token && (!email || !otp))) {
        res.status(400).json({
          success: false,
          message: 'Email, mã OTP và mật khẩu mới là bắt buộc.',
        });
        return;
      }

      if (token) {
        await authService.resetPassword(token, newPassword);
      } else {
        await authService.resetPasswordWithOtp(email, otp, newPassword);
      }
      res.status(200).json({ success: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };
}