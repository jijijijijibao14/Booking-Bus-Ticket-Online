import {
  Request,
  Response,
} from 'express';
import userService from './user.service.js';

export class UserController {
  getProfile = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        (req as any).user.user_id;

      const user =
        await userService.getProfile(
          userId,
        );

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message:
          error.message ||
          'Không thể lấy thông tin người dùng.',
      });
    }
  };

  getWalletTransactions = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        (req as any).user.user_id;

      const transactions =
        await userService.getWalletTransactions(
          userId,
        );

      res.status(200).json({
        success: true,
        data: transactions,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message:
          error.message ||
          'Không thể lấy lịch sử giao dịch ví.',
      });
    }
  };

  updateProfile = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        (req as any).user.user_id;

      /*
       * Frontend hiện gửi:
       * { name, email, phone }
       *
       * Backend/DB dùng:
       * full_name
       *
       * Email không cho sửa tại màn hình này.
       */
      const {
        name,
        full_name,
        phone,
        old_password,
        new_password,
      } = req.body;

      const result =
        await userService.updateProfile(
          userId,
          {
            full_name:
              full_name ?? name,
            phone,
            old_password,
            new_password,
          },
        );

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message:
          error.message ||
          'Cập nhật hồ sơ thất bại.',
      });
    }
  };
}