export const TRAIN_CARRIAGES = [
    { number: 1, name: 'Toa 1: Ghế mềm điều hòa', type: 'soft-seat', priceMultiplier: 1 },
    { number: 2, name: 'Toa 2: Ghế mềm điều hòa', type: 'soft-seat', priceMultiplier: 1 },
    { number: 3, name: 'Toa 3: Giường nằm khoang 6', type: 'bed-cabin-6', priceMultiplier: 1.5 },
    { number: 4, name: 'Toa 4: Giường nằm khoang 4', type: 'bed-cabin-4', priceMultiplier: 1.8 },
    { number: 5, name: 'Toa 5: Giường nằm khoang 4 VIP', type: 'vip-cabin', priceMultiplier: 2 },
];
export function generateTrainSeats(mode) {
    const seats = [];
    let seatIdCounter = 1;
    for (const carriage of TRAIN_CARRIAGES) {
        if (carriage.type === 'soft-seat') {
            for (let row = 1; row <= 16; row++) {
                for (const pos of ['A', 'B', 'C', 'D']) {
                    const seatNumber = `${carriage.number}-${pos}${row}`;
                    if (mode === 'full') {
                        seats.push({
                            seatId: seatIdCounter++,
                            id: seatNumber,
                            status: Math.random() > 0.3 ? 'available' : 'booked',
                            carriage: carriage.number,
                            row: row,
                            position: pos,
                            floor: 1,
                        });
                    }
                    else {
                        seats.push(seatNumber);
                    }
                }
            }
        }
        else if (carriage.type === 'bed-cabin-6') {
            const numCabins = 7;
            for (let cabin = 1; cabin <= numCabins; cabin++) {
                for (let bed = 1; bed <= 6; bed++) {
                    const seatNumber = `${carriage.number}-${cabin}B${bed}`;
                    if (mode === 'full') {
                        seats.push({
                            seatId: seatIdCounter++,
                            id: seatNumber,
                            status: Math.random() > 0.4 ? 'available' : 'booked',
                            carriage: carriage.number,
                            row: cabin,
                            position: bed.toString(),
                            floor: Math.ceil(bed / 2),
                        });
                    }
                    else {
                        seats.push(seatNumber);
                    }
                }
            }
        }
        else if (carriage.type === 'bed-cabin-4' || carriage.type === 'vip-cabin') {
            const numCabins = 7;
            for (let cabin = 1; cabin <= numCabins; cabin++) {
                for (let bed = 1; bed <= 4; bed++) {
                    const seatNumber = `${carriage.number}-${cabin}B${bed}`;
                    if (mode === 'full') {
                        seats.push({
                            seatId: seatIdCounter++,
                            id: seatNumber,
                            status: Math.random() > 0.5 ? 'available' : 'booked',
                            carriage: carriage.number,
                            row: cabin,
                            position: bed.toString(),
                            floor: Math.ceil(bed / 2),
                        });
                    }
                    else {
                        seats.push(seatNumber);
                    }
                }
            }
        }
    }
    return seats;
}
export function getTempIdToSeatNumberMap() {
    const mapping = new Map();
    const seats = generateTrainSeats('full');
    for (const seat of seats) {
        mapping.set(seat.seatId, seat.id);
    }
    return mapping;
}
