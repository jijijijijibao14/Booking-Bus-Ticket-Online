import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
const JWT_SECRET = process.env.JWT_SECRET || 'vietgo_secret_key_2026';
export const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(403).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện chức năng này.' });
        return;
    }
    let decoded;
    try {
        decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    }
    catch {
        res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
        return;
    }
    try {
        const userId = Number(decoded?.user_id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            res.status(401).json({ success: false, message: 'Token không chứa tài khoản hợp lệ.' });
            return;
        }
        const [rows] = await pool.query('SELECT role, status FROM users WHERE user_id = ? LIMIT 1', [userId]);
        if (rows.length === 0 || ['Suspended', 'Deleted', 'Rejected'].includes(rows[0].status)) {
            res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa hoặc không còn quyền truy cập.' });
            return;
        }
        req.user = { ...decoded, role: rows[0].role };
        next();
    }
    catch (error) {
        next(error);
    }
};
export const verifyRole = (allowedRoles) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user || !user.role) {
            res.status(403).json({ success: false, message: 'Không tìm thấy thông tin phân quyền.' });
            return;
        }
        if (!allowedRoles.includes(user.role)) {
            res.status(403).json({ success: false, message: 'Truy cập bị từ chối. Thao tác này chỉ dành cho Admin Nền tảng.' });
            return;
        }
        next();
    };
};
