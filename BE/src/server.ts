import app from './app.js';
import pool from './config/database.js';
import './config/redis.js'; // Chạy file redis.ts để kích hoạt kết nối

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Kiểm tra kết nối Database trước khi bật server
    const connection = await pool.getConnection();
    console.log('✅ Đã kết nối tới MySQL Database (transport_booking_db) thành công!');
    connection.release();

    // Khởi chạy server
    app.listen(PORT, () => {
      console.log(`🚀 VIETGO Server đang chạy tại: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Khởi động Server thất bại. Lỗi kết nối Database:', error);
    process.exit(1);
  }
};

startServer();