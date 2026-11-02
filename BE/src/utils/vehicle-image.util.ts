import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const vehicleImagesDirectory = resolve(moduleDirectory, '../../uploads/vehicles');

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

function getVehicleImageFilename(vehicleId: number, extension: string): string {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) {
    throw new Error('ID xe không hợp lệ.');
  }
  return `${vehicleId}${extension}`;
}

export function validateVehicleImage(file: Express.Multer.File): string {
  const imageType = imageTypes[file.mimetype as keyof typeof imageTypes];
  if (!imageType || !imageType.matches(file.buffer)) {
    throw new Error('Nội dung ảnh không đúng định dạng JPG, PNG hoặc WebP.');
  }
  return imageType.extension;
}

export async function saveVehicleImage(
  file: Express.Multer.File,
  vehicleId: number,
): Promise<string> {
  const extension = validateVehicleImage(file);

  await mkdir(vehicleImagesDirectory, { recursive: true });
  const filename = getVehicleImageFilename(vehicleId, extension);
  const destination = resolve(vehicleImagesDirectory, filename);
  const temporaryPath = resolve(vehicleImagesDirectory, `.${vehicleId}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, file.buffer, { flag: 'wx' });
    await copyFile(temporaryPath, destination);
    await unlink(temporaryPath);
    await removeVehicleImage(vehicleId, extension);
    return `/api/trips/vehicles/${vehicleId}/image`;
  } catch (error) {
    await unlink(temporaryPath).catch((cleanupError: NodeJS.ErrnoException) => {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    });
    throw error;
  }
}

export async function findVehicleImagePath(vehicleId: number): Promise<string | null> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) return null;

  for (const extension of Object.values(imageTypes).map(({ extension: value }) => value)) {
    const imagePath = resolve(vehicleImagesDirectory, getVehicleImageFilename(vehicleId, extension));
    try {
      await access(imagePath);
      return imagePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function removeVehicleImage(vehicleId: number, exceptExtension?: string): Promise<void> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) return;

  const filenames: string[] = await readdir(vehicleImagesDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const extensions = Object.values(imageTypes).map(({ extension }) => extension);
  for (const extension of extensions) {
    if (extension === exceptExtension || !filenames.includes(getVehicleImageFilename(vehicleId, extension))) {
      continue;
    }
    await unlink(resolve(vehicleImagesDirectory, getVehicleImageFilename(vehicleId, extension)));
  }
}
