type SeatStatus = 'available' | 'booked' | 'selected' | 'holding';

export interface Seat {
  seatId: number;
  id: string;
  status: SeatStatus;
  // Add optional properties to be compatible with both Bus and Train seats
  floor?: number;
  row?: number;
  position?: string;
  carriage?: number;
}

interface SeatButtonProps {
  seat: Seat | undefined;
  onClick: (seat: Seat) => void;
}

const seatStatusClasses = {
  available: 'border-gray-300 bg-[--seat-available] hover:border-primary cursor-pointer',
  booked: 'border-red-300 bg-[--seat-booked] cursor-not-allowed opacity-60',
  selected: 'border-green-500 bg-[--seat-selected] shadow-lg',
  holding: 'border-yellow-400 bg-yellow-100 cursor-not-allowed animate-pulse',
  disabled: 'border-gray-200 bg-gray-100 cursor-not-allowed',
};

export function SeatButton({ seat, onClick }: SeatButtonProps) {
  const isDisabled = !seat || seat.status === 'booked' || seat.status === 'holding';
  
  const statusClass = !seat 
    ? seatStatusClasses.disabled 
    : seatStatusClasses[seat.status] || seatStatusClasses.disabled;

  return (
    <button
      onClick={() => seat && onClick(seat)}
      disabled={isDisabled}
      className={`w-full h-16 rounded-lg border-2 transition-all ${statusClass}`}
    >
      <span className="text-xs font-mono">{seat?.id}</span>
    </button>
  );
}