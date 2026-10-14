export interface GeneratedSeat {
  trip_id: number;
  seat_code: string;
  floor: number;
  row: number;
  position: 'left' | 'right' | 'middle';
  status: 'Available' | 'Booked';
}

/**
 * Generates seat layouts dynamically for a bus trip.
 * Splits seats into two floors (Floor 1 starts with A, Floor 2 starts with B)
 * and distributes them into rows with left and right positions.
 */
export function generateBusSeats(tripId: number, totalSeats: number): GeneratedSeat[] {
  const seats: GeneratedSeat[] = [];
  const halfSeats = Math.ceil(totalSeats / 2);

  // Floor 1: prefix A
  for (let i = 0; i < halfSeats; i++) {
    const row = Math.floor(i / 2) + 1;
    const position = i % 2 === 0 ? 'left' : 'right';
    seats.push({
      trip_id: tripId,
      seat_code: `A${i + 1}`,
      floor: 1,
      row: row,
      position: position,
      status: 'Available'
    });
  }

  // Floor 2: prefix B
  const floor2SeatsCount = totalSeats - halfSeats;
  for (let i = 0; i < floor2SeatsCount; i++) {
    const row = Math.floor(i / 2) + 1;
    const position = i % 2 === 0 ? 'left' : 'right';
    seats.push({
      trip_id: tripId,
      seat_code: `B${i + 1}`,
      floor: 2,
      row: row,
      position: position,
      status: 'Available'
    });
  }

  return seats;
}
