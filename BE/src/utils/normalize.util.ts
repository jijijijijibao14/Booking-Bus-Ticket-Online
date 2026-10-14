/**
 * Normalizes location names to ensure consistent search and storage.
 * - Trims leading and trailing spaces
 * - Replaces multiple consecutive spaces with a single space
 * - Standardizes "TP.Hồ Chí Minh", "TP.HCM" and other variations to "TP. Hồ Chí Minh" (adds a space after dot)
 */
export function normalizeLocation(loc: string): string {
  if (!loc) return '';
  return loc
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/TP\.(?!\s)/g, 'TP. '); // "TP.Hồ Chí Minh" -> "TP. Hồ Chí Minh"
}
