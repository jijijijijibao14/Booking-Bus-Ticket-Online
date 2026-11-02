import { Router } from 'express';
import { getGmailClient, isGmailOAuthConfigured, oauth2Client, saveGmailTokens, } from '../../utils/gmail.util.js';
export const gmailRouter = Router();
gmailRouter.get('/api/gmail/auth/google', (_req, res) => {
    if (!isGmailOAuthConfigured()) {
        return res.status(503).json({
            success: false,
            message: 'Gmail OAuth ch╞░a ─æ╞░ß╗úc cß║Ñu h├¼nh. H├úy ─æiß╗ün GOOGLE_CLIENT_ID v├á GOOGLE_CLIENT_SECRET trong BE/.env.',
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
            return res.status(503).send('Gmail OAuth ch╞░a ─æ╞░ß╗úc cß║Ñu h├¼nh trong BE/.env.');
        }
        const code = req.query.code;
        if (typeof code !== 'string') {
            return res.status(400).send('Kh├┤ng nhß║¡n ─æ╞░ß╗úc m├ú OAuth tß╗½ Google.');
        }
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        await saveGmailTokens(tokens);
        return res.send('─É├ú kß║┐t nß╗æi Gmail th├ánh c├┤ng. C├│ thß╗â ─æ├│ng trang n├áy.');
    }
    catch (error) {
        console.error('Google OAuth callback failed:', error);
        return res.status(500).send('Kh├┤ng thß╗â ho├án tß║Ñt x├íc thß╗▒c Gmail.');
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
            const subject = headers.find((header) => header.name?.toLowerCase() === 'subject')?.value ?? '';
            const date = headers.find((header) => header.name?.toLowerCase() === 'date')?.value ?? '';
            const match = text.match(/(?:M├ú OTP ─æ─âng k├╜ t├ái khoß║ún VIETGO cß╗ºa bß║ín l├á|OTP|verification code|m├ú x├íc minh|m├ú x├íc thß╗▒c)[^\d]{0,60}(\d{6})/i);
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
            message: 'Kh├┤ng t├¼m thß║Ñy OTP ph├╣ hß╗úp trong 10 email gß║ºn ─æ├óy.',
        });
    }
    catch (error) {
        console.error('Gmail read failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Kh├┤ng thß╗â ─æß╗ìc Gmail. H├úy kiß╗âm tra OAuth v├á token.',
        });
    }
});
