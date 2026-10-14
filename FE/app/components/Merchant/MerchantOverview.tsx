import React from 'react';
import { LayoutDashboard, Bus, Users, Calendar, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

type Props = {
  stats: any;
  schedules: any[];
  loading: boolean;
  error: string | null;
};

export default function MerchantOverview({ stats, schedules, loading, error }: Props) {
  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  return renderContent(
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Tổng Quan</h2>
        <p className="text-muted-foreground">Tổng quan hoạt động kinh doanh</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <h3 className="text-muted-foreground text-sm mb-1">Doanh Thu Tháng Này</h3>
          <p className="text-3xl font-bold text-foreground">{(stats.currentMonthRevenue / 1000000 || 0).toFixed(0)}M₫</p>
          <p className="text-xs text-green-600 mt-2">+{stats.revenueGrowth || 0}% so với tháng trước</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-muted-foreground text-sm mb-1">Vé Đã Bán</h3>
          <p className="text-3xl font-bold text-foreground">{stats.ticketsSold || 0}</p>
          <p className="text-xs text-muted-foreground mt-2">Tháng 6/2026</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
              <Bus className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <h3 className="text-muted-foreground text-sm mb-1">Tỷ Lệ Lấp Đầy</h3>
          <p className="text-3xl font-bold text-foreground">{stats.occupancyRate || 0}%</p>
          <p className="text-xs text-muted-foreground mt-2">Trung bình</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <h3 className="text-muted-foreground text-sm mb-1">Tài Xế Hoạt Động</h3>
          <p className="text-3xl font-bold text-foreground">{stats.activeDrivers || 0}/{stats.totalDrivers || 0}</p>
          <p className="text-xs text-muted-foreground mt-2">Đang sẵn sàng</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-border">
          <h3 className="font-semibold mb-4">Lịch Trình</h3>
          <div className="space-y-3">
            {(schedules.length > 0 ? schedules : stats.todaySchedules || []).slice(0, 3).map((schedule: any) => (
              <div key={schedule.id} className="p-4 rounded-lg bg-muted border border-border">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold">{schedule.route}</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">{schedule.departure}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>Xe: {schedule.bus}</div>
                  <div>Tài xế: {schedule.driver?.split(' ').pop()}</div>
                  <div>Đã đặt: {schedule.seats}</div>
                  <div>Giá: {schedule.price.toLocaleString()}₫</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-border">
          <h3 className="font-semibold mb-4">Thông Báo</h3>
          <div className="space-y-3">
            {(stats.notifications || []).map((notif: any, index: number) => (
              <div key={index} className={`flex gap-3 p-4 rounded-lg border ${notif.type === 'warning' ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
                <AlertCircle className={`w-5 h-5 flex-shrink-0 ${notif.type === 'warning' ? 'text-orange-600' : 'text-blue-600'}`} />
                <div>
                  <h4 className="font-semibold text-sm mb-1">{notif.title}</h4>
                  <p className="text-xs text-muted-foreground">{notif.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
