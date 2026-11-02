import assert from 'node:assert/strict';
import test from 'node:test';
import { createOccurrences, detectOccurrenceConflicts, propagateCycleConflicts, validateRecurringInput, } from './recurring-schedule.util.js';
import { normalizeBusinessLicenseNumber, normalizeVietnameseLicensePlate, normalizeVietnamesePhone, } from '../../utils/contact-validation.util.js';
function makeInput(overrides = {}) {
    return {
        departureLocation: 'Đà Nẵng',
        arrivalLocation: 'Huế',
        vehicleId: 10,
        driverId: null,
        startDate: '2026-10-26',
        endDate: '2026-10-27',
        weekdays: [1, 2],
        departureTimes: ['08:00', '14:00'],
        basePrice: 450000,
        drivingDurationMinutes: 180,
        stopDurationMinutes: 10,
        restDurationMinutes: 20,
        bufferDurationMinutes: 15,
        minimumTurnaroundMinutes: 60,
        idempotencyKey: 'schedule-request-1',
        ...overrides,
    };
}
test('generates return trips and alternates directions between scheduled starts', () => {
    const occurrences = createOccurrences(makeInput(), 180);
    assert.ok(occurrences.length > 4);
    assert.equal(occurrences[0].departureTime, '2026-10-26 08:00:00');
    assert.equal(occurrences[0].estimatedDurationMinutes, 225);
    assert.equal(occurrences[0].arrivalTime, '2026-10-26 11:45:00');
    assert.equal(occurrences[1].departureTime, '2026-10-26 12:45:00');
    assert.equal(occurrences[1].departureLocation, 'Huế');
    assert.equal(occurrences[1].arrivalLocation, 'Đà Nẵng');
    assert.equal(occurrences[1].direction, 'return');
    assert.equal(occurrences[2].direction, 'outbound');
    assert.equal(occurrences.find((item) => item.departureTime === '2026-10-26 14:00:00')?.direction, 'outbound');
});
test('allows arrival after 20:00 but does not generate an overnight departure', () => {
    const [occurrence] = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        weekdays: [1],
        departureTimes: ['20:00'],
        drivingDurationMinutes: 180,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
    }), 180);
    assert.equal(occurrence.departureTime, '2026-10-26 20:00:00');
    assert.equal(occurrence.arrivalTime, '2026-10-26 23:00:00');
});
test('continues the return direction at the next scheduled start after the last allowed departure', () => {
    const occurrences = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-27',
        weekdays: [1, 2],
        departureTimes: ['10:00'],
        drivingDurationMinutes: 600,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
    }), 600);
    assert.deepEqual(occurrences.map((occurrence) => ({
        departureTime: occurrence.departureTime,
        departureLocation: occurrence.departureLocation,
        arrivalLocation: occurrence.arrivalLocation,
        direction: occurrence.direction,
    })), [
        {
            departureTime: '2026-10-26 10:00:00',
            departureLocation: 'Đà Nẵng',
            arrivalLocation: 'Huế',
            direction: 'outbound',
        },
        {
            departureTime: '2026-10-27 10:00:00',
            departureLocation: 'Huế',
            arrivalLocation: 'Đà Nẵng',
            direction: 'return',
        },
    ]);
});
test('rejects recurring departure times outside 08:00-20:00', () => {
    assert.throws(() => createOccurrences(makeInput({ departureTimes: ['07:59'] }), 180), /08:00 đến 20:00/);
    assert.throws(() => createOccurrences(makeInput({ departureTimes: ['20:01'] }), 180), /08:00 đến 20:00/);
});
test('rejects vehicle turnaround shorter than the 60 minute default', () => {
    const input = makeInput({ minimumTurnaroundMinutes: 60, departureTimes: ['11:00'] });
    const occurrence = createOccurrences(input, 120);
    detectOccurrenceConflicts(occurrence, [{
            departureTime: '2026-10-26 08:00:00',
            arrivalTime: '2026-10-26 10:01:00',
            vehicleId: 10,
            driverId: null,
            minimumTurnaroundMinutes: 60,
            transferDurationMinutes: 0,
        }], 10, null);
    assert.match(occurrence[0].conflicts.join(' '), /1 phút/);
});
test('includes minimum turnaround after each trip before generating the return trip', () => {
    const [outbound, returning] = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        weekdays: [1],
        departureTimes: ['08:00'],
        drivingDurationMinutes: 30,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
        minimumTurnaroundMinutes: 60,
    }), 30);
    assert.equal(outbound.arrivalTime, '2026-10-26 08:30:00');
    assert.equal(returning.departureTime, '2026-10-26 09:30:00');
});
test('does not create later legs after an earlier trip in the same cycle is skipped', () => {
    const occurrences = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        weekdays: [1],
        departureTimes: ['08:00'],
        drivingDurationMinutes: 30,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
    }), 30);
    occurrences[0].conflicts.push('Xe bị trùng thời gian vận hành với chuyến khác.');
    propagateCycleConflicts(occurrences);
    assert.ok(occurrences.every((occurrence) => occurrence.conflicts.length > 0));
});
test('detects overlapping schedules and driver conflicts across vehicles', () => {
    const occurrence = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        weekdays: [1],
        departureTimes: ['09:30'],
        drivingDurationMinutes: 120,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
    }), 120);
    detectOccurrenceConflicts(occurrence, [{
            departureTime: '2026-10-26 09:00:00',
            arrivalTime: '2026-10-26 11:00:00',
            vehicleId: 99,
            driverId: 25,
            minimumTurnaroundMinutes: 60,
            transferDurationMinutes: 0,
        }], 10, 25);
    assert.equal(occurrence[0].conflicts.length, 1);
    assert.match(occurrence[0].conflicts[0], /Tài xế/);
});
test('detects conflicts for secondary drivers already assigned to another trip', () => {
    const occurrence = createOccurrences(makeInput({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        weekdays: [1],
        departureTimes: ['09:30'],
        drivingDurationMinutes: 120,
        stopDurationMinutes: 0,
        restDurationMinutes: 0,
        bufferDurationMinutes: 0,
    }), 120);
    detectOccurrenceConflicts(occurrence, [{
            departureTime: '2026-10-26 09:00:00',
            arrivalTime: '2026-10-26 11:00:00',
            vehicleId: 99,
            driverId: null,
            secondaryDriverIds: '25,26',
            minimumTurnaroundMinutes: 60,
            transferDurationMinutes: 0,
        }], 10, null, [26]);
    assert.match(occurrence[0].conflicts.join(' '), /Tài xế/);
});
test('rejects duplicate or primary-as-secondary driver assignments', () => {
    assert.throws(() => validateRecurringInput(makeInput({ secondaryDriverIds: [25, 25] })), /không được chọn trùng nhau/);
    assert.throws(() => validateRecurringInput(makeInput({ driverId: 25, secondaryDriverIds: [25] })), /không thể đồng thời là tài xế phụ/);
});
test('rejects date ranges and invalid departure times outside supported bounds', () => {
    assert.throws(() => createOccurrences(makeInput({ endDate: '2027-01-25' }), 180), /91 ngày/);
    assert.throws(() => createOccurrences(makeInput({ departureTimes: ['25:00'] }), 180), /Giờ khởi hành/);
});
test('normalizes and validates Vietnamese mobile phone numbers', () => {
    assert.equal(normalizeVietnamesePhone('+84 90-1234-567'), '0901234567');
    assert.throws(() => normalizeVietnamesePhone('0112345678'), /Số điện thoại/);
});
test('normalizes and validates Vietnamese vehicle plates', () => {
    assert.equal(normalizeVietnameseLicensePlate('51a-12345'), '51A12345');
    assert.throws(() => normalizeVietnameseLicensePlate('51-A-123'), /Biển số xe/);
    assert.throws(() => normalizeVietnameseLicensePlate('51A@12345'), /Biển số xe/);
    assert.throws(() => normalizeVietnameseLicensePlate('59-X1 123.45'), /Biển số xe/);
    assert.throws(() => normalizeVietnameseLicensePlate('51A-123.45'), /Biển số xe/);
});
test('normalizes and validates business license numbers', () => {
    assert.equal(normalizeBusinessLicenseNumber(' gpkd-12345 '), 'GPKD-12345');
    assert.throws(() => normalizeBusinessLicenseNumber('GPKD-123456'), /GPKD-xxxxx/);
    assert.throws(() => normalizeBusinessLicenseNumber('GPKD-12A45'), /GPKD-xxxxx/);
});
