import { Request, Response } from 'express';
import adminService from './admin.service.js';

export class AdminController {
  getSchedules = async (req: Request, res: Response): Promise<void> => {
    try {
      const schedules = await adminService.getAdminSchedules();
      res.status(200).json({ success: true, data: schedules });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getFleet = async (req: Request, res: Response): Promise<void> => {
    try {
      const fleet = await adminService.getAdminFleet();
      res.status(200).json({ success: true, data: fleet });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getApprovals = async (req: Request, res: Response): Promise<void> => {
    try {
      const merchants = await adminService.getPendingMerchants();
      res.status(200).json({ success: true, data: merchants });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  handleMerchantAction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { merchantId } = req.params;
      const { action } = req.body; // 'approve' or 'reject'

      if (!merchantId || !action || !['approve', 'reject'].includes(action)) {
        res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ.' });
        return;
      }

      const success = await adminService.handleMerchantAction(Number(merchantId), action);
      if (success) {
        res.status(200).json({ success: true, message: `Đối tác đã được ${action === 'approve' ? 'phê duyệt' : 'từ chối'}.` });
      } else {
        res.status(404).json({ success: false, message: 'Không tìm thấy đối tác.' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getWaitingRefunds = async (req: Request, res: Response): Promise<void> => {
    try {
      const refunds = await adminService.getWaitingRefunds();
      res.status(200).json({ success: true, data: refunds });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  processAdminRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { action } = req.body; // 'approve' or 'reject'

      if (!id || !action || !['approve', 'reject'].includes(action)) {
        res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ. Cần refund ID và action (approve/reject).' });
        return;
      }

      const result = await adminService.processAdminRefund(Number(id), action);
      if (result.affectedRows > 0) {
        res.status(200).json({ success: true, message: result.message });
      } else {
        res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu hoàn tiền hoặc không thể xử lý.' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
