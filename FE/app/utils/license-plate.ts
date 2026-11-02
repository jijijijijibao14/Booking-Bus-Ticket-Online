export function formatVietnameseLicensePlate(value: string | null | undefined): string {
  const plate = (value || '').trim().toUpperCase();
  const compact = plate.replace('-', '');
  if (/^[0-9]{2}[A-Z][0-9]{5}$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  }
  return plate;
}

export function isValidVietnameseLicensePlate(value: string): boolean {
  return /^[0-9]{2}[A-Z]-[0-9]{5}$/i.test(value.trim());
}
