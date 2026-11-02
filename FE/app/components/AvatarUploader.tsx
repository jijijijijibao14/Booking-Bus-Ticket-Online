import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { getCurrentUserId, getPublicAssetUrl, uploadAvatar } from '@/api';

const MAX_SIZE = 2 * 1024 * 1024;

export default function AvatarUploader({ fallback }: { fallback: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = getCurrentUserId();
  const [version, setVersion] = useState(() => Date.now());
  const [hasImage, setHasImage] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('Ảnh không được vượt quá 2 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await uploadAvatar(file);
      setHasImage(true);
      setVersion(Date.now());
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const src = userId && hasImage ? `${getPublicAssetUrl(`/api/users/${userId}/avatar`)}?v=${version}` : null;

  return (
    <div className="mb-3 flex flex-col items-center">
      <div className="relative h-20 w-20">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
          {src ? (
            <img src={src} alt="Ảnh đại diện" className="h-full w-full object-cover" onError={() => setHasImage(false)} />
          ) : (
            fallback
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !userId}
          title="Đổi ảnh đại diện"
          className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-primary shadow hover:bg-muted disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleChange} />
      </div>
      {uploading && <p className="mt-2 text-xs text-muted-foreground">Đang tải ảnh...</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
