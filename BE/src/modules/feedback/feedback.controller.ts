import { Request, Response } from 'express';
import feedbackService from './feedback.service.js';

class FeedbackController {
  getEligibleTickets = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = Number((req as any).user.user_id);
      return res.status(200).json({
        success: true,
        data: await feedbackService.getEligibleTickets(userId),
      });
    } catch (error) {
      console.error('Could not load eligible feedback tickets:', error);
      return res.status(500).json({ success: false, message: 'Không thể tải danh sách chuyến cần đánh giá.' });
    }
  };

  createFeedback = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = Number((req as any).user.user_id);
      const ticketId = Number(req.params.ticketId);
      const rating = req.body?.rating === undefined
        ? undefined
        : Number(req.body.rating);
      const ratingSeats = Number(req.body?.ratingSeats ?? rating);
      const ratingService = Number(req.body?.ratingService ?? rating);
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
      if (
        !Number.isSafeInteger(ticketId) ||
        ticketId <= 0 ||
        !Number.isInteger(ratingSeats) ||
        ratingSeats < 1 ||
        ratingSeats > 5 ||
        !Number.isInteger(ratingService) ||
        ratingService < 1 ||
        ratingService > 5
      ) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn số sao từ 1 đến 5 cho từng tiêu chí.' });
      }
      if (comment.length > 2000) {
        return res.status(400).json({ success: false, message: 'Nội dung đánh giá tối đa 2000 ký tự.' });
      }
      const result = await feedbackService.createFeedback(userId, ticketId, ratingSeats, ratingService, comment);
      return res.status(201).json({ success: true, data: result, message: 'Cảm ơn bạn đã đánh giá chuyến đi.' });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể lưu đánh giá.',
      });
    }
  };

  getPartnerFeedback = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = Number((req as any).user.user_id);
      return res.status(200).json({
        success: true,
        data: await feedbackService.getPartnerFeedback(partnerId),
      });
    } catch (error) {
      console.error('Could not load partner reviews:', error);
      return res.status(500).json({ success: false, message: 'Không thể tải đánh giá.' });
    }
  };

  replyToFeedback = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = Number((req as any).user.user_id);
      const feedbackId = Number(req.params.feedbackId);
      const reply = typeof req.body?.reply === 'string' ? req.body.reply.trim() : '';
      if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0 || !reply || reply.length > 2000) {
        return res.status(400).json({ success: false, message: 'Phản hồi cần có từ 1 đến 2000 ký tự.' });
      }
      await feedbackService.replyToFeedback(partnerId, feedbackId, reply);
      return res.status(200).json({ success: true, message: 'Đã gửi phản hồi.' });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể gửi phản hồi.',
      });
    }
  };
}

export default new FeedbackController();
