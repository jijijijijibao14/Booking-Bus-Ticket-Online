import crypto from 'crypto';
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Thiếu biến môi trường ${name}.`);
    }
    return value;
}
/**
 * Lấy ngày giờ Việt Nam theo định dạng yyyyMMddHHmmss.
 */
export function formatVNPayDate(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const getPart = (type) => parts.find((part) => part.type === type)?.value ?? '';
    return (getPart('year') +
        getPart('month') +
        getPart('day') +
        getPart('hour') +
        getPart('minute') +
        getPart('second'));
}
/**
 * Mã hóa tham số theo định dạng query string mà VNPAY sử dụng.
 */
function encodeVNPayValue(value) {
    return encodeURIComponent(value).replace(/%20/g, '+');
}
/**
 * Sắp xếp tham số theo alphabet và tạo chuỗi dùng để ký checksum.
 */
export function buildVNPayQuery(params) {
    return Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== '')
        .sort()
        .map((key) => {
        const value = String(params[key]);
        return `${encodeVNPayValue(key)}=${encodeVNPayValue(value)}`;
    })
        .join('&');
}
/**
 * Tạo chữ ký HMAC-SHA512.
 */
export function createVNPaySecureHash(params) {
    const hashSecret = requireEnv('VNP_HASH_SECRET');
    const signData = buildVNPayQuery(params);
    return crypto
        .createHmac('sha512', hashSecret)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');
}
/**
 * Xác minh chữ ký VNPAY trả về.
 */
export function verifyVNPaySecureHash(rawParams) {
    const receivedHash = String(rawParams.vnp_SecureHash ?? '');
    if (!receivedHash) {
        return false;
    }
    const params = {};
    for (const [key, value] of Object.entries(rawParams)) {
        if (key !== 'vnp_SecureHash' &&
            key !== 'vnp_SecureHashType' &&
            value !== undefined) {
            params[key] = String(value);
        }
    }
    const expectedHash = createVNPaySecureHash(params);
    const receivedBuffer = Buffer.from(receivedHash.toLowerCase(), 'utf-8');
    const expectedBuffer = Buffer.from(expectedHash.toLowerCase(), 'utf-8');
    if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
/**
 * Tạo URL thanh toán hoàn chỉnh.
 */
export function buildVNPayPaymentUrl(params) {
    const vnpayUrl = requireEnv('VNP_URL');
    const secureHash = createVNPaySecureHash(params);
    const queryString = buildVNPayQuery(params);
    return `${vnpayUrl}?${queryString}&vnp_SecureHash=${secureHash}`;
}
/**
 * Chuẩn hóa IP từ Express.
 */
export function normalizeIpAddress(ipAddress) {
    if (!ipAddress) {
        return '127.0.0.1';
    }
    return ipAddress
        .replace('::ffff:', '')
        .replace('::1', '127.0.0.1');
}
