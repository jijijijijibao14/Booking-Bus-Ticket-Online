import { Router } from 'express';
import { getGmailClient, isGmailOAuthConfigured, oauth2Client, saveGmailTokens, } from '../../utils/gmail.util.js';
export const gmailRouter = Router();
gmailRouter.get('/api/gmail/auth/google', (_req, res) => {
    if (!isGmailOAuthConfigured()) {
        return res.status(503).json({
            success: false,
            message: 'Gmail OAuth chưa được cấu hình. Hãy điền GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong BE/.env.',
        });
    }
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
        ],
    });
    res.redirect(url);
});
const handleOAuthCallback = async (req, res) => {
    try {
        if (!isGmailOAuthConfigured()) {
            return res.status(503).send('Gmail OAuth chưa được cấu hình trong BE/.env.');
        }
        const code = req.query.code;
        if (typeof code !== 'string') {
            return res.status(400).send('Không nhận được mã OAuth từ Google.');
        }
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        await saveGmailTokens(tokens);
        return res.send('Đã kết nối Gmail thành công. Có thể đóng trang này.');
    }
    catch (error) {
        console.error('Google OAuth callback failed:', error);
        return res.status(500).send('Không thể hoàn tất xác thực Gmail.');
    }
};
gmailRouter.get(['/oauth2callback', '/api/gmail/oauth2callback'], handleOAuthCallback);
function decodeBase64Url(data) {
    return Buffer.from(data, 'base64url').toString('utf8');
}
function extractText(payload) {
    if (!payload)
        return '';
    let result = '';
    if (payload.mimeType === 'text/plain' &&
        payload.body?.data) {
        result += decodeBase64Url(payload.body.data);
    }
    for (const part of payload.parts ?? []) {
        result += '\n' + extractText(part);
    }
    return result;
}
gmailRouter.get('/api/gmail/otp', async (_req, res) => {
    try {
        const gmail = await getGmailClient();
        const list = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 10,
            q: 'newer_than:1d',
        });
        for (const message of list.data.messages ?? []) {
            if (!message.id)
                continue;
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full',
            });
            const payload = detail.data.payload;
            const text = extractText(payload);
            const headers = payload?.headers ?? [];
            const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '';
            const date = headers.find((h) => h.name?.toLowerCase() === 'date')?.value ?? '';
            const match = text.match(/(?:Mã OTP đăng ký tài khoản VIETGO của bạn là|OTP|verification code|mã xác minh|mã xác thực)[^\d]{0,60}(\d{6})/i);
            if (match) {
                return res.json({
                    success: true,
                    otp: match[1],
                    subject,
                    date,
                });
            }
        }
        return res.status(404).json({
            success: false,
            message: 'Không tìm thấy OTP phù hợp trong 10 email gần đây.',
        });
    }
    catch (error) {
        console.error('Gmail read failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể đọc Gmail. Hãy kiểm tra OAuth và token.',
        });
    }
});
