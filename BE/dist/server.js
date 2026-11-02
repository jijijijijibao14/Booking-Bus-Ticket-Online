import app from './app.js';
import pool from './config/database.js';
import './config/redis.js'; // Chạy file redis.ts để kích hoạt kết nối
import merchantService from './modules/merchant/merchant.service.js';
const PORT = process.env.PORT || 3001;
const TRIP_STATUS_REFRESH_INTERVAL_MS = 60_000;
let tripStatusRefreshInProgress = false;
const refreshTripStatuses = async () => {
    if (tripStatusRefreshInProgress)
        return;
    tripStatusRefreshInProgress = true;
    try {
        await merchantService.refreshAllTripStatuses();
    }
    catch (error) {
        console.error('Could not automatically refresh trip statuses:', error);
    }
    finally {
        tripStatusRefreshInProgress = false;
    }
};
const startServer = async () => {
    try {
        // Kiểm tra kết nối Database trước khi bật server
        const connection = await pool.getConnection();
        console.log(`✅ Đã kết nối tới MySQL Database (${process.env.DB_NAME || 'booking'}) thành công!`);
        connection.release();
        void refreshTripStatuses();
        const tripStatusRefreshTimer = setInterval(() => void refreshTripStatuses(), TRIP_STATUS_REFRESH_INTERVAL_MS);
        tripStatusRefreshTimer.unref();
        // Khởi chạy server
        app.listen(PORT, () => {
            console.log(`🚀 VIETGO Server đang chạy tại: http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Khởi động Server thất bại. Lỗi kết nối Database:', error);
        process.exit(1);
    }
};
startServer();
