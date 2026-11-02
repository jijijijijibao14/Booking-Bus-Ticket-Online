const EARLIEST_DEPARTURE_MINUTES = 8 * 60;
const LATEST_DEPARTURE_MINUTES = 20 * 60;
function parseCivilDate(value, field) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        throw new Error(`${field} phải theo định dạng YYYY-MM-DD.`);
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(match[1]) ||
        date.getUTCMonth() !== Number(match[2]) - 1 ||
        date.getUTCDate() !== Number(match[3])) {
        throw new Error(`${field} không tồn tại.`);
    }
    return timestamp;
}
function parseWallTime(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match)
        throw new Error(`Giờ khởi hành không hợp lệ: ${value}.`);
    return Number(match[1]) * 60 + Number(match[2]);
}
function formatDateTime(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}
function parseDateTime(value) {
    const normalized = value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`
        : value;
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(normalized);
    if (!match)
        throw new Error(`Thời gian chuyến không hợp lệ: ${String(value)}.`);
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}
export function isFutureVietnamDateTime(value, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
    const nowVietnam = `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
    return parseDateTime(value) > parseDateTime(nowVietnam);
}
function assertInteger(value, field, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error(`${field} phải là số nguyên từ ${min} đến ${max}.`);
    }
}
export function validateRecurringInput(input) {
    if (!input ||
        typeof input !== 'object' ||
        typeof input.departureLocation !== 'string' ||
        typeof input.arrivalLocation !== 'string') {
        throw new Error('Dữ liệu lịch chạy không hợp lệ.');
    }
    if (!input.departureLocation.trim() ||
        !input.arrivalLocation.trim() ||
        input.departureLocation.length > 100 ||
        input.arrivalLocation.length > 100) {
        throw new Error('Vui lòng nhập điểm đi và điểm đến.');
    }
    if (input.departureLocation.trim().toLocaleLowerCase() === input.arrivalLocation.trim().toLocaleLowerCase()) {
        throw new Error('Điểm đi và điểm đến phải khác nhau.');
    }
    assertInteger(input.vehicleId, 'Xe', 1, Number.MAX_SAFE_INTEGER);
    if (input.driverId != null)
        assertInteger(input.driverId, 'Tài xế', 1, Number.MAX_SAFE_INTEGER);
    if (input.secondaryDriverIds !== undefined) {
        if (!Array.isArray(input.secondaryDriverIds)) {
            throw new Error('Danh sách tài xế phụ không hợp lệ.');
        }
        input.secondaryDriverIds.forEach((driverId) => assertInteger(driverId, 'Tài xế phụ', 1, Number.MAX_SAFE_INTEGER));
        if (new Set(input.secondaryDriverIds).size !== input.secondaryDriverIds.length) {
            throw new Error('Tài xế phụ không được chọn trùng nhau.');
        }
        if (input.driverId != null && input.secondaryDriverIds.includes(input.driverId)) {
            throw new Error('Tài xế chính không thể đồng thời là tài xế phụ.');
        }
    }
    const start = parseCivilDate(input.startDate, 'Ngày bắt đầu');
    const end = parseCivilDate(input.endDate, 'Ngày kết thúc');
    if (end < start)
        throw new Error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
    if ((end - start) / 86_400_000 > 90) {
        throw new Error('Mỗi lần tạo lịch chỉ hỗ trợ tối đa 91 ngày.');
    }
    if (!Array.isArray(input.weekdays) || input.weekdays.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một ngày chạy trong tuần.');
    }
    if (input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new Error('Ngày chạy trong tuần không hợp lệ.');
    }
    if (new Set(input.weekdays).size !== input.weekdays.length) {
        throw new Error('Ngày chạy trong tuần không được trùng nhau.');
    }
    if (!Array.isArray(input.departureTimes) ||
        input.departureTimes.length === 0 ||
        input.departureTimes.length > 8) {
        throw new Error('Mỗi ngày cần có từ 1 đến 8 giờ khởi hành.');
    }
    input.departureTimes.forEach((time) => {
        const departureMinutes = parseWallTime(time);
        if (departureMinutes < EARLIEST_DEPARTURE_MINUTES ||
            departureMinutes > LATEST_DEPARTURE_MINUTES) {
            throw new Error('Giờ khởi hành chỉ được trong khoảng từ 08:00 đến 20:00.');
        }
    });
    if (new Set(input.departureTimes).size !== input.departureTimes.length) {
        throw new Error('Giờ khởi hành không được trùng nhau.');
    }
    if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
        throw new Error('Giá vé phải là số không âm.');
    }
    assertInteger(input.drivingDurationMinutes, 'Thời lượng di chuyển', 1, 2880);
    assertInteger(input.stopDurationMinutes, 'Thời gian dừng', 0, 1440);
    assertInteger(input.restDurationMinutes, 'Thời gian nghỉ dọc đường', 0, 1440);
    assertInteger(input.bufferDurationMinutes, 'Thời gian dự phòng', 0, 1440);
    assertInteger(input.minimumTurnaroundMinutes, 'Thời gian nghỉ tối thiểu', 60, 1440);
    if (!input.idempotencyKey || input.idempotencyKey.length > 100) {
        throw new Error('Thiếu mã chống tạo trùng hoặc mã không hợp lệ.');
    }
}
export function createOccurrences(input, drivingDurationMinutes) {
    validateRecurringInput(input);
    assertInteger(drivingDurationMinutes, 'Thời lượng di chuyển', 1, 2880);
    const start = parseCivilDate(input.startDate, 'Ngày bắt đầu');
    const end = parseCivilDate(input.endDate, 'Ngày kết thúc');
    const weekdays = new Set(input.weekdays);
    const departureMinutes = input.departureTimes.map(parseWallTime).sort((a, b) => a - b);
    const estimatedDurationMinutes = drivingDurationMinutes
        + input.stopDurationMinutes
        + input.restDurationMinutes
        + input.bufferDurationMinutes;
    if (estimatedDurationMinutes > 2880) {
        throw new Error('Tổng thời lượng chuyến không được vượt quá 48 giờ.');
    }
    const starts = [];
    for (let date = start; date <= end; date += 86_400_000) {
        if (!weekdays.has(new Date(date).getUTCDay()))
            continue;
        for (const minuteOfDay of departureMinutes) {
            starts.push(date + minuteOfDay * 60_000);
        }
    }
    if (starts.length === 0) {
        throw new Error('Không có ngày chạy nào khớp với khoảng ngày đã chọn.');
    }
    const occurrences = [];
    const scheduleEnd = end + 86_400_000 - 1;
    const turnaroundMs = input.minimumTurnaroundMinutes * 60_000;
    let direction = 'outbound';
    for (let startIndex = 0; startIndex < starts.length; startIndex += 1) {
        const nextScheduledStart = starts[startIndex + 1] ?? scheduleEnd + 1;
        const cycleEnd = Math.min(scheduleEnd, nextScheduledStart - 1);
        let departure = starts[startIndex];
        while (departure <= cycleEnd) {
            const departureDate = new Date(departure);
            const departureMinutesOfDay = departureDate.getUTCHours() * 60 + departureDate.getUTCMinutes();
            if (departureMinutesOfDay < EARLIEST_DEPARTURE_MINUTES ||
                departureMinutesOfDay > LATEST_DEPARTURE_MINUTES) {
                break;
            }
            const departureLocation = direction === 'outbound'
                ? input.departureLocation.trim()
                : input.arrivalLocation.trim();
            const arrivalLocation = direction === 'outbound'
                ? input.arrivalLocation.trim()
                : input.departureLocation.trim();
            occurrences.push({
                departureTime: formatDateTime(departure),
                arrivalTime: formatDateTime(departure + estimatedDurationMinutes * 60_000),
                departureLocation,
                arrivalLocation,
                direction,
                cycleStartTime: formatDateTime(starts[startIndex]),
                estimatedDurationMinutes,
                minimumTurnaroundMinutes: input.minimumTurnaroundMinutes,
                conflicts: [],
            });
            if (occurrences.length > 728) {
                throw new Error('Lịch tạo vượt quá giới hạn 728 chuyến mỗi lần.');
            }
            departure += (estimatedDurationMinutes * 60_000) + turnaroundMs;
            direction = direction === 'outbound' ? 'return' : 'outbound';
        }
    }
    if (occurrences.length > 728) {
        throw new Error('Lịch tạo vượt quá giới hạn 728 chuyến mỗi lần.');
    }
    return occurrences;
}
export function propagateCycleConflicts(occurrences) {
    const blockedCycles = new Set();
    for (const occurrence of occurrences) {
        if (blockedCycles.has(occurrence.cycleStartTime)) {
            occurrence.conflicts.push('Không tạo chuyến vì chuyến trước trong chu kỳ đã bị bỏ qua.');
        }
        occurrence.conflicts = [...new Set(occurrence.conflicts)];
        if (occurrence.conflicts.length > 0) {
            blockedCycles.add(occurrence.cycleStartTime);
        }
    }
    return occurrences;
}
export function detectOccurrenceConflicts(occurrences, existingTrips, candidateVehicleId, candidateDriverId, candidateSecondaryDriverIds = []) {
    const parseDriverIds = (value) => {
        if (Array.isArray(value))
            return value;
        if (!value)
            return [];
        return value.split(',')
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0);
    };
    const candidateDriverIds = [
        ...(candidateDriverId == null ? [] : [candidateDriverId]),
        ...candidateSecondaryDriverIds,
    ];
    const timeline = [
        ...existingTrips.map((trip) => ({
            departureTime: trip.departureTime,
            arrivalTime: trip.arrivalTime,
            vehicleId: trip.vehicleId,
            driverIds: [
                ...(trip.driverId == null ? [] : [trip.driverId]),
                ...parseDriverIds(trip.secondaryDriverIds),
            ],
            minimumTurnaroundMinutes: trip.minimumTurnaroundMinutes,
            transferDurationMinutes: trip.transferDurationMinutes,
            isCandidate: false,
        })),
        ...occurrences.map((trip, occurrenceIndex) => ({
            ...trip,
            vehicleId: candidateVehicleId,
            driverIds: candidateDriverIds,
            transferDurationMinutes: 0,
            isCandidate: true,
            occurrenceIndex,
        })),
    ].sort((a, b) => parseDateTime(a.departureTime) - parseDateTime(b.departureTime));
    for (let firstIndex = 0; firstIndex < timeline.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < timeline.length; secondIndex += 1) {
            const first = timeline[firstIndex];
            const second = timeline[secondIndex];
            if (!first.isCandidate && !second.isCandidate)
                continue;
            const firstDeparture = parseDateTime(first.departureTime);
            const firstArrival = parseDateTime(first.arrivalTime);
            const secondDeparture = parseDateTime(second.departureTime);
            const secondArrival = parseDateTime(second.arrivalTime);
            const overlap = firstDeparture < secondArrival && firstArrival > secondDeparture;
            const sameVehicle = first.vehicleId === second.vehicleId;
            const sameDriver = first.driverIds.some((driverId) => second.driverIds.includes(driverId));
            const reasons = [];
            if (sameVehicle && overlap) {
                reasons.push('Xe bị trùng thời gian vận hành với chuyến khác.');
            }
            if (sameDriver && overlap)
                reasons.push('Tài xế bị trùng thời gian vận hành với chuyến khác.');
            if (reasons.length === 0)
                continue;
            if (first.isCandidate)
                occurrences[first.occurrenceIndex].conflicts.push(...reasons);
            if (second.isCandidate)
                occurrences[second.occurrenceIndex].conflicts.push(...reasons);
        }
    }
    const vehicleTimeline = timeline
        .filter((trip) => trip.vehicleId === candidateVehicleId)
        .sort((a, b) => parseDateTime(a.departureTime) - parseDateTime(b.departureTime));
    for (let index = 1; index < vehicleTimeline.length; index += 1) {
        const previous = vehicleTimeline[index - 1];
        const current = vehicleTimeline[index];
        const availableMinutes = (parseDateTime(current.departureTime) - parseDateTime(previous.arrivalTime)) / 60_000;
        if (availableMinutes < 0)
            continue;
        const requiredMinutes = Math.max(previous.minimumTurnaroundMinutes, current.minimumTurnaroundMinutes) + current.transferDurationMinutes;
        if (availableMinutes >= requiredMinutes)
            continue;
        const reason = `Xe cần nghỉ thêm ${Math.ceil(requiredMinutes - availableMinutes)} phút giữa hai chuyến.`;
        if (previous.isCandidate)
            occurrences[previous.occurrenceIndex].conflicts.push(reason);
        if (current.isCandidate)
            occurrences[current.occurrenceIndex].conflicts.push(reason);
    }
    for (const occurrence of occurrences) {
        occurrence.conflicts = [...new Set(occurrence.conflicts)];
    }
    return occurrences;
}
