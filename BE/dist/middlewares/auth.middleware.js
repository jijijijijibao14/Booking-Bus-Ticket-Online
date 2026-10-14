import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'vietgo_secret_key_2026';
export const verifyToken = (req, res, next) => {
    // FE sẽ gửi token qua header: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // console.warn(`[Auth] Missing or malformed Authorization header on ${req.method} ${req.url}`);
        res.status(403).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện chức năng này.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Lưu thông tin user vào request (chứa user_id)
        // console.log('[Auth] Decoded user payload:', decoded);
        next();
    }
    catch (error) {
        // console.warn('[Auth] Token verification failed:', error);
        res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
};
// Middleware kiểm tra Quyền (Role) - Phục vụ RBAC
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
