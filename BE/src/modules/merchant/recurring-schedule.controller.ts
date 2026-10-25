import { Request, Response } from 'express';
import recurringScheduleService from './recurring-schedule.service.js';
import { RecurringScheduleInput } from './recurring-schedule.util.js';

function getPartnerId(req: Request): number {
  const partnerId = Number((req as Request & { user?: { user_id: number } }).user?.user_id);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    throw new Error('Thông tin đối tác không hợp lệ.');
  }
  return partnerId;
}

function isDatabaseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error;
}

class RecurringScheduleController {
  preview = async (req: Request, res: Response): Promise<Response> => {
    try {
      const data = await recurringScheduleService.preview(
        getPartnerId(req),
        req.body as RecurringScheduleInput,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      if (isDatabaseError(error) || !(error instanceof Error)) {
        console.error('Could not preview recurring schedule:', error);
        return res.status(500).json({
          success: false,
          message: 'Không thể kiểm tra lịch chạy trong cơ sở dữ liệu.',
        });
      }
      const message = error instanceof Error ? error.message : 'Không thể xem trước lịch chạy.';
      const status = message.includes('không tồn tại') || message.includes('không thuộc') ? 403 : 400;
      return res.status(status).json({ success: false, message });
    }
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const mode = req.body?.mode === undefined ? 'all_or_nothing' : req.body.mode;
      if (mode !== 'all_or_nothing' && mode !== 'valid_only') {
        return res.status(400).json({
          success: false,
          message: 'Chế độ tạo chuyến không hợp lệ.',
        });
      }
      const data = await recurringScheduleService.create(
        getPartnerId(req),
        req.body as RecurringScheduleInput,
        mode,
      );
      return res.status(data.blocked ? 409 : 201).json({
        success: !data.blocked,
        data,
        message: data.blocked
          ? 'Có chuyến bị xung đột; không tạo chuyến nào ở chế độ tạo toàn bộ.'
          : 'Đã xử lý lịch chạy định kỳ.',
      });
    } catch (error) {
      console.error('Could not create recurring trips:', error);
      if (isDatabaseError(error) || !(error instanceof Error)) {
        return res.status(500).json({
          success: false,
          message: 'Đã xảy ra lỗi cơ sở dữ liệu khi tạo các chuyến.',
        });
      }
      const message = error instanceof Error ? error.message : 'Không thể tạo lịch chạy định kỳ.';
      const isOwnershipError = message.includes('không tồn tại') || message.includes('không thuộc');
      return res.status(isOwnershipError ? 403 : 400).json({ success: false, message });
    }
  };

  getTemplates = async (req: Request, res: Response): Promise<Response> => {
    try {
      return res.status(200).json({
        success: true,
        data: await recurringScheduleService.getTemplates(getPartnerId(req)),
      });
    } catch (error) {
      console.error('Could not load recurring schedule templates:', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải các mẫu lịch chạy.',
      });
    }
  };

  setStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const templateId = Number(req.params.id);
      const status = req.body?.status;
      if (!Number.isSafeInteger(templateId) || templateId <= 0) {
        return res.status(400).json({ success: false, message: 'Mã mẫu lịch không hợp lệ.' });
      }
      if (status !== 'Active' && status !== 'Paused') {
        return res.status(400).json({ success: false, message: 'Trạng thái mẫu lịch không hợp lệ.' });
      }
      await recurringScheduleService.setTemplateStatus(getPartnerId(req), templateId, status);
      return res.status(200).json({
        success: true,
        message: status === 'Paused' ? 'Đã tạm ngừng mẫu lịch.' : 'Đã kích hoạt lại mẫu lịch.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể cập nhật mẫu lịch.';
      return res.status(message.includes('không tìm thấy') ? 404 : 500).json({
        success: false,
        message,
      });
    }
  };
}

export default new RecurringScheduleController();
