import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database.js';

interface FeedbackEligibility extends RowDataPacket {
  ticket_id: number;
}

class FeedbackService {
  async getEligibleTickets(userId: number) {
    const [rows] = await pool.query(
      `SELECT
         tk.ticket_id AS ticketId,
         tk.passenger_name AS passengerName,
         tk.ticket_price AS ticketPrice,
         tr.arrival_time AS arrivalTime,
         r.departure_location AS departureLocation,
         r.arrival_location AS arrivalLocation,
         v.vehicle_name AS vehicleName,
         p.brand_name AS partnerName,
         f.feedback_id AS feedbackId,
         f.rating_seats AS rating,
         f.comment,
         f.partner_reply AS partnerReply,
         f.partner_replied_at AS partnerRepliedAt
       FROM tickets tk
       JOIN bookings b ON b.booking_id = tk.booking_id
       JOIN seats s ON s.seat_id = tk.seat_id
       JOIN trips tr ON tr.trip_id = s.trip_id
       JOIN routes r ON r.route_id = tr.route_id
       JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
       LEFT JOIN partner_profiles p ON p.partner_id = v.partner_id
       LEFT JOIN feedbacks f ON f.ticket_id = tk.ticket_id
       WHERE b.user_id = ?
         AND b.payment_status = 'Paid'
         AND tr.arrival_time <= NOW()
         AND f.feedback_id IS NULL
       ORDER BY tr.arrival_time DESC`,
      [userId],
    );
    return rows;
  }

  async createFeedback(
    userId: number,
    ticketId: number,
    ratingSeats: number,
    ratingService: number,
    comment: string,
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [tickets] = await connection.query<FeedbackEligibility[]>(
        `SELECT tk.ticket_id
         FROM tickets tk
         JOIN bookings b ON b.booking_id = tk.booking_id
         JOIN seats s ON s.seat_id = tk.seat_id
         JOIN trips tr ON tr.trip_id = s.trip_id
         LEFT JOIN feedbacks f ON f.ticket_id = tk.ticket_id
         WHERE tk.ticket_id = ?
           AND b.user_id = ?
           AND b.payment_status = 'Paid'
           AND tr.arrival_time <= NOW()
           AND f.feedback_id IS NULL
         FOR UPDATE`,
        [ticketId, userId],
      );
      if (tickets.length === 0) {
        throw new Error('Vé không thuộc tài khoản này, chưa hoàn thành, chưa thanh toán hoặc đã được đánh giá.');
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO feedbacks (ticket_id, user_id, rating_seats, rating_service, comment)
         VALUES (?, ?, ?, ?, ?)`,
        [ticketId, userId, ratingSeats, ratingService, comment || null],
      );
      await connection.commit();
      return { feedbackId: result.insertId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPartnerFeedback(partnerId: number) {
    const [rows] = await pool.query(
      `SELECT
         f.feedback_id AS feedbackId,
         f.ticket_id AS ticketId,
         f.rating_seats AS rating,
         f.rating_service AS serviceRating,
         f.comment,
         f.partner_reply AS partnerReply,
         f.created_at AS createdAt,
         f.partner_replied_at AS partnerRepliedAt,
         u.full_name AS customerName,
         r.departure_location AS departureLocation,
         r.arrival_location AS arrivalLocation,
         tr.departure_time AS departureTime,
         tr.arrival_time AS arrivalTime
       FROM feedbacks f
       JOIN users u ON u.user_id = f.user_id
       JOIN tickets tk ON tk.ticket_id = f.ticket_id
       JOIN seats s ON s.seat_id = tk.seat_id
       JOIN trips tr ON tr.trip_id = s.trip_id
       JOIN routes r ON r.route_id = tr.route_id
       JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
       WHERE v.partner_id = ?
       ORDER BY f.created_at DESC`,
      [partnerId],
    );
    return rows;
  }

  async replyToFeedback(partnerId: number, feedbackId: number, reply: string) {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE feedbacks f
       JOIN tickets tk ON tk.ticket_id = f.ticket_id
       JOIN seats s ON s.seat_id = tk.seat_id
       JOIN trips tr ON tr.trip_id = s.trip_id
       JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
       SET f.partner_reply = ?, f.partner_replied_at = CURRENT_TIMESTAMP
       WHERE f.feedback_id = ? AND v.partner_id = ? AND f.partner_reply IS NULL`,
      [reply, feedbackId, partnerId],
    );
    if (result.affectedRows !== 1) {
      throw new Error('Không tìm thấy đánh giá thuộc nhà xe này hoặc đánh giá đã được phản hồi.');
    }
    return true;
  }
}

export default new FeedbackService();
