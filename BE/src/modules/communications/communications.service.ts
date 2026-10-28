import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database.js';

type UserRole = 'Customer' | 'Partner';
type ConversationType = 'CUSTOMER_PARTNER' | 'CUSTOMER_SUPPORT' | 'PARTNER_SUPPORT';

interface ConversationRow extends RowDataPacket {
  conversation_id: number;
}

interface AccessRow extends RowDataPacket {
  conversation_id: number;
}

class CommunicationsService {
  async getPartners() {
    const [rows] = await pool.query(
      `SELECT p.partner_id AS partnerId, p.brand_name AS brandName
       FROM partner_profiles p
       JOIN users u ON u.user_id = p.partner_id
       WHERE u.status = 'Active' AND p.is_approved = TRUE
       ORDER BY p.brand_name`,
    );
    return rows;
  }

  async getConversations(userId: number, role: UserRole) {
    let whereClause: string;
    let params: number[] = [];
    if (role === 'Customer') {
      whereClause = 'c.customer_id = ?';
      params = [userId];
    } else {
      whereClause = 'c.partner_id = ?';
      params = [userId];
    }

    const [rows] = await pool.query(
      `SELECT
         c.conversation_id AS conversationId,
         c.conversation_type AS conversationType,
         c.customer_id AS customerId,
         cu.full_name AS customerName,
         c.partner_id AS partnerId,
         p.brand_name AS partnerName,
         c.updated_at AS updatedAt,
         (SELECT message_text
          FROM chat_messages m
          WHERE m.conversation_id = c.conversation_id
          ORDER BY m.message_id DESC
          LIMIT 1) AS lastMessage
       FROM chat_conversations c
       LEFT JOIN users cu ON cu.user_id = c.customer_id
       LEFT JOIN partner_profiles p ON p.partner_id = c.partner_id
       WHERE ${whereClause}
       ORDER BY c.updated_at DESC`,
      params,
    );
    return rows;
  }

  async openConversation(
    userId: number,
    role: UserRole,
    type: 'partner' | 'support',
    partnerId?: number,
  ) {
    let conversationType: ConversationType;
    let customerId: number | null = null;
    let targetPartnerId: number | null = null;

    if (role === 'Customer' && type === 'partner' && Number.isSafeInteger(partnerId) && partnerId! > 0) {
      conversationType = 'CUSTOMER_PARTNER';
      customerId = userId;
      targetPartnerId = partnerId!;

      const [partners] = await pool.query<RowDataPacket[]>(
        `SELECT p.partner_id
         FROM partner_profiles p
         JOIN users u ON u.user_id = p.partner_id
         WHERE p.partner_id = ? AND p.is_approved = TRUE AND u.status = 'Active'
         LIMIT 1`,
        [targetPartnerId],
      );
      if (partners.length === 0) {
        throw new Error('Nhà xe không tồn tại hoặc chưa được duyệt.');
      }
    } else if (role === 'Customer' && type === 'support') {
      conversationType = 'CUSTOMER_SUPPORT';
      customerId = userId;
    } else if (role === 'Partner' && type === 'support') {
      conversationType = 'PARTNER_SUPPORT';
      targetPartnerId = userId;
    } else {
      throw new Error('Bạn không có quyền mở cuộc trò chuyện này.');
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO chat_conversations (conversation_type, customer_id, partner_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id)`,
      [conversationType, customerId, targetPartnerId],
    );

    return { conversationId: result.insertId };
  }

  private async assertCanAccessConversation(
    conversationId: number,
    userId: number,
    role: UserRole,
  ) {
    const conditions = role === 'Partner'
      ? 'partner_id = ?'
      : 'customer_id = ?';
    const params = [conversationId, userId];
    const [rows] = await pool.query<AccessRow[]>(
      `SELECT conversation_id
       FROM chat_conversations
       WHERE conversation_id = ? AND ${conditions}
       LIMIT 1`,
      params,
    );
    if (rows.length === 0) {
      throw new Error('Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền truy cập.');
    }
  }

  async getMessages(conversationId: number, userId: number, role: UserRole) {
    await this.assertCanAccessConversation(conversationId, userId, role);
    const [rows] = await pool.query(
      `SELECT
         m.message_id AS messageId,
         m.sender_id AS senderId,
         m.sender_role AS senderRole,
         m.message_text AS messageText,
         m.created_at AS createdAt,
         u.full_name AS senderName
       FROM chat_messages m
       JOIN users u ON u.user_id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.message_id ASC
       LIMIT 500`,
      [conversationId],
    );
    return rows;
  }

  async sendMessage(
    conversationId: number,
    userId: number,
    role: UserRole,
    messageText: string,
  ) {
    await this.assertCanAccessConversation(conversationId, userId, role);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO chat_messages
        (conversation_id, sender_id, sender_role, message_text)
       VALUES (?, ?, ?, ?)`,
      [conversationId, userId, role, messageText],
    );
    await pool.execute(
      'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?',
      [conversationId],
    );
    return { messageId: result.insertId };
  }
}

export default new CommunicationsService();
