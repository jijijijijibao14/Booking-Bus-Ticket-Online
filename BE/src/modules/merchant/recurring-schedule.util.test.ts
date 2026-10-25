import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOccurrences,
  detectOccurrenceConflicts,
  RecurringScheduleInput,
} from './recurring-schedule.util.js';

function makeInput(overrides: Partial<RecurringScheduleInput> = {}): RecurringScheduleInput {
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
    transferDurationMinutes: 0,
    idempotencyKey: 'schedule-request-1',
    ...overrides,
  };
}

test('generates occurrences for selected weekdays and departure times', () => {
  const occurrences = createOccurrences(makeInput(), 180);
  assert.equal(occurrences.length, 4);
  assert.equal(occurrences[0].departureTime, '2026-10-26 08:00:00');
  assert.equal(occurrences[1].departureTime, '2026-10-26 14:00:00');
  assert.equal(occurrences[0].estimatedDurationMinutes, 225);
  assert.equal(occurrences[0].arrivalTime, '2026-10-26 11:45:00');
});

test('calculates arrival on the following date for overnight trips', () => {
  const [occurrence] = createOccurrences(makeInput({
    startDate: '2026-10-26',
    endDate: '2026-10-26',
    weekdays: [1],
    departureTimes: ['23:30'],
    drivingDurationMinutes: 180,
    stopDurationMinutes: 0,
    restDurationMinutes: 0,
    bufferDurationMinutes: 0,
  }), 180);
  assert.equal(occurrence.arrivalTime, '2026-10-27 02:30:00');
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

test('includes configured transfer time in turnaround validation', () => {
  const input = makeInput({
    startDate: '2026-10-26',
    endDate: '2026-10-26',
    weekdays: [1],
    departureTimes: ['11:30'],
    drivingDurationMinutes: 30,
    stopDurationMinutes: 0,
    restDurationMinutes: 0,
    bufferDurationMinutes: 0,
    minimumTurnaroundMinutes: 60,
    transferDurationMinutes: 45,
  });
  const occurrence = createOccurrences(input, 30);
  detectOccurrenceConflicts(occurrence, [{
    departureTime: '2026-10-26 08:00:00',
    arrivalTime: '2026-10-26 10:00:00',
    vehicleId: 10,
    driverId: null,
    minimumTurnaroundMinutes: 60,
    transferDurationMinutes: 0,
  }], 10, null);
  assert.match(occurrence[0].conflicts.join(' '), /15 phút/);
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

test('rejects date ranges and invalid departure times outside supported bounds', () => {
  assert.throws(() => createOccurrences(makeInput({ endDate: '2027-01-25' }), 180), /91 ngày/);
  assert.throws(() => createOccurrences(makeInput({ departureTimes: ['25:00'] }), 180), /Giờ khởi hành/);
});
