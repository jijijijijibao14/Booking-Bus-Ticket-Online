import * as QRCode from 'qrcode';

/**
 * Sinh mã QR Code dưới dạng chuỗi Base64 để lưu vào Database
 * @param data Dữ liệu cần mã hóa (VD: Mã PNR, Thông tin vé)
 * @returns Chuỗi Base64 Data URI
 */
export const generateQRCode = async (data: string): Promise<string> => {
  try {
    const qrCodeDataUri = await QRCode.toDataURL(data);
    return qrCodeDataUri;
  } catch (error) {
    throw new Error('Lỗi khi tạo mã QR Code');
  }
};