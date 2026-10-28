"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
// thêm 2 import này để gửi mail
const google_auth_library_1 = require("google-auth-library");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = __importDefault(require("../../config/database.js"));
const redis_js_1 = __importDefault(require("../../config/redis.js"));
const gmail_util_js_1 = require("../../utils/gmail.util.js");
const password_util_js_1 = require("./password.util.js");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = GOOGLE_CLIENT_ID ? new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID) : null;
const JWT_SECRET = process.env.JWT_SECRET || 'vietgo_secret_key_2026';
const REGISTRATION_OTP_TTL_SECONDS = 120;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS = 30;
const PASSWORD_RESET_OTP_TTL_SECONDS = 300;
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS = 30;
const registrationOtpKey = (email) => `auth:registration-otp:${encodeURIComponent(email.toLowerCase())}`;
const registrationOtpCooldownKey = (email) => `auth:registration-otp-cooldown:${encodeURIComponent(email.toLowerCase())}`;
const passwordResetOtpKey = (email) => `auth:password-reset-otp:${encodeURIComponent(email.toLowerCase())}`;
const passwordResetOtpCooldownKey = (email) => `auth:password-reset-otp-cooldown:${encodeURIComponent(email.toLowerCase())}`;
class AuthService {
    // 1. Hàm đăng nhập bằng Google hoàn chỉnh
    async loginWithGoogle(token) {
        try {
            if (!client || !GOOGLE_CLIENT_ID) {
                throw new Error('Đăng nhập Google chưa được cấu hình. Thiếu GOOGLE_CLIENT_ID trong file .env của backend.');
            }
            // 1. Xác thực ID token do Google gửi lên
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            if (!payload || !payload.email) {
                throw new Error('Xác thực tài khoản Google thất bại!');
            }
            const email = payload.email;
            const fullName = payload.name || 'Người dùng Google';
            // 2. Tìm tài khoản theo email
            const [users] = await database_js_1.default.query('SELECT * FROM users WHERE email = ?', [email]);
            let user = users[0];
            // 3. Nếu chưa có tài khoản thì tạo Customer mới
            if (!user) {
                const generatedUsername = email.split('@')[0] + Date.now().toString().slice(-6);
                const [result] = await database_js_1.default.query(`INSERT INTO users
         (username, email, password_hash, full_name, phone, role)
         VALUES (?, ?, ?, ?, ?, ?)`, [
                    generatedUsername,
                    email,
                    null,
                    fullName,
                    null,
                    'Customer',
                ]);
                const [newUsers] = await database_js_1.default.query('SELECT * FROM users WHERE user_id = ?', [result.insertId]);
                user = newUsers[0];
            }
            // 4. Chặn tài khoản không được phép đăng nhập
            if (user.status === 'Pending Approval') {
                throw new Error('Tài khoản đang chờ quản trị viên phê duyệt.');
            }
            if (user.status === 'Rejected') {
                throw new Error('Tài khoản đã bị từ chối truy cập hệ thống.');
            }
            // 5. Tạo JWT của hệ thống VIETGO
            const jwtToken = jsonwebtoken_1.default.sign({
                user_id: user.user_id,
                email: user.email,
                role: user.role,
            }, JWT_SECRET, { expiresIn: '24h' });
            // 6. Trả token và thông tin người dùng về frontend
            return {
                token: jwtToken,
                user: {
                    user_id: user.user_id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role,
                    phone: user.phone,
                    status: user.status,
                },
            };
        }
        catch (error) {
            console.error('Lỗi Google Auth tại Service:', error.message);
            throw new Error(error.message || 'Xác thực Google thất bại');
        }
    }
    async login(identifier, password) {
        const normalizedIdentifier = identifier.trim();
        const [rows] = await database_js_1.default.query(`SELECT user_id, email, full_name, phone, role, status, password_hash
       FROM users
       WHERE email = ? OR username = ?
       ORDER BY (email = ?) DESC
       LIMIT 1`, [normalizedIdentifier, normalizedIdentifier, normalizedIdentifier.toLowerCase()]);
        const user = rows[0];
        if (!user || !(await (0, password_util_js_1.verifyPassword)(password, user.password_hash))) {
            return undefined;
        }
        const { password_hash: _passwordHash, ...safeUser } = user;
        return safeUser;
    }
    validateRegistration(data) {
        const { username, email, password, full_name, phone } = data;
        const role = data.role || 'Customer';
        if (!username || !email || !password || !full_name || !phone) {
            throw new Error('Vui lòng điền đầy đủ thông tin đăng ký.');
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email phải đúng định dạng');
        }
        const phoneRegex = /^0[0-9]{9}$/;
        if (!phoneRegex.test(phone)) {
            throw new Error('Số điện thoại phải có đúng 10 chữ số và bắt đầu bằng số 0!');
        }
        const passwordStrengthRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/;
        if (!passwordStrengthRegex.test(password)) {
            throw new Error('Mật khẩu chưa đủ mạnh! Yêu cầu: Tối thiểu 6 ký tự, có ít nhất 1 chữ cái viết hoa và 1 ký tự đặc biệt.');
        }
        if (!['Customer', 'Partner'].includes(role)) {
            throw new Error('Loại tài khoản không hợp lệ.');
        }
        if (role === 'Partner' && (!data.brand_name || !data.license_number)) {
            throw new Error('Vui lòng cung cấp tên nhà xe và số giấy phép kinh doanh.');
        }
        return {
            username: String(username).trim(),
            email: String(email).trim().toLowerCase(),
            password,
            full_name: String(full_name).trim(),
            phone: String(phone).trim(),
            role,
            brand_name: data.brand_name,
            license_number: data.license_number,
        };
    }
    async ensureEmailAvailable(email) {
        const [existingUser] = await database_js_1.default.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            throw new Error('Email này đã được sử dụng để đăng ký tài khoản!');
        }
    }
    async requestRegistrationOtp(data) {
        const registration = this.validateRegistration(data);
        await this.ensureEmailAvailable(registration.email);
        const cooldownKey = registrationOtpCooldownKey(registration.email);
        const cooldownSeconds = await redis_js_1.default.ttl(cooldownKey);
        if (cooldownSeconds > 0) {
            throw new Error(`Vui lòng đợi ${cooldownSeconds} giây trước khi gửi mã mới.`);
        }
        const otp = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const otpHash = crypto_1.default.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
        const otpKey = registrationOtpKey(registration.email);
        await redis_js_1.default.set(otpKey, JSON.stringify({ otpHash, salt, attempts: 0 }), 'EX', REGISTRATION_OTP_TTL_SECONDS);
        try {
            await (0, gmail_util_js_1.sendGmailEmail)({
                to: registration.email,
                subject: 'Mã xác minh đăng ký VIETGO',
                text: `Mã OTP đăng ký tài khoản VIETGO của bạn là ${otp}. Mã có hiệu lực trong 2 phút.`,
                html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px"><h2 style="color:#173b7a">Xác minh email VIETGO</h2><p>Nhập mã dưới đây để hoàn tất đăng ký. Mã chỉ có hiệu lực trong <b>2 phút</b>.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${otp}</div><p>Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.</p></div>`,
            });
            await redis_js_1.default.set(cooldownKey, '1', 'EX', REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS);
        }
        catch (error) {
            await redis_js_1.default.del(otpKey);
            const mailError = error instanceof Error
                ? error
                : undefined;
            console.error('Registration OTP email delivery failed:', {
                message: mailError?.message || String(error),
                code: mailError?.code,
                status: mailError?.status ?? mailError?.responseCode,
            });
            throw new Error('Không gửi được email OTP. Hãy kiểm tra log backend để biết lỗi Gmail cụ thể.');
        }
        return true;
    }
    async verifyRegistrationOtp(data) {
        const email = String(data.email || '').trim().toLowerCase();
        const otp = String(data.otp || '').trim();
        if (!email || !/^\d{6}$/.test(otp)) {
            throw new Error('Vui lòng nhập mã OTP gồm 6 chữ số.');
        }
        const otpKey = registrationOtpKey(email);
        const storedOtp = await redis_js_1.default.get(otpKey);
        if (!storedOtp) {
            throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
        }
        const otpRecord = JSON.parse(storedOtp);
        const submittedHash = crypto_1.default
            .createHash('sha256')
            .update(`${otpRecord.salt}:${otp}`)
            .digest();
        const expectedHash = Buffer.from(otpRecord.otpHash, 'hex');
        const isValid = expectedHash.length === submittedHash.length &&
            crypto_1.default.timingSafeEqual(expectedHash, submittedHash);
        if (!isValid) {
            const attempts = otpRecord.attempts + 1;
            if (attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
                await redis_js_1.default.del(otpKey);
                throw new Error('Mã OTP không đúng. Bạn đã nhập sai 5 lần, vui lòng yêu cầu mã mới.');
            }
            const remainingSeconds = await redis_js_1.default.ttl(otpKey);
            if (remainingSeconds <= 0) {
                await redis_js_1.default.del(otpKey);
                throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
            }
            await redis_js_1.default.set(otpKey, JSON.stringify({ ...otpRecord, attempts }), 'EX', remainingSeconds);
            throw new Error('Mã OTP không đúng. Vui lòng kiểm tra email và nhập lại.');
        }
        const user = await this.createRegistration(data);
        await redis_js_1.default.del(otpKey);
        return user;
    }
    async createRegistration(data) {
        const { username, email, password, full_name, phone, role } = this.validateRegistration(data);
        await this.ensureEmailAvailable(email);
        const connection = await database_js_1.default.getConnection();
        const status = role === 'Partner' ? 'Pending Approval' : 'Active';
        try {
            await connection.beginTransaction();
            const passwordHash = await (0, password_util_js_1.hashPassword)(password);
            const [userResult] = await connection.query(`INSERT INTO users
          (username, email, password_hash, full_name, phone, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [username, email, passwordHash, full_name, phone, role, status]);
            if (role === 'Partner') {
                await connection.query(`INSERT INTO partner_profiles
            (partner_id, brand_name, license_number)
           VALUES (?, ?, ?)`, [userResult.insertId, data.brand_name, data.license_number]);
            }
            await connection.commit();
            console.log(`✅ ĐĂNG KÝ THÀNH CÔNG: Tạo mới user_id [${userResult.insertId}]`);
            return {
                user_id: userResult.insertId,
                email,
                full_name,
                phone,
                role,
                status,
            };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    // --- 1. ĐỔI MẬT KHẨU KHI ĐÃ ĐĂNG NHẬP ---
    async changePassword(userId, currentPass, newPass) {
        // Tìm user
        const [rows] = await database_js_1.default.query('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
        if (rows.length === 0)
            throw new Error('Người dùng không tồn tại.');
        if (!(await (0, password_util_js_1.verifyPassword)(currentPass, rows[0].password_hash))) {
            throw new Error('Mật khẩu hiện tại không đúng.');
        }
        const passwordHash = await (0, password_util_js_1.hashPassword)(newPass);
        await database_js_1.default.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, userId]);
        return true;
    }
    // --- 2. QUÊN MẬT KHẨU (Gửi OTP qua email) ---
    async forgotPassword(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            throw new Error('Email không hợp lệ.');
        }
        const [users] = await database_js_1.default.query('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
        if (users.length === 0)
            throw new Error('Email không tồn tại trong hệ thống.');
        const cooldownKey = passwordResetOtpCooldownKey(normalizedEmail);
        const cooldownSeconds = await redis_js_1.default.ttl(cooldownKey);
        if (cooldownSeconds > 0) {
            throw new Error(`Vui lòng đợi ${cooldownSeconds} giây trước khi gửi mã mới.`);
        }
        const otp = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const otpHash = crypto_1.default.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
        const otpKey = passwordResetOtpKey(normalizedEmail);
        await redis_js_1.default.set(otpKey, JSON.stringify({ otpHash, salt, attempts: 0 }), 'EX', PASSWORD_RESET_OTP_TTL_SECONDS);
        try {
            await (0, gmail_util_js_1.sendGmailEmail)({
                to: normalizedEmail,
                subject: 'Mã OTP khôi phục mật khẩu VIETGO',
                text: `Mã OTP khôi phục mật khẩu VIETGO của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
                html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px"><h2 style="color:#173b7a">Khôi phục mật khẩu VIETGO</h2><p>Nhập mã dưới đây để đặt mật khẩu mới. Mã chỉ có hiệu lực trong <b>5 phút</b>.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${otp}</div><p>Nếu bạn không yêu cầu khôi phục mật khẩu, hãy bỏ qua email này.</p></div>`,
            });
            await redis_js_1.default.set(cooldownKey, '1', 'EX', PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS);
        }
        catch (error) {
            await redis_js_1.default.del(otpKey);
            const mailError = error instanceof Error
                ? error
                : undefined;
            console.error('Password reset OTP email delivery failed:', {
                message: mailError?.message || String(error),
                code: mailError?.code,
                status: mailError?.status ?? mailError?.responseCode,
            });
            throw new Error('Không gửi được email OTP. Hãy kiểm tra log backend để biết lỗi Gmail cụ thể.');
        }
        return true;
    }
    async resetPasswordWithOtp(email, otp, newPass) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const submittedOtp = String(otp || '').trim();
        const passwordStrengthRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            throw new Error('Email không hợp lệ.');
        }
        if (!/^\d{6}$/.test(submittedOtp)) {
            throw new Error('Vui lòng nhập mã OTP gồm 6 chữ số.');
        }
        if (typeof newPass !== 'string' || !passwordStrengthRegex.test(newPass)) {
            throw new Error('Mật khẩu chưa đủ mạnh! Yêu cầu: Tối thiểu 6 ký tự, có ít nhất 1 chữ cái viết hoa và 1 ký tự đặc biệt.');
        }
        const otpKey = passwordResetOtpKey(normalizedEmail);
        const storedOtp = await redis_js_1.default.get(otpKey);
        if (!storedOtp) {
            throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
        }
        const otpRecord = JSON.parse(storedOtp);
        const submittedHash = crypto_1.default
            .createHash('sha256')
            .update(`${otpRecord.salt}:${submittedOtp}`)
            .digest();
        const expectedHash = Buffer.from(otpRecord.otpHash, 'hex');
        const isValid = expectedHash.length === submittedHash.length &&
            crypto_1.default.timingSafeEqual(expectedHash, submittedHash);
        if (!isValid) {
            const attempts = otpRecord.attempts + 1;
            if (attempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
                await redis_js_1.default.del(otpKey);
                throw new Error('Mã OTP không đúng. Bạn đã nhập sai 5 lần, vui lòng yêu cầu mã mới.');
            }
            const remainingSeconds = await redis_js_1.default.ttl(otpKey);
            if (remainingSeconds <= 0) {
                await redis_js_1.default.del(otpKey);
                throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
            }
            await redis_js_1.default.set(otpKey, JSON.stringify({ ...otpRecord, attempts }), 'EX', remainingSeconds);
            throw new Error('Mã OTP không đúng. Vui lòng kiểm tra email và nhập lại.');
        }
        const passwordHash = await (0, password_util_js_1.hashPassword)(newPass);
        const [result] = await database_js_1.default.query(`UPDATE users
       SET password_hash = ?, reset_token = NULL, reset_token_expire = NULL
       WHERE email = ?`, [passwordHash, normalizedEmail]);
        if (result.affectedRows === 0) {
            throw new Error('Không tìm thấy tài khoản.');
        }
        await redis_js_1.default.del(otpKey, passwordResetOtpCooldownKey(normalizedEmail));
        return true;
    }
    // --- 3. ĐẶT LẠI MẬT KHẨU (Tạo pass mới từ Link) ---
    async resetPassword(token, newPass) {
        const [users] = await database_js_1.default.query('SELECT user_id, reset_token_expire FROM users WHERE reset_token = ?', [token]);
        if (users.length === 0)
            throw new Error('Đường dẫn không hợp lệ hoặc không tồn tại.');
        // Kiểm tra hết hạn
        if (Date.now() > users[0].reset_token_expire) {
            throw new Error('Đường dẫn đặt lại mật khẩu đã hết hạn.');
        }
        // Đổi mật khẩu mới và xóa token đi
        const passwordHash = await (0, password_util_js_1.hashPassword)(newPass);
        await database_js_1.default.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expire = NULL WHERE user_id = ?', [passwordHash, users[0].user_id]);
        return true;
    }
}
exports.default = new AuthService();
