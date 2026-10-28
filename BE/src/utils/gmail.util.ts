import { google, type gmail_v1 } from 'googleapis';
import type { Credentials } from 'google-auth-library';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  `http://localhost:${process.env.PORT ?? '3001'}/api/gmail/oauth2callback`;

export const TOKEN_PATH = fileURLToPath(
  new URL('../../gmail-token.json', import.meta.url),
);

export const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

export function isGmailOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export async function saveGmailTokens(
  tokens: Credentials,
): Promise<void> {
  let previousTokens: Credentials = {};

  try {
    previousTokens = JSON.parse(await readFile(TOKEN_PATH, 'utf8')) as Credentials;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  const updatedTokens = Object.fromEntries(
    Object.entries(tokens).filter(([, value]) => value !== undefined),
  ) as Credentials;

  await writeFile(
    TOKEN_PATH,
    JSON.stringify({ ...previousTokens, ...updatedTokens }, null, 2),
    { mode: 0o600 },
  );
}

oauth2Client.on('tokens', (tokens) => {
  void saveGmailTokens(tokens).catch((error: unknown) => {
    console.error('Could not persist refreshed Gmail OAuth tokens:', error);
  });
});

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  if (!isGmailOAuthConfigured()) {
    throw new Error(
      'Gmail OAuth chưa được cấu hình. Hãy điền GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong BE/.env.',
    );
  }

  let tokenContent: string;
  try {
    tokenContent = await readFile(TOKEN_PATH, 'utf8');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new Error(
        'Chưa kết nối Gmail. Hãy mở /api/gmail/auth/google và cấp quyền Gmail trước.',
      );
    }
    throw error;
  }

  const credentials = JSON.parse(tokenContent) as Credentials;
  if (!credentials.refresh_token && !credentials.access_token) {
    throw new Error(
      'Token Gmail không hợp lệ. Hãy kết nối lại tại /api/gmail/auth/google.',
    );
  }

  oauth2Client.setCredentials(credentials);
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export interface GmailEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function base64MimeBody(value: string): string {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function encodeSubject(subject: string): string {
  const chunks: string[] = [];
  let chunk = '';

  for (const character of subject) {
    if (Buffer.byteLength(chunk + character, 'utf8') > 45 && chunk) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);

  return chunks
    .map((value) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`)
    .join('\r\n ');
}

export async function sendGmailEmail(email: GmailEmail): Promise<void> {
  const gmail = await getGmailClient();
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  if (!profile.emailAddress) {
    throw new Error('Không xác định được địa chỉ Gmail gửi thư đã kết nối.');
  }

  const boundary = `vietgo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const rawMessage = [
    `From: VIETGO <${profile.emailAddress}>`,
    `To: ${email.to}`,
    `Subject: ${encodeSubject(email.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64MimeBody(email.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64MimeBody(email.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: Buffer.from(rawMessage, 'utf8').toString('base64url'),
    },
  });
}
