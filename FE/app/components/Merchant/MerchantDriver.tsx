import React from 'react';
import { Plus, Users } from 'lucide-react';

type Props = {
  drivers: any[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
};

export default function MerchantDriver({ drivers, loading, error, onAdd, onEdit, onDelete }: Props) {
  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Quản Lý Tài Xế</h2>
          <p className="text-muted-foreground">Danh sách tài xế và phân công</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-5 h-5" />
          Thêm Tài Xế
        </button>
      </div>

      {renderContent(
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drivers.map((driver: any) => (
            <div key={driver.id} className="bg-white rounded-xl p-6 border border-border">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{driver.name}</h3>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs ${driver.status === 'available' ? 'bg-green-100 text-green-700' : driver.status === 'on-trip' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                >
                  {driver.status === 'available' ? 'Sẵn sàng' : driver.status === 'on-trip' ? 'Đang chạy' : 'Nghỉ'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số điện thoại:</span>
                  <span className="font-semibold">{driver.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kinh nghiệm(năm):</span>
                  <span className="font-semibold">{driver.experience}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => onEdit(driver)} className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90">
                  Chỉnh sửa
                </button>
                <button onClick={() => onDelete(driver)} className="px-3 py-1 rounded-lg bg-red-600 text-white hover:opacity-90">
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
