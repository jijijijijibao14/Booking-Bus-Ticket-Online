import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from './AdminSectionShared';

type AnalyticsData = {
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  revenueChangePercent: number | null;
  currentMonthCompletedTrips: number;
  totalCommissionRevenue: number;
  totalCompletedTrips: number;
  monthlyRevenue: { month: string; revenue: number }[];
};

function monthLabel(value: string) {
  const [year, month] = value.split('-');
  return month && year ? `${month}/${year}` : value;
}

export default function AnalyticsSection({ data }: { data: AnalyticsData | null }) {
  const metrics = [
    { label: 'Hoa hồng Admin tháng này', value: formatMoney(data?.currentMonthRevenue) },
    {
      label: 'Chuyến hoàn thành tháng này',
      value: Number(data?.currentMonthCompletedTrips ?? 0).toLocaleString('vi-VN'),
    },
    { label: 'Tổng hoa hồng Admin', value: formatMoney(data?.totalCommissionRevenue) },
    {
      label: 'Tổng chuyến đã quyết toán',
      value: Number(data?.totalCompletedTrips ?? 0).toLocaleString('vi-VN'),
    },
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{metric.value}</p>
            {metric.label === 'Hoa hồng Admin tháng này' && (
              <p className="mt-2 text-sm text-slate-500">
                {data?.revenueChangePercent == null
                  ? 'Chưa có dữ liệu tháng trước để so sánh'
                  : `${data.revenueChangePercent >= 0 ? 'Tăng' : 'Giảm'} ${Math.abs(data.revenueChangePercent)}% so với tháng trước`}
              </p>
            )}
          </article>
        ))}
      </div>

      <article className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold text-slate-900">Doanh thu 6 tháng gần nhất</h3>
        <p className="mt-1 text-sm text-slate-500">
          Chỉ tính hoa hồng Admin từ chuyến đã hoàn thành và quyết toán; tiền vé thu hộ chưa được tính là doanh thu.
        </p>
        <div className="mt-5 h-80">
          {data?.monthlyRevenue?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyRevenue} margin={{ top: 8, right: 20, bottom: 8, left: 12 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="month" tickFormatter={monthLabel} />
                <YAxis tickFormatter={(value: number) => `${(value / 1_000_000).toLocaleString('vi-VN')}M`} />
                <Tooltip
                  labelFormatter={(value) => monthLabel(String(value))}
                  formatter={(value) => [formatMoney(value), 'Hoa hồng Admin']}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Hoa hồng Admin"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Chưa có dữ liệu doanh thu.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
