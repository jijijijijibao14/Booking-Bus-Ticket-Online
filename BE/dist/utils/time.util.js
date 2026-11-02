/**
 * Adds a specific number of hours to a local ISO datetime string (e.g. "2026-07-15T08:05")
 * and formats the result as "YYYY-MM-DD HH:mm:ss" in local time.
 * This prevents timezone conversion issues when using toISOString().
 */
export function addHoursLocal(dateTimeStr, hours) {
    return addMinutesLocal(dateTimeStr, hours * 60);
}
export function addMinutesLocal(dateTimeStr, minutes) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dateTimeStr);
    if (!match || !Number.isSafeInteger(minutes)) {
        throw new Error('Ngày giờ hoặc thời lượng không hợp lệ.');
    }
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0)) + minutes * 60_000;
    return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}
