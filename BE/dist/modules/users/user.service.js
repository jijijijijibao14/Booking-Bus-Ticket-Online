import pool from '../../config/database.js';
class UserService {
    async getProfile(userId) {
        const [users] = await pool.query(`SELECT
          user_id,
          full_name,
          email,
          phone,
          wallet_balance
       FROM users
       WHERE user_id = ?
       LIMIT 1`, [userId]);
        if (users.length === 0) {
            throw new Error('Không tìm thấy thông tin người dùng.');
        }
        const user = users[0];
        return {
            userId: Number(user.user_id),
            name: user.full_name ?? '',
            email: user.email ?? '',
            phone: user.phone ?? '',
            walletBalance: Number(user.wallet_balance ?? 0),
        };
    }
    async getWalletTransactions(userId) {
        const [rows] = await pool.query(`SELECT
          wallet_transaction_id,
          booking_id,
          related_booking_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_code,
          description,
          created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC, wallet_transaction_id DESC
       LIMIT 100`, [userId]);
        return rows.map((row) => ({
            id: Number(row.wallet_transaction_id),
            bookingId: row.booking_id != null
                ? Number(row.booking_id)
                : null,
            relatedBookingId: row.related_booking_id != null
                ? Number(row.related_booking_id)
                : null,
            type: String(row.transaction_type ?? '').toLowerCase(),
            amount: Number(row.amount ?? 0),
            balanceBefore: Number(row.balance_before ?? 0),
            balanceAfter: Number(row.balance_after ?? 0),
            referenceCode: row.reference_code ?? null,
            title: row.description ||
                (row.transaction_type === 'REFUND'
                    ? 'Hoàn tiền vào Ví ViệtGo'
                    : row.transaction_type === 'PAYMENT'
                        ? 'Thanh toán bằng Ví ViệtGo'
                        : 'Điều chỉnh số dư Ví ViệtGo'),
            date: row.created_at,
        }));
    }
    async updateProfile(userId, data) {
        const { full_name, phone, old_password, new_password, } = data;
        if (!full_name || !phone) {
            throw new Error('Họ tên và số điện thoại không được để trống.');
        }
        // 1. KIỂM TRA MẬT KHẨU CŨ NẾU CÓ YÊU CẦU ĐỔI MẬT KHẨU
        if (new_password) {
            if (!old_password) {
                throw new Error('Vui lòng nhập mật khẩu cũ để xác nhận đổi mật khẩu.');
            }
            const [users] = await pool.query(`SELECT password_plain
           FROM users
           WHERE user_id = ?
           LIMIT 1`, [userId]);
            if (users.length === 0) {
                throw new Error('Không tìm thấy thông tin người dùng.');
            }
            const currentUser = users[0];
            if (currentUser.password_plain !==
                old_password) {
                throw new Error('Mật khẩu cũ không chính xác.');
            }
        }
        // 2. TIẾN HÀNH CẬP NHẬT DATABASE
        let query = 'UPDATE users SET full_name = ?, phone = ?';
        const params = [
            full_name,
            phone,
        ];
        if (new_password) {
            query += ', password_plain = ?';
            params.push(new_password);
        }
        query += ' WHERE user_id = ?';
        params.push(userId);
        const [result] = await pool.query(query, params);
        if (result.affectedRows !== 1) {
            throw new Error('Không thể cập nhật hồ sơ người dùng.');
        }
        return {
            message: 'Cập nhật hồ sơ thành công!',
        };
    }
}
export default new UserService();
