import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Cấu hình ---
// Load biến môi trường từ file .env ở thư mục gốc của backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Giả sử file .env nằm ở thư mục BE
dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'transport_booking_db',
};

// Layout xe giường nằm 2 tầng, 22 phòng phổ biến
const generateSleeperBusLayout = (tripId: number) => {
    const seats = [];
    
    // Tầng 1: 11 ghế
    for (let row = 0; row < 5; row++) { // 5 hàng đầu
        seats.push({ trip_id: tripId, seat_code: `A${row*2 + 1}`, floor: 1, row: row, position: 'left', status: 'Available' });
        seats.push({ trip_id: tripId, seat_code: `A${row*2 + 2}`, floor: 1, row: row, position: 'right', status: 'Available' });
    }
    seats.push({ trip_id: tripId, seat_code: 'A11', floor: 1, row: 5, position: 'middle', status: 'Available' }); // Hàng cuối 1 ghế

    // Tầng 2: 11 ghế
    for (let row = 0; row < 5; row++) { // 5 hàng đầu
        seats.push({ trip_id: tripId, seat_code: `B${row*2 + 1}`, floor: 2, row: row, position: 'left', status: 'Available' });
        seats.push({ trip_id: tripId, seat_code: `B${row*2 + 2}`, floor: 2, row: row, position: 'right', status: 'Available' });
    }
    seats.push({ trip_id: tripId, seat_code: 'B11', floor: 2, row: 5, position: 'middle', status: 'Available' }); // Hàng cuối 1 ghế

    return seats;
};

const main = async () => {
    const tripIdArg = process.argv[2];
    if (!tripIdArg) {
        console.error('❌ Vui lòng cung cấp trip_id. Ví dụ: npx tsx scripts/generate-bus-seats.ts 1');
        process.exit(1);
    }
    const tripId = parseInt(tripIdArg, 10);
    if (isNaN(tripId)) {
        console.error('❌ trip_id phải là một con số.');
        process.exit(1);
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Kết nối CSDL thành công.');

        // THÊM BƯỚC KIỂM TRA: Đảm bảo trip_id tồn tại trước khi làm gì khác
        const [tripRows]: any = await connection.execute('SELECT trip_id FROM trips WHERE trip_id = ?', [tripId]);
        if (tripRows.length === 0) {
            console.error(`❌ Lỗi: Không tìm thấy chuyến đi nào với trip_id = ${tripId} trong cơ sở dữ liệu.`);
            process.exit(1); // Dừng script ngay lập tức
        }
        console.log(`👍 Đã tìm thấy chuyến đi với trip_id = ${tripId}. Bắt đầu xử lý...`);

        await connection.beginTransaction();

        // --- LOGIC MỚI: Xử lý khóa ngoại một cách an toàn ---
        // 1. Tìm tất cả các ghế của chuyến đi này
        const [seatsToDelete]: any = await connection.execute('SELECT seat_id FROM seats WHERE trip_id = ?', [tripId]);
        
        if (seatsToDelete.length > 0) {
            const seatIdsToDelete = seatsToDelete.map((s: any) => s.seat_id);

            // 2. Ngắt kết nối các vé đang tham chiếu đến các ghế này
            const [updateTicketsResult]: any = await connection.execute(
                'UPDATE tickets SET seat_id = NULL WHERE seat_id IN (?)',
                [seatIdsToDelete]
            );
            if (updateTicketsResult.affectedRows > 0) {
                console.log(`🔧 Đã ngắt kết nối ${updateTicketsResult.affectedRows} vé cũ.`);
            }

            // 3. Bây giờ mới xóa ghế cũ một cách an toàn
            const [deleteResult]: any = await connection.execute('DELETE FROM seats WHERE trip_id = ?', [tripId]);
            console.log(`🗑️  Đã xóa ${deleteResult.affectedRows} ghế cũ của trip_id=${tripId}.`);
        }

        const newSeats = generateSleeperBusLayout(tripId);
        console.log(`🚌 Đang sinh ${newSeats.length} ghế mới cho layout xe giường nằm...`);

        const values = newSeats.map(s => [s.trip_id, s.seat_code, s.floor, s.row, s.position, s.status]);
        const [insertResult]: any = await connection.query('INSERT INTO seats (trip_id, seat_code, floor, `row`, position, status) VALUES ?', [values]);
        console.log(`✨ Đã insert thành công ${insertResult.affectedRows} ghế mới vào CSDL.`);
        
        await connection.commit();
        console.log('✅ Hoàn tất! Dữ liệu ghế đã được cập nhật.');

    } catch (error) {
        console.error('❌ Đã xảy ra lỗi:', error);
        if (connection) await connection.rollback();
    } finally {
        if (connection) await connection.end();
    }
};

main();