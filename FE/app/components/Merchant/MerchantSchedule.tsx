import React from 'react';
import { Plus } from 'lucide-react';

type Props = {
  schedules: any[];
  buses: any[];
  drivers: any[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
};

export default function MerchantSchedule({ schedules, buses, drivers, loading, error, onAdd, onEdit, onDelete }: Props) {
  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  const [tab, setTab] = React.useState<'active' | 'completed'>('active');
  const activeSchedules = schedules.filter((schedule) => schedule.status === 'Scheduled' || schedule.status === 'Departed');
  const completedSchedules = schedules.filter((schedule) => schedule.status === 'Completed' || schedule.status === 'Cancelled');

  const renderScheduleTable = (items: any[]) => (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted border-b border-border">
          <tr>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Tuyến Đường</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Xe</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Tài Xế</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Thời Gian Đi</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Đã Đặt</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Giá</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Trạng Thái</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Hành Động</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-4 text-center text-sm text-muted-foreground">
                Không có lịch trình.
              </td>
            </tr>
          ) : (
            items.map((schedule: any) => (
              <tr key={schedule.id} className="border-b border-border hover:bg-muted/50">
                <td className="p-4 font-semibold">{schedule.route}</td>
                <td className="p-4 font-mono text-sm">{schedule.bus}</td>
                <td className="p-4">
                  <div className="text-sm font-semibold">{schedule.driver || 'Chưa có'}</div>
                </td>
                <td className="p-4">
                  {`${new Date(schedule.departureTime).toLocaleDateString('vi-VN')} - ${new Date(
                    schedule.departureTime
                  ).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`}
                </td>
                <td className="p-4">
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    {schedule.seats}
                  </span>
                </td>
                <td className="p-4 font-semibold">{schedule.price.toLocaleString()}₫</td>
                <td className={`p-4 font-semibold ${schedule.status === 'Scheduled' ? 'text-yellow-600' : schedule.status === 'Departed' ? 'text-blue-600' : schedule.status === 'Completed' ? 'text-green-600' : 'text-gray-600'}`}>
                  {schedule.status === 'Scheduled' ? 'Đã Lên Lịch' : schedule.status === 'Departed' ? 'Đang Chạy' : schedule.status === 'Completed' ? 'Đã Hoàn Thành' : 'Đã Hủy'}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {schedule.status !== 'Completed' && schedule.status !== 'Cancelled' ? (
                      <button onClick={() => onEdit(schedule)} className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90">
                        Sửa
                      </button>
                    ) : null}
                    <button onClick={() => onDelete(schedule)} className="px-3 py-1 rounded-lg bg-red-600 text-white hover:opacity-90">
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Lịch Trình</h2>
          <p className="text-muted-foreground">Quản lý các chuyến đi và cập nhật thông tin.</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90">
          <Plus className="w-5 h-5" />
          Tạo Chuyến Mới
        </button>
      </div>

      {renderContent(
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 border-b border-border pb-2 mb-4">
            <button
              onClick={() => setTab('active')}
              className={`px-4 py-2 rounded-lg font-semibold ${tab === 'active' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              Lịch Trình Mới
            </button>
            <button
              onClick={() => setTab('completed')}
              className={`px-4 py-2 rounded-lg font-semibold ${tab === 'completed' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              Đã Hoàn Thành / Đã Hủy
            </button>
          </div>

          <div>
            {tab === 'active' ? renderScheduleTable(activeSchedules) : renderScheduleTable(completedSchedules)}
          </div>
        </div>
      )}
    </>
  );
}
