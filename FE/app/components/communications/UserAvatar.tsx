import { useState } from 'react';
import { getPublicAssetUrl } from '@/api';

interface UserAvatarProps {
  userId?: number | null;
  name?: string | null;
  className?: string;
}

// Hiển thị avatar của người dùng, tự quay về chữ cái đầu khi chưa có ảnh.
export default function UserAvatar({ userId, name, className = 'h-11 w-11 bg-blue-100 text-blue-700' }: UserAvatarProps) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const id = Number(userId);
  const showImage = Number.isSafeInteger(id) && id > 0 && failedId !== id;

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ${className}`}>
      {showImage ? (
        <img
          src={getPublicAssetUrl(`/api/users/${id}/avatar`)}
          alt={name || 'Avatar'}
          className="h-full w-full object-cover"
          onError={() => setFailedId(id)}
        />
      ) : (
        (name || 'C').trim().charAt(0).toLocaleUpperCase('vi-VN')
      )}
    </span>
  );
}
