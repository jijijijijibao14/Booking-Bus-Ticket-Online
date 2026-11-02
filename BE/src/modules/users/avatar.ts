import multer from 'multer';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, RequestHandler, Response } from 'express';

// Ảnh đại diện lưu dưới dạng file `{user_id}.{ext}`, không cần thay đổi database.
const avatarsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../uploads/avatars',
);

const imageTypes = {
  'image/jpeg': {
    extension: '.jpg',
    matches: (buffer: Buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    matches: (buffer: Buffer) =>
      buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/webp': {
    extension: '.webp',
    matches: (buffer: Buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
} as const;

const extensions = Object.values(imageTypes).map(({ extension }) => extension);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!(file.mimetype in imageTypes)) {
      callback(new Error('Ảnh đại diện chỉ hỗ trợ định dạng JPG, PNG hoặc WebP.'));
      return;
    }
    callback(null, true);
  },
}).single('avatar');

export const uploadAvatarFile: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Ảnh đại diện không được vượt quá 2 MB.'
      : error.message;
    res.status(400).json({ success: false, message });
  });
};

const isValidId = (id: number) => Number.isSafeInteger(id) && id > 0;

async function findAvatarPath(userId: number): Promise<string | null> {
  for (const extension of extensions) {
    const path = resolve(avatarsDirectory, `${userId}${extension}`);
    try {
      await access(path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function saveAvatar(req: Request, res: Response): Promise<void> {
  const userId = Number((req as any).user?.user_id);
  const file = req.file;
  if (!isValidId(userId)) {
    res.status(403).json({ success: false, message: 'Không xác định được người dùng.' });
    return;
  }
  const imageType = file && imageTypes[file.mimetype as keyof typeof imageTypes];
  if (!file || !imageType || !imageType.matches(file.buffer)) {
    res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP hợp lệ.' });
    return;
  }

  try {
    await mkdir(avatarsDirectory, { recursive: true });
    await writeFile(resolve(avatarsDirectory, `${userId}${imageType.extension}`), file.buffer);
    for (const extension of extensions) {
      if (extension !== imageType.extension) {
        await unlink(resolve(avatarsDirectory, `${userId}${extension}`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    }
    res.status(200).json({ success: true, data: { avatarUrl: `/api/users/${userId}/avatar` } });
  } catch (error) {
    console.error('Không thể lưu ảnh đại diện:', error);
    res.status(500).json({ success: false, message: 'Không thể lưu ảnh đại diện.' });
  }
}

export async function getAvatar(req: Request, res: Response): Promise<void> {
  const userId = Number(req.params.userId);
  const path = isValidId(userId) ? await findAvatarPath(userId).catch(() => null) : null;
  if (!path) {
    res.status(404).json({ success: false, message: 'Chưa có ảnh đại diện.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(path);
}
