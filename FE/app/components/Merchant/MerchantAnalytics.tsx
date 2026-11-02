import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Ticket, Percent, TrendingUp, TrendingDown, Star, MessageSquare, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMerchantFeedback } from '@/api';

interface Props {
  stats: any;
  revenueData: any[];
}

const formatMillions = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}M₫`;

export default function MerchantAnalytics({ stats, revenueData }: Props) {
  const [feedback, setFeedback] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    getMerchantFeedback()
      .then((res) => mounted && setFeedback(res.data.data || []))
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const data = revenueData || [];
    const total = data.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
    const best = data.reduce((top, item) => (Number(item.revenue || 0) > Number(top?.revenue || 0) ? item : top), data[0]);
    const average = data.length ? total / data.length : 0;
    return { total, best, average };
  }, [revenueData]);

  const ratingStats = useMemo(() => {
    const count = feedback.length;
    const average = count ? feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count : 0;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: feedback.filter((item) => Number(item.rating) === star).length,
    }));
    const replied = feedback.filter((item) => item.partnerReply).length;
    return { count, average, distribution, replied };
  }, [feedback]);

  const growth = Number(stats.revenueGrowth || 0);
  const GrowthIcon = growth >= 0 ? TrendingUp : TrendingDown;
  const monthlyRows = [...(revenueData || [])].reverse();
  const maxRevenue = Math.max(...(revenueData || []).map((item) => Number(item.revenue || 0)), 0);

  const cards = [
    { label: 'Doanh thu tháng này', value: formatMillions((stats.currentMonthRevenue || 0) / 1000000), icon: DollarSign, color: 'bg-blue-100 text-blue-700',
      note: <span className={`flex items-center gap-1 ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}><GrowthIcon className="h-3 w-3" />{growth >= 0 ? '+' : ''}{growth}% so với tháng trước</span> },
    { label: 'Tổng doanh thu 6 tháng', value: formatMillions(summary.total), icon: TrendingUp, color: 'bg-emerald-100 text-emerald-700',
      note: `Trung bình ${formatMillions(summary.average)}/tháng` },
    { label: 'Vé bán trong tháng', value: String(stats.ticketsSold || 0), icon: Ticket, color: 'bg-amber-100 text-amber-700',
      note: summary.best?.revenue ? `Tháng cao nhất: ${summary.best.month}` : 'Chưa có dữ liệu' },
    { label: 'Tỷ lệ lấp đầy', value: `${stats.occupancyRate || 0}%`, icon: Percent, color: 'bg-purple-100 text-purple-700',
      note: `Tài xế hoạt động ${stats.activeDrivers || 0}/${stats.totalDrivers || 0}` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.color}`}><card.icon className="h-5 w-5" /></span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            <div className="mt-2 text-xs text-muted-foreground">{card.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-6">
          <h3 className="mb-4 font-semibold">Doanh Thu 6 Tháng Gần Nhất</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${value}M`} />
              <Tooltip formatter={(value) => `${value}M₫`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#1e3a8a" strokeWidth={3} name="Doanh thu (triệu)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-white p-6">
          <h3 className="mb-4 font-semibold">So Sánh Doanh Thu Theo Tháng</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${value}M`} />
              <Tooltip formatter={(value) => `${value}M₫`} />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Doanh thu (triệu)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-6">
          <h3 className="mb-4 font-semibold">Chi Tiết Doanh Thu Theo Tháng</h3>
          <div className="space-y-3">
            {monthlyRows.map((row) => {
              const value = Number(row.revenue || 0);
              return (
                <div key={row.month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">{row.month}</span>
                    <span className="font-semibold">{formatMillions(value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-600" style={{ width: `${maxRevenue ? (value / maxRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6">
          <h3 className="mb-4 font-semibold">Chất Lượng Dịch Vụ</h3>
          <div className="mb-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-amber-50 p-3">
              <Star className="mx-auto mb-1 h-5 w-5 fill-amber-400 text-amber-400" />
              <p className="text-xl font-bold">{ratingStats.average.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Điểm trung bình</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <MessageSquare className="mx-auto mb-1 h-5 w-5 text-blue-600" />
              <p className="text-xl font-bold">{ratingStats.count}</p>
              <p className="text-xs text-muted-foreground">Lượt đánh giá</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <Users className="mx-auto mb-1 h-5 w-5 text-green-600" />
              <p className="text-xl font-bold">{ratingStats.replied}/{ratingStats.count}</p>
              <p className="text-xs text-muted-foreground">Đã phản hồi</p>
            </div>
          </div>
          <div className="space-y-2">
            {ratingStats.distribution.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-3 text-sm">
                <span className="flex w-8 items-center gap-1">{star}<Star className="h-3 w-3 fill-amber-400 text-amber-400" /></span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-amber-400" style={{ width: `${ratingStats.count ? (count / ratingStats.count) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-right text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
