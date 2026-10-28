import app from './app.js';
import pool from './config/database.js';
import './config/redis.js'; // Chạy file redis.ts để kích hoạt kết nối
import merchantService from './modules/merchant/merchant.service.js';
const PORT = process.env.PORT || 3001;
const TRIP_COMPLETION_CHECK_INTERVAL_MS = 60_000;
const startServer = async () => {
    try {
        // Kiểm tra kết nối Database trước khi bật server
        const connection = await pool.getConnection();
        console.log(`✅ Đã kết nối tới MySQL Database (${process.env.DB_NAME || 'booking'}) thành công!`);
        connection.release();
        // Khởi chạy server
        app.listen(PORT, () => {
            console.log(`🚀 VIETGO Server đang chạy tại: http://localhost:${PORT}`);
        });
        let completionCheckRunning = false;
        const checkCompletedTrips = async () => {
            if (completionCheckRunning)
                return;
            completionCheckRunning = true;
            try {
                await merchantService.processCompletedTrips();
            }
            catch (error) {
                console.error('❌ Không thể quyết toán các chuyến đã hoàn thành:', error);
            }
            finally {
                completionCheckRunning = false;
            }
        };
        void checkCompletedTrips();
        setInterval(() => void checkCompletedTrips(), TRIP_COMPLETION_CHECK_INTERVAL_MS);
    }
    catch (error) {
        console.error('❌ Khởi động Server thất bại. Lỗi kết nối Database:', error);
        console.error('Kiểm tra MySQL đang chạy, database đã được tạo và DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME trong BE/.env.');
        process.exit(1);
    }
};
startServer();
