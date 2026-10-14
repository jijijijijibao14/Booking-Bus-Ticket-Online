/**
 * Adds a specific number of hours to a local ISO datetime string (e.g. "2026-07-15T08:05")
 * and formats the result as "YYYY-MM-DD HH:mm:ss" in local time.
 * This prevents timezone conversion issues when using toISOString().
 */
export function addHoursLocal(dateTimeStr: string, hours: number): string {
  const date = new Date(dateTimeStr);
  date.setHours(date.getHours() + hours);

  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}
