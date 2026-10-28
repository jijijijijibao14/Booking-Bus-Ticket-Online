import 'dotenv/config';

import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import cors, {
  type CorsOptions,
} from 'cors';

import { authRouter } from './modules/auth/auth.route.js';
import { userRouter } from './modules/users/user.route.js';

import bookingRoutes from './modules/bookings/booking.route.js';
import tripRoutes from './modules/trips/trip.route.js';
import adminRoutes from './modules/admin/admin.route.js';
import paymentRoutes from './modules/payments/payment.route.js';
import merchantRoutes from './modules/merchant/merchant.route.js';
import communicationsRoutes from './modules/communications/communications.route.js';
import feedbackRoutes from './modules/feedback/feedback.route.js';
import { gmailRouter } from './modules/gmail/gmail.route.js';

const app: Application = express();

/*
 * Cho phép Express đọc đúng IP khi chạy qua:
 * - ngrok
 * - Cloudflare Tunnel
 * - reverse proxy
 * - x-forwarded-for
 */
app.set('trust proxy', 1);

/*
 * Các frontend được phép gọi backend.
 */
const allowedOrigins = new Set<string>([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

if (process.env.FRONTEND_URL) {
  allowedOrigins.add(
    process.env.FRONTEND_URL.replace(/\/+$/, ''),
  );
}

if (process.env.FRONTEND_TUNNEL_URL) {
  allowedOrigins.add(
    process.env.FRONTEND_TUNNEL_URL.replace(/\/+$/, ''),
  );
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    /*
     * Request không có Origin:
     * - Postman
     * - curl
     * - VNPay IPN server-to-server
     */
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    /*
     * Chỉ mở tunnel động trong môi trường development.
     */
    const isDevelopmentTunnel =
      process.env.NODE_ENV !== 'production' &&
      (
        /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(
          origin,
        ) ||
        /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/i.test(
          origin,
        ) ||
        /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i.test(
          origin,
        )
      );

    if (isDevelopmentTunnel) {
      callback(null, true);
      return;
    }

    console.warn(
      `CORS blocked origin: ${origin}`,
    );

    callback(
      new Error(
        `Origin không được phép truy cập backend: ${origin}`,
      ),
    );
  },

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
  ],

  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/*
 * Middleware đọc request body.
 */
app.use(
  express.json({
    limit: '2mb',
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb',
  }),
);

/*
 * Log request để kiểm tra local, tunnel và VNPay.
 */
app.use(
  (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    console.log(
      `[${new Date().toLocaleTimeString('vi-VN')}] ` +
        `${req.method} ${req.originalUrl}`,
    );

    next();
  },
);

/*
 * Route kiểm tra backend.
 */
app.get(
  '/',
  (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message:
        'VIETGO Backend API đang hoạt động.',
    });
  },
);

app.get(
  '/api/health',
  (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      service: 'VIETGO Backend',
      timestamp: new Date().toISOString(),
    });
  },
);

/*
 * Đăng ký toàn bộ API routes.
 *
 * Một số route trong project có thể được export
 * qua default theo cấu trúc module khác nhau,
 * nên giữ cách lấy .default để tương thích.
 */
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use(gmailRouter);

app.use(
  '/api/trips',
  (tripRoutes as any).default ||
    tripRoutes,
);

app.use(
  '/api/bookings',
  (bookingRoutes as any).default ||
    bookingRoutes,
);

app.use(
  '/api/admin',
  (adminRoutes as any).default ||
    adminRoutes,
);

app.use(
  '/api/payments',
  (paymentRoutes as any).default ||
    paymentRoutes,
);

app.use(
  '/api/merchant',
  (merchantRoutes as any).default ||
    merchantRoutes,
);

app.use('/api/communications', communicationsRoutes);
app.use('/api/feedback', feedbackRoutes);

console.log(
  '✅ Đã đăng ký API: ' +
    '/api/auth, ' +
    '/api/users, ' +
    '/api/trips, ' +
    '/api/bookings, ' +
    '/api/admin, ' +
    '/api/payments, ' +
    '/api/merchant, ' +
    '/api/communications, ' +
    '/api/feedback, ' +
    '/api/gmail',
);

/*
 * API không tồn tại.
 * Phải đặt sau toàn bộ API routes.
 */
app.use(
  (req: Request, res: Response) => {
    return res.status(404).json({
      success: false,
      message:
        `Không tìm thấy API: ` +
        `${req.method} ${req.originalUrl}`,
    });
  },
);

/*
 * Error handler cuối cùng.
 */
app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(
      'Application error:',
      error,
    );

    if (
      error.message.includes(
        'Origin không được phép truy cập backend',
      )
    ) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Đã xảy ra lỗi hệ thống.',
    });
  },
);

export default app;