// BE/src/utils/email.util.ts
import nodemailer from 'nodemailer';

export const sendTicketEmailUtil = async (toEmail: string, base64Image: string) => {
  // Cấu hình người gửi (Dùng tài khoản trong file .env của bạn)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Xử lý cắt bỏ phần rác "data:image/png;base64," mà Frontend gửi lên
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  // Biến chuỗi mã hóa thành bộ nhớ đệm (Buffer) để nhét vào file ảnh
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const mailOptions = {
    from: `"Hệ Thống Đặt Vé VIETGO" <${process.env.EMAIL_USER}>`,
    to: toEmail, // Email do người dùng tự nhập truyền vào đây
    subject: '🎟️ Vé Điện Tử Của Bạn - VIETGO',
    // Bố cục hiển thị trong Gmail
    html: `
      <h2>Cảm ơn bạn đã sử dụng dịch vụ của VIETGO!</h2>
      <p>Hành trình của bạn đã được xác nhận. Dưới đây là vé điện tử của bạn. Vui lòng lưu lại để xuất trình khi làm thủ tục (quét mã QR).</p>
      <br/>
      <img src="cid:ticket_image" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
    `,
    attachments: [
      {
        filename: 'Vietgo_Ticket.png',
        content: imageBuffer,
        cid: 'ticket_image' // Khớp với thẻ <img src="cid:ticket_image"> ở trên
      }
    ]
  };

  return await transporter.sendMail(mailOptions);
};