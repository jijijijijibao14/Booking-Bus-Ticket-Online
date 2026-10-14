import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
      <div className="max-w-md">
        <h1 className="text-9xl font-black text-primary">404</h1>
        <p className="text-2xl md:text-3xl font-bold text-foreground mt-4 mb-2">Trang không tồn tại</p>
        <p className="text-muted-foreground mb-8">
          Rất tiếc, chúng tôi không thể tìm thấy trang bạn đang tìm kiếm. Có thể trang đã bị xóa hoặc bạn đã gõ sai địa chỉ.
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          Quay về Trang Chủ
        </button>
      </div>
    </div>
  );
}