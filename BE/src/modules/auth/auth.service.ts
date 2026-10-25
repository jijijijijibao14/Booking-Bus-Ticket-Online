import crypto from 'crypto';
import nodemailer from 'nodemailer';
// thêm 2 import này để gửi mail
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import pool from '../../config/database.js';
import redisClient from '../../config/redis.js';
import { hashPassword, verifyPassword } from './password.util.js';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('Thiếu GOOGLE_CLIENT_ID trong file .env của backend!');
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'vietgo_secret_key_2026';
const REGISTRATION_OTP_TTL_SECONDS = 120;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS = 30;

const registrationOtpKey = (email: string) =>
  `auth:registration-otp:${encodeURIComponent(email.toLowerCase())}`;

const registrationOtpCooldownKey = (email: string) =>
  `auth:registration-otp-cooldown:${encodeURIComponent(email.toLowerCase())}`;
  class AuthService {
  
  // 1. Hàm đăng nhập bằng Google hoàn chỉnh
  
async loginWithGoogle(token: string) {
  try {
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
    const [users]: any = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    let user = users[0];

    // 3. Nếu chưa có tài khoản thì tạo Customer mới
    if (!user) {
      const generatedUsername =
        email.split('@')[0] + Date.now().toString().slice(-6);

      const [result]: any = await pool.query(
        `INSERT INTO users
         (username, email, password_hash, full_name, phone, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          generatedUsername,
          email,
          null,
          fullName,
          null,
          'Customer',
        ]
      );

      const [newUsers]: any = await pool.query(
        'SELECT * FROM users WHERE user_id = ?',
        [result.insertId]
      );

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
    const jwtToken = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

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
  } catch (error: any) {
    console.error('Lỗi Google Auth tại Service:', error.message);
    throw new Error(error.message || 'Xác thực Google thất bại');
  }
}

  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim();
    const [rows]: any = await pool.query(
      `SELECT user_id, email, full_name, phone, role, status, password_hash
       FROM users
       WHERE email = ? OR username = ?
       ORDER BY (email = ?) DESC
       LIMIT 1`,
      [normalizedIdentifier, normalizedIdentifier, normalizedIdentifier.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return undefined;
    }

    const { password_hash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private validateRegistration(data: any) {
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
      throw new Error(
        'Mật khẩu chưa đủ mạnh! Yêu cầu: Tối thiểu 6 ký tự, có ít nhất 1 chữ cái viết hoa và 1 ký tự đặc biệt.'
      );
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

  private async ensureEmailAvailable(email: string) {
    const [existingUser]: any = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      throw new Error('Email này đã được sử dụng để đăng ký tài khoản!');
    }
  }

  async requestRegistrationOtp(data: any) {
    const registration = this.validateRegistration(data);
    await this.ensureEmailAvailable(registration.email);

    const cooldownKey = registrationOtpCooldownKey(registration.email);
    const cooldownSeconds = await redisClient.ttl(cooldownKey);
    if (cooldownSeconds > 0) {
      throw new Error(`Vui lòng đợi ${cooldownSeconds} giây trước khi gửi mã mới.`);
    }

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
    const otpKey = registrationOtpKey(registration.email);

    await redisClient.set(
      otpKey,
      JSON.stringify({ otpHash, salt, attempts: 0 }),
      'EX',
      REGISTRATION_OTP_TTL_SECONDS
    );

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: `"VIETGO" <${process.env.EMAIL_USER}>`,
        to: registration.email,
        subject: 'Mã xác minh đăng ký VIETGO',
        text: `Mã OTP đăng ký tài khoản VIETGO của bạn là ${otp}. Mã có hiệu lực trong 2 phút.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px"><h2 style="color:#173b7a">Xác minh email VIETGO</h2><p>Nhập mã dưới đây để hoàn tất đăng ký. Mã chỉ có hiệu lực trong <b>2 phút</b>.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${otp}</div><p>Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.</p></div>`,
      });

      await redisClient.set(
        cooldownKey,
        '1',
        'EX',
        REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS
      );
    } catch {
      await redisClient.del(otpKey);
      throw new Error('Không gửi được email OTP. Vui lòng thử lại sau.');
    }

    return true;
  }

  async verifyRegistrationOtp(data: any) {
    const email = String(data.email || '').trim().toLowerCase();
    const otp = String(data.otp || '').trim();
    if (!email || !/^\d{6}$/.test(otp)) {
      throw new Error('Vui lòng nhập mã OTP gồm 6 chữ số.');
    }

    const otpKey = registrationOtpKey(email);
    const storedOtp = await redisClient.get(otpKey);
    if (!storedOtp) {
      throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
    }

    const otpRecord = JSON.parse(storedOtp) as {
      otpHash: string;
      salt: string;
      attempts: number;
    };
    const submittedHash = crypto
      .createHash('sha256')
      .update(`${otpRecord.salt}:${otp}`)
      .digest();
    const expectedHash = Buffer.from(otpRecord.otpHash, 'hex');
    const isValid = expectedHash.length === submittedHash.length &&
      crypto.timingSafeEqual(expectedHash, submittedHash);

    if (!isValid) {
      const attempts = otpRecord.attempts + 1;
      if (attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
        await redisClient.del(otpKey);
        throw new Error('Mã OTP không đúng. Bạn đã nhập sai 5 lần, vui lòng yêu cầu mã mới.');
      }

      const remainingSeconds = await redisClient.ttl(otpKey);
      if (remainingSeconds <= 0) {
        await redisClient.del(otpKey);
        throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.');
      }

      await redisClient.set(
        otpKey,
        JSON.stringify({ ...otpRecord, attempts }),
        'EX',
        remainingSeconds
      );
      throw new Error('Mã OTP không đúng. Vui lòng kiểm tra email và nhập lại.');
    }

    const user = await this.createRegistration(data);
    await redisClient.del(otpKey);
    return user;
  }

  private async createRegistration(data: any) {
    const { username, email, password, full_name, phone, role } =
      this.validateRegistration(data);
    await this.ensureEmailAvailable(email);

    const connection = await pool.getConnection();
    const status = role === 'Partner' ? 'Pending Approval' : 'Active';

    try {
      await connection.beginTransaction();

      const passwordHash = await hashPassword(password);
      const [userResult]: any = await connection.query(
        `INSERT INTO users
          (username, email, password_hash, full_name, phone, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, email, passwordHash, full_name, phone, role, status],
      );

      if (role === 'Partner') {
        await connection.query(
          `INSERT INTO partner_profiles
            (partner_id, brand_name, license_number)
           VALUES (?, ?, ?)`,
          [userResult.insertId, data.brand_name, data.license_number],
        );
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
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  // --- 1. ĐỔI MẬT KHẨU KHI ĐÃ ĐĂNG NHẬP ---
  async changePassword(userId: number, currentPass: string, newPass: string) {
    // Tìm user
    const [rows]: any = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) throw new Error('Người dùng không tồn tại.');
    if (!(await verifyPassword(currentPass, rows[0].password_hash))) {
      throw new Error('Mật khẩu hiện tại không đúng.');
    }

    const passwordHash = await hashPassword(newPass);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE user_id = ?',
      [passwordHash, userId]
    );

    return true;
  }

  // --- 2. QUÊN MẬT KHẨU (Gửi Email Link) ---
  async forgotPassword(email: string) {
    const [users]: any = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (users.length === 0) throw new Error('Email không tồn tại trong hệ thống.');

    // Tạo token ngẫu nhiên và thời hạn 15 phút
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expireTime = Date.now() + 15 * 60 * 1000; 
// const expireTime = Date.now() + 15 * 1000; 
    // Lưu token vào DB
    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expire = ? WHERE email = ?',
      [resetToken, expireTime, email]
    );

    // Cấu hình gửi Email 
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
      }
    });

    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;
    
    // Giao diện Email 
    const mailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; text-align: center;">Khôi Phục Mật Khẩu - VIETGO</h2>
        <p>Chào bạn,</p>
        <p>Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng bấm vào nút bên dưới để tiến hành đổi mật khẩu mới:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #ea580c; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Đổi Mật Khẩu Ngay</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">Đường liên kết này có hiệu lực trong vòng <b>15 phút</b>. Nếu bạn không yêu cầu đổi mật khẩu, vui lòng bỏ qua email này.</p>
      </div>
    `;

    await transporter.sendMail({
      from: '"VIETGO Hệ Thống" <no-reply@vietgo.com>',
      to: email,
      subject: 'Yêu cầu đặt lại mật khẩu - VIETGO',
      html: mailContent
    });

    return true;
  }

  // --- 3. ĐẶT LẠI MẬT KHẨU (Tạo pass mới từ Link) ---
  async resetPassword(token: string, newPass: string) {
    const [users]: any = await pool.query(
      'SELECT user_id, reset_token_expire FROM users WHERE reset_token = ?',
      [token]
    );

    if (users.length === 0) throw new Error('Đường dẫn không hợp lệ hoặc không tồn tại.');
    
    // Kiểm tra hết hạn
    if (Date.now() > users[0].reset_token_expire) {
      throw new Error('Đường dẫn đặt lại mật khẩu đã hết hạn.');
    }

    // Đổi mật khẩu mới và xóa token đi
    const passwordHash = await hashPassword(newPass);
    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expire = NULL WHERE user_id = ?',
      [passwordHash, users[0].user_id]
    );

    return true;
  }
}

export default new AuthService();