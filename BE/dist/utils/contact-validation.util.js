const VIETNAM_MOBILE_PHONE = /^0(?:3[2-9]|5[2689]|7[06789]|8[1-9]|9[0-46-9])[0-9]{7}$/;
const VIETNAM_LICENSE_PLATE = /^[0-9]{2}[A-Z][0-9]{5}$/;
const VIETNAM_LICENSE_PLATE_INPUT = /^[0-9]{2}[A-Z]-[0-9]{5}$/;
const BUSINESS_LICENSE_NUMBER = /^GPKD-[0-9]{5}$/;
export function normalizeVietnamesePhone(value) {
    if (typeof value !== 'string') {
        throw new Error('Số điện thoại không hợp lệ.');
    }
    const trimmed = value.trim();
    const digits = trimmed.replace(/[\s().-]/g, '');
    const nationalNumber = digits.startsWith('+84')
        ? `0${digits.slice(3)}`
        : digits.startsWith('84')
            ? `0${digits.slice(2)}`
            : digits;
    if (!VIETNAM_MOBILE_PHONE.test(nationalNumber)) {
        throw new Error('Số điện thoại phải là số di động Việt Nam hợp lệ gồm 10 chữ số.');
    }
    return nationalNumber;
}
export function normalizeVietnameseLicensePlate(value) {
    if (typeof value !== 'string') {
        throw new Error('Biển số xe không hợp lệ.');
    }
    const formatted = value.trim().toUpperCase();
    const normalized = formatted.replace('-', '');
    if (!VIETNAM_LICENSE_PLATE_INPUT.test(formatted) || !VIETNAM_LICENSE_PLATE.test(normalized)) {
        throw new Error('Biển số xe không đúng định dạng Việt Nam.');
    }
    return normalized;
}
export function normalizeBusinessLicenseNumber(value) {
    if (typeof value !== 'string') {
        throw new Error('Số giấy phép kinh doanh không hợp lệ.');
    }
    const normalized = value.trim().toUpperCase();
    if (!BUSINESS_LICENSE_NUMBER.test(normalized)) {
        throw new Error('Số giấy phép kinh doanh phải theo định dạng GPKD-xxxxx (xxxxx là 5 chữ số).');
    }
    return normalized;
}
export async function assertBusinessLicenseAvailable(executor, licenseNumber) {
    const [partners] = await executor.query('SELECT partner_id FROM partner_profiles WHERE UPPER(TRIM(license_number)) = ? LIMIT 1', [licenseNumber]);
    if (partners.length > 0) {
        throw new Error('Số giấy phép kinh doanh đã được sử dụng.');
    }
}
export async function assertPhoneAvailable(executor, phone, exclude) {
    const userCondition = exclude?.userId == null
        ? 'phone_normalized = ?'
        : 'phone_normalized = ? AND user_id <> ?';
    const userValues = exclude?.userId == null
        ? [phone]
        : [phone, exclude.userId];
    const [users] = await executor.query(`SELECT user_id FROM users WHERE ${userCondition} LIMIT 1`, userValues);
    if (users.length > 0) {
        throw new Error('Số điện thoại đã được sử dụng trong hệ thống.');
    }
    const driverCondition = exclude?.driverId == null
        ? 'driver_phone_normalized = ?'
        : 'driver_phone_normalized = ? AND driver_id <> ?';
    const driverValues = exclude?.driverId == null
        ? [phone]
        : [phone, exclude.driverId];
    const [drivers] = await executor.query(`SELECT driver_id FROM drivers WHERE ${driverCondition} LIMIT 1`, driverValues);
    if (drivers.length > 0) {
        throw new Error('Số điện thoại đã được sử dụng trong hệ thống.');
    }
}
