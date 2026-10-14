import redisClient from '../../config/redis.js';
import pool from '../../config/database.js';
import { generateQRCode } from '../../utils/qrcode.util.js';
import { generateTrainSeats, getTempIdToSeatNumberMap } from '../trips/train-layout.util.js';
import { CustomError } from '../../utils/customError.js';
const LOCK_EXPIRE_MS = 10 * 60 * 1000; // Khóa ghế trong 10 phút
export class BookingService {
    async holdSingleSeat(tripId, seatId, userId) {
        const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
        const result = await redisClient.set(lockKey, userId.toString(), 'PX', LOCK_EXPIRE_MS, 'NX');
        if (result !== 'OK') {
            throw new Error(`Ghế ID ${seatId} vừa có người khác chọn.`);
        }
        return true;
    }
    async releaseSingleSeat(tripId, seatId, userId) {
        const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
        // Đảm bảo chỉ người dùng đã khóa ghế mới có thể mở khóa
        const lockedBy = await redisClient.get(lockKey);
        if (lockedBy === userId.toString()) {
            await redisClient.del(lockKey);
            return true;
        }
        return false;
    }
    /**
     * Hàm hỗ trợ: Mở khóa Redis
     */
    async unlockSeats(tripId, seatIds, userId) {
        for (const seatId of seatIds) {
            const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
            const lockedBy = await redisClient.get(lockKey);
            if (lockedBy === userId.toString()) {
                await redisClient.del(lockKey);
            }
        }
    }
    /**
     * Khóa dòng user và trừ tiền ví trong cùng transaction.
     * Nếu bất kỳ bước đặt vé nào phía sau thất bại, transaction rollback
     * sẽ hoàn tác luôn việc trừ tiền.
     */
    async debitWallet(connection, userId, amount) {
        const normalizedAmount = Number(amount);
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            throw new CustomError('Số tiền thanh toán không hợp lệ.', 400);
        }
        const [userRows] = await connection.query(`SELECT user_id, wallet_balance
       FROM users
       WHERE user_id = ?
       FOR UPDATE`, [userId]);
        if (userRows.length === 0) {
            throw new CustomError('Không tìm thấy tài khoản người dùng.', 404);
        }
        const balanceBefore = Number(userRows[0].wallet_balance || 0);
        if (balanceBefore < normalizedAmount) {
            throw new CustomError(`Số dư ví không đủ. Số dư hiện tại: ${balanceBefore.toLocaleString('vi-VN')}₫.`, 400);
        }
        const balanceAfter = balanceBefore - normalizedAmount;
        const [updateResult] = await connection.query(`UPDATE users
       SET wallet_balance = ?
       WHERE user_id = ?`, [balanceAfter, userId]);
        if (updateResult.affectedRows !== 1) {
            throw new Error('Không thể cập nhật số dư ví.');
        }
        return {
            balanceBefore,
            balanceAfter,
        };
    }
    /**
     * Ghi lịch sử biến động số dư ví trong CÙNG transaction với booking.
     * Nếu transaction rollback thì wallet_transactions cũng rollback.
     *
     * Quy ước:
     * - PAYMENT: amount âm
     * - REFUND: amount dương
     * - ADJUSTMENT: có thể âm hoặc dương
     */
    async recordWalletTransaction(connection, params) {
        const { userId, bookingId = null, relatedBookingId = null, transactionType, amount, balanceBefore, balanceAfter, referenceCode = null, description = null, } = params;
        const normalizedAmount = Number(amount);
        const normalizedBalanceBefore = Number(balanceBefore);
        const normalizedBalanceAfter = Number(balanceAfter);
        if (!Number.isFinite(normalizedAmount) ||
            !Number.isFinite(normalizedBalanceBefore) ||
            !Number.isFinite(normalizedBalanceAfter)) {
            throw new Error('Dữ liệu giao dịch ví không hợp lệ.');
        }
        const [result] = await connection.query(`INSERT INTO wallet_transactions (
          user_id,
          booking_id,
          related_booking_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_code,
          description
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            userId,
            bookingId,
            relatedBookingId,
            transactionType,
            normalizedAmount,
            normalizedBalanceBefore,
            normalizedBalanceAfter,
            referenceCode,
            description,
        ]);
        if (result.affectedRows !== 1) {
            throw new Error('Không thể ghi lịch sử giao dịch ví.');
        }
        return result.insertId;
    }
    /**
     * Cộng tiền hoàn vào ví + ghi wallet_transactions trong CÙNG transaction.
     * Có kiểm tra ledger REFUND trước khi cộng để chống hoàn tiền hai lần.
     */
    async creditWalletRefund(connection, params) {
        const { userId, bookingId, refundAmount, bookingCode, description, } = params;
        const normalizedRefundAmount = Number(refundAmount);
        if (!Number.isFinite(normalizedRefundAmount) ||
            normalizedRefundAmount <= 0) {
            throw new CustomError('Số tiền hoàn không hợp lệ.', 400);
        }
        // Defense-in-depth: booking chỉ được có 1 REFUND ledger.
        const [existingRefundTransactions] = await connection.query(`SELECT wallet_transaction_id
       FROM wallet_transactions
       WHERE booking_id = ?
         AND transaction_type = 'REFUND'
       LIMIT 1
       FOR UPDATE`, [bookingId]);
        if (existingRefundTransactions.length > 0) {
            throw new CustomError(`Booking ${bookingCode} đã được hoàn tiền trước đó.`, 409);
        }
        // Khóa dòng user để cập nhật số dư an toàn khi có request đồng thời.
        const [userRows] = await connection.query(`SELECT user_id, wallet_balance
       FROM users
       WHERE user_id = ?
       FOR UPDATE`, [userId]);
        if (userRows.length === 0) {
            throw new CustomError('Không tìm thấy tài khoản người dùng.', 404);
        }
        const balanceBefore = Number(userRows[0].wallet_balance || 0);
        const balanceAfter = balanceBefore + normalizedRefundAmount;
        const [updateResult] = await connection.query(`UPDATE users
       SET wallet_balance = ?
       WHERE user_id = ?`, [balanceAfter, userId]);
        if (updateResult.affectedRows !== 1) {
            throw new Error('Không thể cập nhật số dư ví khi hoàn tiền.');
        }
        await this.recordWalletTransaction(connection, {
            userId,
            bookingId,
            transactionType: 'REFUND',
            amount: normalizedRefundAmount,
            balanceBefore,
            balanceAfter,
            referenceCode: bookingCode,
            description: description ||
                `Hoàn tiền booking ${bookingCode} vào Ví ViệtGo`,
        });
        return {
            balanceBefore,
            balanceAfter,
        };
    }
    /**
     * Nhả Redis lock cho một payload xe khách.
     * Dùng sau commit hoặc rollback để không để ghế bị giữ đến hết TTL.
     */
    async unlockBusPayloadSeats(payload, userId) {
        if (payload.vehicleType === 'Bus' &&
            Array.isArray(payload.seatIds) &&
            payload.seatIds.length > 0) {
            await this.unlockSeats(payload.tripId, payload.seatIds, userId);
        }
    }
    /**
     * Hoàn trả tài nguyên ghế/slot của một booking.
     * Hàm này chỉ thay đổi inventory, không cộng tiền ví.
     */
    async releaseBookingInventory(connection, bookingId, vehicleType) {
        if (vehicleType === 'Bus' || vehicleType === 'Train') {
            const [tickets] = await connection.query(`SELECT seat_id
         FROM tickets
         WHERE booking_id = ?`, [bookingId]);
            const seatIdsToRelease = tickets
                .map((ticket) => ticket.seat_id)
                .filter(Boolean);
            if (seatIdsToRelease.length > 0) {
                await connection.query(`UPDATE seats
           SET status = 'Available'
           WHERE seat_id IN (?)
             AND status = 'Booked'`, [seatIdsToRelease]);
            }
            return;
        }
        const [ticketGroups] = await connection.query(`SELECT class_id, COUNT(ticket_id) AS num_tickets
       FROM tickets
       WHERE booking_id = ?
         AND class_id IS NOT NULL
       GROUP BY class_id`, [bookingId]);
        for (const ticketGroup of ticketGroups) {
            await connection.query(`UPDATE flight_ticket_classes
         SET available_slots = available_slots + ?
         WHERE class_id = ?`, [ticketGroup.num_tickets, ticketGroup.class_id]);
        }
    }
    /**
     * BƯỚC 2: XÁC NHẬN THANH TOÁN VÀ GHI XUỐNG DATABASE (TRANSACTION)
     */
    async _executeBookingLeg(connection, userId, payload) {
        let { tripId, vehicleType, seatIds, classId, contactInfo, passengers, totalAmount } = payload;
        const originalTripIdForLock = tripId;
        const paymentMethod = payload.paymentMethod ?? 'Wallet';
        const bookingPaymentStatus = paymentMethod === 'VNPAY' ? 'Pending' : 'Paid';
        if ((vehicleType === 'Bus' || vehicleType === 'Train') && (!seatIds || seatIds.length === 0)) {
            throw new Error('Yêu cầu đặt vé không hợp lệ: Vui lòng chọn ít nhất một ghế.');
        }
        // 1. XÁC MINH KHÓA GHẾ (CHỈ ÁP DỤNG CHO XE KHÁCH)
        // Kiểm tra xem người dùng hiện tại có đang giữ các ghế đã chọn không. Đối với tàu hỏa và máy bay,
        // việc kiểm tra xung đột được xử lý ở bước cập nhật CSDL cuối cùng.
        if (vehicleType === 'Bus' && seatIds) {
            for (const seatId of seatIds) {
                const lockKey = `lock:trip:${originalTripIdForLock}:seat:${seatId}`;
                const lockedBy = await redisClient.get(lockKey);
                if (lockedBy !== userId.toString()) {
                    throw new Error(`Ghế ID ${seatId} không được bạn giữ hoặc đã hết hạn giữ chỗ. Vui lòng chọn lại.`);
                }
            }
        }
        // XỬ LÝ THUẬT TOÁN ĐỊNH DANH "TRIP_ID CHUỖI" (JIT Physicalization)
        if (typeof tripId === 'string' && tripId.startsWith('MOCK|')) {
            const parts = tripId.split('|'); // MOCK | TYPE | CODE | FROM | TO | DATE | TIME
            const vType = parts[1];
            const vCode = parts[2];
            const from = parts[3];
            const to = parts[4];
            const timeFromId = parts[6].replace('-', ':'); // Chuyển đổi HH-mm ngược lại thành HH:mm
            const depDateTime = `${parts[5]} ${timeFromId}:00`;
            // VALIDATION: Không cho đặt vé chuyến đi đã khởi hành
            if (new Date(depDateTime) < new Date()) {
                throw new Error('Chuyến đi đã khởi hành. Không thể đặt vé.');
            }
            // CẢI TIẾN: Suy luận tên phương tiện thật TRƯỚC KHI truy vấn
            let vehicleNameToFind;
            if (vehicleType === 'Train') {
                vehicleNameToFind = 'Đường sắt Việt Nam';
            }
            else if (vehicleType === 'Flight') {
                const prefix = vCode.substring(0, 2).toUpperCase();
                if (prefix === 'VN')
                    vehicleNameToFind = 'Vietnam Airlines';
                else if (prefix === 'VJ')
                    vehicleNameToFind = 'VietJet Air';
                else if (prefix === 'QH')
                    vehicleNameToFind = 'Bamboo Airways';
                else
                    throw new Error(`Không nhận dạng được hãng bay từ mã chuyến ${vCode}.`);
            }
            else {
                vehicleNameToFind = vCode;
            }
            // Kiểm tra xem chuyến đi vãng lai này đã được "vật lý hóa" trước đó chưa
            const [existingTrips] = await connection.query(`SELECT trip_id FROM trips t 
           JOIN routes r ON t.route_id = r.route_id 
           JOIN vehicles v ON t.vehicle_id = v.vehicle_id
           WHERE v.vehicle_name = ? AND t.departure_time = ? AND r.departure_location = ? AND r.arrival_location = ? AND r.vehicle_type = ?`, [vehicleNameToFind, depDateTime, from, to, vehicleType]);
            if (existingTrips.length > 0) {
                tripId = existingTrips[0].trip_id;
                // CẢI TIẾN: Nếu trip đã tồn tại, phải tìm classId tương ứng cho chuyến bay
                if (vehicleType === 'Flight') {
                    const [classRows] = await connection.query(`SELECT class_id FROM flight_ticket_classes WHERE trip_id = ? AND class_type = 'Economy' LIMIT 1`, [tripId]);
                    if (classRows.length > 0) {
                        classId = classRows[0].class_id;
                    }
                    else {
                        // Trường hợp hiếm: trip có nhưng class không có -> tạo mới để đảm bảo logic
                        const [newClass] = await connection.query(`INSERT INTO flight_ticket_classes (trip_id, class_type, total_slots, available_slots, price_markup) 
                VALUES (?, 'Economy', 100, 100, 0)`, [tripId]);
                        classId = newClass.insertId;
                    }
                }
            }
            else {
                // Nếu chưa có, tạo Route và Trip vật lý
                // FIX: Tìm route, nếu không có thì tự động tạo (đúng với tinh thần JIT)
                const [routeRows] = await connection.query(`SELECT route_id FROM routes WHERE departure_location = ? AND arrival_location = ? AND vehicle_type = ?`, [from, to, vehicleType]);
                let routeId;
                if (routeRows.length > 0) {
                    routeId = routeRows[0].route_id;
                }
                else {
                    const [newRoute] = await connection.query(`INSERT INTO routes (departure_location, arrival_location, vehicle_type) VALUES (?, ?, ?)`, [from, to, vehicleType]);
                    routeId = newRoute.insertId;
                }
                const [vehicleRows] = await connection.query(`SELECT vehicle_id FROM vehicles WHERE vehicle_name = ? AND vehicle_type = ?`, [vehicleNameToFind, vehicleType]);
                let vehicleId;
                if (vehicleRows.length > 0) {
                    vehicleId = vehicleRows[0].vehicle_id;
                }
                else {
                    // JIT: Tự động tạo vehicle nếu chưa có
                    const defaultSeats = vehicleType === 'Train' ? 400 : 180; // Số ghế mặc định cho mục đích tham khảo
                    const [newVehicle] = await connection.query(`INSERT INTO vehicles (partner_id, vehicle_name, vehicle_type, total_seats) VALUES (?, ?, ?, ?)`, [null, vehicleNameToFind, vehicleType, defaultSeats]);
                    vehicleId = newVehicle.insertId;
                }
                const arrivalTime = new Date(new Date(depDateTime).getTime() + (vehicleType === 'Train' ? 12 : 2) * 60 * 60 * 1000);
                const basePrice = payload.passengers?.[0]?.price || payload.totalAmount / (payload.passengers?.length || 1);
                const [newTrip] = await connection.query(`INSERT INTO trips (route_id, vehicle_id, departure_time, arrival_time, base_price, status) 
             VALUES (?, ?, ?, ?, ?, 'Scheduled')`, [routeId, vehicleId, depDateTime, arrivalTime, basePrice] // Sử dụng ID thật
                );
                tripId = newTrip.insertId;
                // Nếu là máy bay, cần tạo thêm các hạng vé (classes) ảo trong DB để khớp khóa ngoại
                if (vehicleType === 'Flight') {
                    const [newClass] = await connection.query(`INSERT INTO flight_ticket_classes (trip_id, class_type, total_slots, available_slots, price_markup) 
                VALUES (?, 'Economy', 100, 100, 0)`, [tripId]);
                    classId = newClass.insertId; // Gán classId mới tạo
                }
                // FIX: Nếu là tàu hỏa, "vật lý hóa" toàn bộ ghế ngồi cho chuyến đi mới này
                else if (vehicleType === 'Train') {
                    const seatNumbers = generateTrainSeats('seat_number_only');
                    const seatInsertData = seatNumbers.map(seatNumber => [tripId, seatNumber, 'Available']);
                    // Bulk insert toàn bộ ghế vào DB cho chuyến đi mới
                    if (seatInsertData.length > 0) {
                        await connection.query('INSERT INTO seats (trip_id, seat_code, status) VALUES ?', [seatInsertData]);
                    }
                }
            }
        }
        // VALIDATION: Đối với các chuyến đi thật (Bus), kiểm tra lại thời gian khởi hành
        else if (typeof tripId === 'number') {
            const [tripRows] = await connection.query(`SELECT departure_time FROM trips WHERE trip_id = ? AND departure_time > NOW()`, [tripId]);
            if (tripRows.length === 0) {
                throw new Error('Chuyến đi đã khởi hành hoặc không tồn tại. Không thể đặt vé.');
            }
        }
        // Sinh mã PNR (Booking Code) ngẫu nhiên 6 ký tự
        const bookingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        // 2. Insert vào bảng `bookings`.
        // Wallet => Paid ngay sau khi đã khóa/trừ ví trong transaction.
        // VNPAY  => Pending, PaymentService sẽ cập nhật Paid sau khi xác nhận giao dịch.
        const [bookingResult] = await connection.query(`INSERT INTO bookings (
            user_id,
            contact_full_name,
            contact_email,
            contact_phone,
            booking_code,
            total_amount,
            payment_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            userId,
            contactInfo.fullName,
            contactInfo.email,
            contactInfo.phone,
            bookingCode,
            totalAmount,
            bookingPaymentStatus,
        ]);
        // Thêm kiểm tra để đảm bảo booking được tạo
        if (bookingResult.affectedRows !== 1) {
            throw new Error('Không thể tạo đơn hàng chính.');
        }
        const bookingId = bookingResult.insertId;
        // FIX: Khai báo map ở scope cao hơn để có thể truy cập ở bước 4
        const passengerToRealSeatIdMap = new Map();
        // FIX: Khai báo wasMockTrainTrip ở scope cao hơn để có thể truy cập ở nhiều nơi.
        // Biến này dùng để xác định xem đây có phải là luồng đặt vé cho chuyến tàu được sinh tự động (JIT) hay không.
        const wasMockTrainTrip = typeof originalTripIdForLock === 'string' && vehicleType === 'Train';
        // 3. Logic Đa Hình (Polymorphism) Xử lý theo Phương tiện
        if (vehicleType === 'Flight') {
            // MÁY BAY: Kiểm tra và trừ lùi vé trống
            const [classRows] = await connection.query(`SELECT available_slots FROM flight_ticket_classes WHERE class_id = ? FOR UPDATE`, [classId]);
            if (classRows.length === 0 || classRows[0].available_slots < passengers.length) {
                throw new Error('Không đủ ghế trống cho hạng vé máy bay này.');
            }
            await connection.query(`UPDATE flight_ticket_classes SET available_slots = available_slots - ? WHERE class_id = ?`, [passengers.length, classId]);
        }
        else { // Logic cho Xe khách và Tàu hỏa
            if (wasMockTrainTrip) {
                // Với chuyến tàu JIT, chúng ta phải map từ ID ghế tạm thời sang mã ghế (seat_number)
                // để cập nhật đúng ghế trong DB và lấy ID thật của nó.
                // TỐI ƯU HÓA: Tránh N+1 query bằng cách cập nhật và lấy ID một lần.
                const tempIdToSeatNumberMap = getTempIdToSeatNumberMap();
                // Cải thiện type-safety: Dùng map và type guard để lọc ra các giá trị undefined một cách an toàn.
                const seatNumbersToBook = passengers
                    .map(p => tempIdToSeatNumberMap.get(p.seatId))
                    .filter((seatNumber) => Boolean(seatNumber));
                if (seatNumbersToBook.length !== passengers.length) {
                    throw new Error('Lỗi hệ thống: Không thể map ID ghế tạm thời sang mã ghế thật.');
                }
                // 1. Cập nhật tất cả ghế trong một query
                const [updateResult] = await connection.query(`UPDATE seats SET status = 'Booked' WHERE trip_id = ? AND seat_code IN (?) AND status = 'Available'`, [tripId, seatNumbersToBook]);
                if (updateResult.affectedRows !== seatNumbersToBook.length) {
                    throw new Error('Một hoặc nhiều ghế đã có người mua trong lúc bạn thao tác. Vui lòng thử lại.');
                }
                // 2. Lấy tất cả ID ghế thật trong một query
                const [seatRows] = await connection.query(`SELECT seat_id, seat_code FROM seats WHERE trip_id = ? AND seat_code IN (?)`, [tripId, seatNumbersToBook]);
                const seatNumberToRealIdMap = new Map(seatRows.map((row) => [row.seat_code, row.seat_id]));
                // 3. Map lại cho từng hành khách
                passengers.forEach(p => {
                    const seatNumber = tempIdToSeatNumberMap.get(p.seatId);
                    const realSeatId = seatNumberToRealIdMap.get(seatNumber);
                    if (realSeatId) {
                        passengerToRealSeatIdMap.set(p, realSeatId);
                    }
                });
            }
            else {
                // Với chuyến xe khách (hoặc tàu đã có sẵn), `seatIds` từ payload là ID thật
                if (!seatIds || seatIds.length === 0 || seatIds.length !== passengers.length) {
                    throw new Error('Dữ liệu ghế và hành khách không khớp.');
                }
                // TỐI ƯU HÓA: Cập nhật tất cả ghế trong một query để tránh N+1
                const [updateResult] = await connection.query(`UPDATE seats SET status = 'Booked' WHERE trip_id = ? AND seat_id IN (?) AND status = 'Available'`, [tripId, seatIds]);
                if (updateResult.affectedRows !== seatIds.length) {
                    throw new Error('Một hoặc nhiều ghế đã có người mua trong lúc bạn thao tác. Vui lòng thử lại.');
                }
                // Map lại cho từng hành khách
                for (let i = 0; i < seatIds.length; i++) {
                    passengerToRealSeatIdMap.set(passengers[i], seatIds[i]);
                }
            }
        }
        let firstTicketQr = null;
        // 4. Tạo chi tiết Vé (Tickets) & Mã QR cho từng Hành khách
        for (let i = 0; i < passengers.length; i++) {
            const passenger = passengers[i];
            let assignedSeatId;
            if (vehicleType === 'Flight') {
                assignedSeatId = null;
            }
            else if (wasMockTrainTrip) {
                // Với tàu JIT, vẫn cần map để lấy ID thật từ map đã tạo ở bước 3
                assignedSeatId = passengerToRealSeatIdMap.get(passenger);
            }
            else {
                // Với xe khách (hoặc tàu đã có sẵn), seatId đã là ID thật và có sẵn trong payload của passenger.
                // Lấy trực tiếp sẽ an toàn và đơn giản hơn dùng Map.
                assignedSeatId = passenger.seatId;
            }
            const assignedClassId = (vehicleType === 'Flight') ? classId : null; // Xe/Tàu không có class_id
            // Ràng buộc dữ liệu (Validation) dựa trên mô tả dự án
            if (vehicleType === 'Train' && !passenger.idCard)
                throw new Error('Tàu hỏa bắt buộc phải nhập CCCD cho từng vé.');
            // CẢI TIẾN: Chỉ bắt buộc SĐT/Email cho hành khách người lớn trên chuyến bay
            if (vehicleType === 'Flight' && passenger.type === 'Adult' && (!passenger.email || !passenger.phone)) {
                throw new Error('Máy bay bắt buộc nhập SĐT và Email cho hành khách người lớn.');
            }
            // Sinh mã QR
            const qrData = `PNR:${bookingCode}|TICKET:${i + 1}|NAME:${passenger.name}`;
            const qrCodeBase64 = await generateQRCode(qrData);
            if (i === 0) {
                firstTicketQr = qrCodeBase64;
            }
            const [ticketResult] = await connection.query(`INSERT INTO tickets (booking_id, seat_id, class_id, passenger_name, passenger_id_card, passenger_email, passenger_phone, ticket_price, qr_code_data) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                bookingId, assignedSeatId, assignedClassId,
                passenger.name, passenger.idCard || null, passenger.email || null, passenger.phone || null,
                passenger.price, qrCodeBase64
            ]);
            // Thêm kiểm tra để đảm bảo vé được tạo
            if (ticketResult.affectedRows !== 1) {
                throw new Error(`Không thể tạo vé cho hành khách ${passenger.name}.`);
            }
        }
        // Redis lock được nhả ở lớp transaction bên ngoài sau commit/rollback.
        return {
            bookingId,
            bookingCode,
            firstTicketQr,
        };
    }
    /**
     * Xác nhận cho vé một chiều (Single Trip).
     *
     * Wallet:
     * - khóa user FOR UPDATE;
     * - kiểm tra số dư;
     * - trừ tiền;
     * - tạo booking Paid + ticket/QR;
     * - commit nguyên tử.
     *
     * VNPAY:
     * - không trừ ví;
     * - tạo booking Pending để PaymentService xử lý tiếp.
     */
    async confirmSingleBooking(userId, payload) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        const paymentMethod = payload.paymentMethod ?? 'Wallet';
        try {
            let walletInfo = null;
            if (paymentMethod === 'Wallet') {
                walletInfo = await this.debitWallet(connection, userId, payload.totalAmount);
            }
            const result = await this._executeBookingLeg(connection, userId, {
                ...payload,
                paymentMethod,
            });
            if (paymentMethod === 'Wallet' && walletInfo) {
                await this.recordWalletTransaction(connection, {
                    userId,
                    bookingId: result.bookingId,
                    transactionType: 'PAYMENT',
                    amount: -Number(payload.totalAmount),
                    balanceBefore: walletInfo.balanceBefore,
                    balanceAfter: walletInfo.balanceAfter,
                    referenceCode: result.bookingCode,
                    description: `Thanh toán vé ${result.bookingCode} bằng Ví ViệtGo`,
                });
            }
            await connection.commit();
            // Nhả Redis lock sau khi dữ liệu DB đã commit thành công.
            await this.unlockBusPayloadSeats(payload, userId);
            return {
                success: true,
                message: paymentMethod === 'Wallet'
                    ? 'Đặt vé và thanh toán bằng ví thành công!'
                    : 'Tạo booking chờ thanh toán VNPAY thành công!',
                ...result,
                paymentMethod,
                paymentStatus: paymentMethod === 'Wallet' ? 'Paid' : 'Pending',
                walletBalance: walletInfo?.balanceAfter,
            };
        }
        catch (error) {
            await connection.rollback();
            // Không để ghế xe khách bị giữ đến hết TTL khi transaction thất bại.
            try {
                await this.unlockBusPayloadSeats(payload, userId);
            }
            catch (unlockError) {
                console.error('Không thể nhả Redis lock sau rollback:', unlockError);
            }
            console.error('Lỗi khi xác nhận vé một chiều:', error);
            throw error;
        }
        finally {
            connection.release();
        }
    }
    /**
     * Xác nhận cho vé khứ hồi trong MỘT transaction nguyên tử.
     * Hai chiều phải dùng cùng một phương thức thanh toán.
     */
    async confirmRoundtripBooking(userId, payloads) {
        if (!payloads || payloads.length !== 2) {
            throw new CustomError('Yêu cầu đặt vé khứ hồi không hợp lệ.', 400);
        }
        const departurePayload = payloads[0];
        const returnPayload = payloads[1];
        const departurePaymentMethod = departurePayload.paymentMethod ?? 'Wallet';
        const returnPaymentMethod = returnPayload.paymentMethod ?? 'Wallet';
        if (departurePaymentMethod !== returnPaymentMethod) {
            throw new CustomError('Hai chiều của vé khứ hồi phải dùng cùng một phương thức thanh toán.', 400);
        }
        const paymentMethod = departurePaymentMethod;
        const totalRoundtripAmount = Number(departurePayload.totalAmount) + Number(returnPayload.totalAmount);
        if (!Number.isFinite(totalRoundtripAmount) || totalRoundtripAmount <= 0) {
            throw new CustomError('Tổng tiền vé khứ hồi không hợp lệ.', 400);
        }
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            let walletInfo = null;
            // Wallet: khóa và trừ tổng tiền đúng một lần.
            if (paymentMethod === 'Wallet') {
                walletInfo = await this.debitWallet(connection, userId, totalRoundtripAmount);
            }
            const departResult = await this._executeBookingLeg(connection, userId, {
                ...departurePayload,
                paymentMethod,
            });
            const returnResult = await this._executeBookingLeg(connection, userId, {
                ...returnPayload,
                paymentMethod,
            });
            if (paymentMethod === 'Wallet' && walletInfo) {
                await this.recordWalletTransaction(connection, {
                    userId,
                    bookingId: departResult.bookingId,
                    relatedBookingId: returnResult.bookingId,
                    transactionType: 'PAYMENT',
                    amount: -totalRoundtripAmount,
                    balanceBefore: walletInfo.balanceBefore,
                    balanceAfter: walletInfo.balanceAfter,
                    referenceCode: `${departResult.bookingCode},${returnResult.bookingCode}`,
                    description: `Thanh toán vé khứ hồi ${departResult.bookingCode} / ${returnResult.bookingCode} bằng Ví ViệtGo`,
                });
            }
            // Chỉ commit khi CẢ HAI chiều đều thành công.
            await connection.commit();
            await Promise.all([
                this.unlockBusPayloadSeats(departurePayload, userId),
                this.unlockBusPayloadSeats(returnPayload, userId),
            ]);
            return {
                success: true,
                message: paymentMethod === 'Wallet'
                    ? 'Đặt vé khứ hồi và thanh toán bằng ví thành công!'
                    : 'Tạo hai booking khứ hồi chờ thanh toán VNPAY thành công!',
                bookingCode: `${departResult.bookingCode}, ${returnResult.bookingCode}`,
                bookingCodes: [
                    departResult.bookingCode,
                    returnResult.bookingCode,
                ],
                firstTicketQr: departResult.firstTicketQr,
                totalPrice: totalRoundtripAmount,
                paymentMethod,
                paymentStatus: paymentMethod === 'Wallet' ? 'Paid' : 'Pending',
                walletBalance: walletInfo?.balanceAfter,
            };
        }
        catch (error) {
            await connection.rollback();
            // Rollback DB + nhả Redis lock cả hai chiều.
            await Promise.allSettled([
                this.unlockBusPayloadSeats(departurePayload, userId),
                this.unlockBusPayloadSeats(returnPayload, userId),
            ]);
            console.error('Lỗi khi xác nhận vé khứ hồi (đã rollback toàn bộ):', error);
            throw error;
        }
        finally {
            connection.release();
        }
    }
    /**
     * BƯỚC 3: LẤY LỊCH SỬ ĐẶT VÉ CỦA NGƯỜI DÙNG
     */
    async getBookingHistory(userId) {
        const connection = await pool.getConnection();
        try {
            // Lấy tất cả các booking của user
            const [bookings] = await connection.query(`SELECT
            b.booking_id,
            b.booking_code,
            b.total_amount,
            b.payment_status,
            b.created_at,
            b.refund_status,
            CASE
                WHEN b.refund_status = 'Approved' THEN 'Cancelled' -- Đã hủy và hoàn tiền thành công
                WHEN b.refund_status = 'Rejected' THEN 'CancellationRejected' -- Bị từ chối, cũng coi như đã hủy/thất bại
                WHEN b.payment_status = 'Refunded' THEN 'Cancelled' -- Đã hủy tự động (vé chưa thanh toán)
                WHEN b.refund_status = 'Pending' THEN 'CancellationPending' -- Chờ nhà xe xử lý
                WHEN b.refund_status = 'WaitRefund' THEN 'RefundPending' -- Chờ admin hoàn tiền
                WHEN b.payment_status = 'Pending' THEN 'PaymentPending'
                ELSE 'Active'
            END as display_status
         FROM (
            SELECT 
                b.booking_id, 
                b.booking_code, 
                b.total_amount, 
                b.payment_status, 
                b.created_at,
                COALESCE((SELECT status FROM refund_requests rr WHERE rr.booking_id = b.booking_id ORDER BY rr.created_at DESC LIMIT 1), 'No Request') as refund_status
            FROM bookings b
            WHERE b.user_id = ?
         ) b
         ORDER BY b.created_at DESC`, [userId]);
            if (bookings.length === 0) {
                return [];
            }
            const bookingIds = bookings.map((b) => b.booking_id);
            // Lấy tất cả các ticket liên quan đến các booking trên
            const [tickets] = await connection.query(`SELECT t.ticket_id, t.booking_id, t.passenger_name, t.ticket_price,
                tr.departure_time, tr.arrival_time,
                r.departure_location, r.arrival_location,
                v.vehicle_name, v.vehicle_type
         FROM tickets t
         LEFT JOIN seats s ON t.seat_id = s.seat_id
         LEFT JOIN flight_ticket_classes ftc ON t.class_id = ftc.class_id
         JOIN trips tr ON tr.trip_id = COALESCE(s.trip_id, ftc.trip_id)
         JOIN routes r ON tr.route_id = r.route_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         WHERE t.booking_id IN (?)`, [bookingIds]);
            // Gộp tickets vào đúng booking của nó
            return bookings.map((booking) => ({
                ...booking,
                tickets: tickets.filter((ticket) => ticket.booking_id === booking.booking_id),
            }));
        }
        finally {
            connection.release();
        }
    }
    /**
     * HỦY BOOKING PENDING VÀ GIẢI PHÓNG CHỖ.
     *
     * Hàm này dành cho booking chưa thanh toán (ví dụ VNPAY thất bại).
     * Vì booking Pending CHƯA trừ tiền ví nên TUYỆT ĐỐI không cộng tiền vào ví.
     *
     * Với booking Paid, người dùng phải đi qua requestCancellationAndRefund()
     * để áp dụng đúng chính sách hoàn tiền.
     */
    async cancelAndRefundBooking(bookingCode, reason) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            const [bookingRows] = await connection.query(`SELECT 
            b.booking_id,
            b.user_id,
            b.total_amount,
            b.payment_status,
            v.vehicle_type
         FROM bookings b
         JOIN tickets t ON b.booking_id = t.booking_id
         LEFT JOIN seats s ON t.seat_id = s.seat_id
         LEFT JOIN flight_ticket_classes ftc ON t.class_id = ftc.class_id
         JOIN trips tr ON tr.trip_id = COALESCE(s.trip_id, ftc.trip_id)
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         WHERE b.booking_code = ?
         GROUP BY b.booking_id, v.vehicle_type
         FOR UPDATE`, [bookingCode]);
            if (bookingRows.length === 0) {
                throw new CustomError(`Không tìm thấy đơn hàng với mã ${bookingCode}.`, 404);
            }
            const bookingInfo = bookingRows[0];
            if (bookingInfo.payment_status === 'Refunded') {
                await connection.rollback();
                return {
                    success: true,
                    message: `Đơn hàng ${bookingCode} đã được xử lý trước đó.`,
                };
            }
            if (bookingInfo.payment_status !== 'Pending') {
                throw new CustomError('Booking đã thanh toán không được hủy bằng luồng tự động này. Vui lòng dùng chức năng yêu cầu hủy vé.', 400);
            }
            // Booking Pending chưa phát sinh thanh toán => chỉ giải phóng inventory.
            await this.releaseBookingInventory(connection, bookingInfo.booking_id, bookingInfo.vehicle_type);
            /*
             * Schema hiện tại của project đang dùng Pending/Paid/Refunded.
             * Tạm dùng Refunded để đánh dấu booking Pending đã đóng.
             * Khi có trạng thái Cancelled riêng, nên đổi sang Cancelled.
             */
            await connection.query(`UPDATE bookings
         SET payment_status = 'Refunded'
         WHERE booking_id = ?
           AND payment_status = 'Pending'`, [bookingInfo.booking_id]);
            // Ghi nhận yêu cầu với refund_amount = 0 vì chưa hề trừ tiền.
            await connection.query(`INSERT INTO refund_requests (
            booking_id,
            reason,
            refund_amount,
            status
         ) VALUES (?, ?, 0, 'Approved')`, [bookingInfo.booking_id, reason]);
            await connection.commit();
            return {
                success: true,
                message: `Đã hủy booking Pending ${bookingCode} và giải phóng chỗ. ` +
                    'Không cộng tiền vào ví vì giao dịch chưa thanh toán.',
                refundAmount: 0,
            };
        }
        catch (error) {
            await connection.rollback();
            console.error('Lỗi trong lúc hủy booking Pending:', error);
            if (error instanceof CustomError) {
                throw error;
            }
            throw new CustomError(`Giao dịch hủy vé thất bại: ${error.message}`, 500);
        }
        finally {
            connection.release();
        }
    }
    /**
     * Yêu cầu hủy vé và hoàn tiền theo chính sách.
     * Đối với xe khách, yêu cầu sẽ được gửi đến nhà xe để phê duyệt.
     * Đối với tàu hỏa và máy bay (dữ liệu ảo), sẽ tự động hủy và hoàn tiền.
     * @param userId ID của người dùng yêu cầu hủy.
     * @param bookingCode Mã đặt chỗ cần hủy.
     * @param reason Lý do hủy.
     */
    async requestCancellationAndRefund(userId, bookingCode, reason) {
        const connection = await pool.getConnection(); // Assuming pool is defined
        await connection.beginTransaction(); // Start transaction
        try {
            // 1. Lấy thông tin booking và chuyến đi liên quan
            const [bookingDetailsRows] = await connection.query(`SELECT
            b.booking_id,
            b.user_id,
            b.total_amount,
            b.payment_status,
            t.departure_time,
            b.booking_code,
            v.vehicle_type,
            v.partner_id
         FROM bookings b
         JOIN tickets tk ON b.booking_id = tk.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         LEFT JOIN flight_ticket_classes ftc ON tk.class_id = ftc.class_id
         JOIN trips t ON t.trip_id = COALESCE(s.trip_id, ftc.trip_id)
         JOIN vehicles v ON t.vehicle_id = v.vehicle_id
         WHERE b.booking_code = ? AND b.user_id = ?
         GROUP BY b.booking_id, t.departure_time, v.vehicle_type, v.partner_id
         FOR UPDATE`, // Lock the booking row
            [bookingCode, userId]);
            if (bookingDetailsRows.length === 0) {
                throw new CustomError('Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập.', 404);
            }
            const bookingInfo = bookingDetailsRows[0];
            if (bookingInfo.payment_status !== 'Paid') {
                throw new CustomError('Chỉ có thể hủy các đơn hàng đã thanh toán.', 400);
            }
            // Chống tạo nhiều yêu cầu refund cho cùng một booking.
            // Nếu đã Pending hoặc Approved thì không tạo thêm request mới.
            const [existingRefundRequest] = await connection.query(`SELECT refund_id, status
         FROM refund_requests
         WHERE booking_id = ?
           AND status IN ('Pending', 'Approved')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`, [bookingInfo.booking_id]);
            if (existingRefundRequest.length > 0) {
                if (existingRefundRequest[0].status === 'Pending') {
                    throw new CustomError('Đơn hàng này đã có yêu cầu hoàn tiền đang chờ xử lý.', 409);
                }
                throw new CustomError('Đơn hàng này đã được hoàn tiền trước đó.', 409);
            }
            // Kiểm tra thêm ledger để chống double-refund ngay cả khi refund_requests
            // bị thiếu hoặc dữ liệu cũ không đồng bộ.
            const [existingRefundLedger] = await connection.query(`SELECT wallet_transaction_id
         FROM wallet_transactions
         WHERE booking_id = ?
           AND transaction_type = 'REFUND'
         LIMIT 1
         FOR UPDATE`, [bookingInfo.booking_id]);
            if (existingRefundLedger.length > 0) {
                throw new CustomError('Đơn hàng này đã được hoàn tiền trước đó.', 409);
            }
            const now = new Date();
            const departureTime = new Date(bookingInfo.departure_time);
            const timeDiffMs = departureTime.getTime() - now.getTime();
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
            let refundPercentage = 0;
            let message = '';
            if (timeDiffHours >= 48) { // >= 2 ngày
                refundPercentage = 100;
            }
            else if (timeDiffHours >= 24) { // 1 đến 2 ngày
                refundPercentage = 80;
            }
            else {
                throw new CustomError('Không thể hủy vé do đã quá gần giờ khởi hành.', 400);
            }
            const refundAmount = bookingInfo.total_amount * (refundPercentage / 100);
            if (bookingInfo.vehicle_type === 'Bus') {
                // For Bus, create a pending refund request for partner approval
                await connection.query(`INSERT INTO refund_requests (booking_id, reason, refund_amount, status, partner_id) VALUES (?, ?, ?, ?, ?)`, [bookingInfo.booking_id, reason, refundAmount, 'Pending', bookingInfo.partner_id]);
                message = 'Yêu cầu hủy vé của bạn đã được gửi đến nhà xe để phê duyệt.';
            }
            else {
                // Đối với Tàu hỏa và Máy bay, gửi thẳng yêu cầu đến Admin để duyệt
                await connection.query(`INSERT INTO refund_requests (booking_id, reason, refund_amount, status, partner_id) VALUES (?, ?, ?, ?, ?)`, [bookingInfo.booking_id, reason, refundAmount, 'WaitRefund', null]);
                message = 'Yêu cầu hủy vé của bạn đã được gửi đến quản trị viên để xử lý.';
            }
            await connection.commit();
            return {
                success: true,
                message,
                refundAmount,
                bookingCode: bookingInfo.booking_code,
            };
        }
        catch (error) {
            await connection.rollback();
            console.error("Lỗi trong lúc yêu cầu hủy vé:", error);
            throw new CustomError(error.message || 'Yêu cầu hủy vé thất bại.', error.statusCode || 500);
        }
        finally {
            connection.release();
        }
    }
}
export default new BookingService();
