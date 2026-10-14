import React from 'react';
import { Plus } from 'lucide-react';

type Props = {
  buses: any[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
};

export default function MerchantVehicle({ buses, loading, error, onAdd, onEdit, onDelete }: Props) {
  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Quản Lý Xe</h2>
          <p className="text-muted-foreground">Danh sách và thông tin các xe</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-5 h-5" />
          Thêm Xe Mới
        </button>
      </div>

      {renderContent(
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left p-4 font-semibold text-sm">ID</th>
                <th className="text-left p-4 font-semibold text-sm">Biển Số</th>
                <th className="text-left p-4 font-semibold text-sm">Loại Xe</th>
                <th className="text-left p-4 font-semibold text-sm">Số Ghế</th>
                <th className="text-left p-4 font-semibold text-sm">Trạng Thái</th>
                <th className="text-left p-4 font-semibold text-sm">Hạng xe</th>
                <th className="text-left p-4 font-semibold text-sm">Chức năng</th>
              </tr>
            </thead>
            <tbody>
              {buses.map((bus: any) => (
                <tr key={bus.id} className="border-b border-border hover:bg-muted/50">
                  <td className="p-4 font-mono text-sm">{bus.id}</td>
                  <td className="p-4 font-semibold">{bus.plate_number || bus.plateNumber}</td>
                  <td className="p-4">{bus.type}</td>
                  <td className="p-4">{bus.seats}</td>
                  <td className={`p-4 ${(bus.status || '').toString().toLowerCase() === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                    {bus.status}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">{bus.name}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button onClick={() => onEdit(bus)} className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90">
                        Chỉnh sửa
                      </button>
                      <button onClick={() => onDelete(bus)} className="px-3 py-1 rounded-lg bg-red-600 text-white hover:opacity-90">
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
