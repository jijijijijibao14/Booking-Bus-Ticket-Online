import { Request, Response } from 'express';
import communicationsService from './communications.service.js';

type UserRole = 'Customer' | 'Partner';

function authUser(req: Request) {
  const user = (req as Request & { user?: { user_id: number; role: UserRole | 'Admin' } }).user;
  if (!user || !user.user_id) {
    throw new Error('Thông tin xác thực không hợp lệ.');
  }
  if (user.role !== 'Customer' && user.role !== 'Partner') {
    throw new Error('Thông tin xác thực không hợp lệ.');
  }
  return { user_id: user.user_id, role: user.role };
}

class CommunicationsController {
  getPartners = async (_req: Request, res: Response): Promise<Response> => {
    try {
      return res.status(200).json({
        success: true,
        data: await communicationsService.getPartners(),
      });
    } catch (error) {
      console.error('Could not load chat partners:', error);
      return res.status(500).json({ success: false, message: 'Không thể tải danh sách nhà xe.' });
    }
  };

  getConversations = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = authUser(req);
      return res.status(200).json({
        success: true,
        data: await communicationsService.getConversations(user.user_id, user.role),
      });
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể tải hội thoại.',
      });
    }
  };

  openConversation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = authUser(req);
      const type = req.body?.type;
      const partnerId = req.body?.partnerId === undefined
        ? undefined
        : Number(req.body.partnerId);
      if (!['partner', 'support'].includes(type)) {
        return res.status(400).json({ success: false, message: 'Loại cuộc trò chuyện không hợp lệ.' });
      }
      const result = await communicationsService.openConversation(
        user.user_id,
        user.role,
        type,
        partnerId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể mở cuộc trò chuyện.',
      });
    }
  };

  getMessages = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = authUser(req);
      const conversationId = Number(req.params.conversationId);
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        return res.status(400).json({ success: false, message: 'Mã cuộc trò chuyện không hợp lệ.' });
      }
      return res.status(200).json({
        success: true,
        data: await communicationsService.getMessages(conversationId, user.user_id, user.role),
      });
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể tải tin nhắn.',
      });
    }
  };

  sendMessage = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = authUser(req);
      const conversationId = Number(req.params.conversationId);
      const messageText = typeof req.body?.messageText === 'string'
        ? req.body.messageText.trim()
        : '';
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        return res.status(400).json({ success: false, message: 'Mã cuộc trò chuyện không hợp lệ.' });
      }
      if (!messageText || messageText.length > 2000) {
        return res.status(400).json({ success: false, message: 'Tin nhắn phải có từ 1 đến 2000 ký tự.' });
      }
      const result = await communicationsService.sendMessage(
        conversationId,
        user.user_id,
        user.role,
        messageText,
      );
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error instanceof Error ? error.message : 'Không thể gửi tin nhắn.',
      });
    }
  };
}

export default new CommunicationsController();
