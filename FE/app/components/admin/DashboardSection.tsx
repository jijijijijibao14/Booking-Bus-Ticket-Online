import { PageControls, Status, formatDate, formatMoney } from './AdminSectionShared';

const activityLabels: Record<string, string> = {
  booking: 'Booking',
  refund: 'Hoàn tiền',
  payout: 'Chi trả',
  PAYMENT: 'Thu tiền vé (thu hộ)',
  COMMISSION: 'Hoa hồng',
  PARTNER_PAYOUT: 'Chi trả đối tác',
};

export default function DashboardSection({
  overview,
  page,
  onPageChange,
}: {
  overview: any;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const summary = overview?.summary;
  const cards = [
    ['Tổng người dùng', summary?.totalUsers],
    ['Tổng đối tác', summary?.totalPartners],
    ['Tổng vé', summary?.totalTickets],
    ['Tổng giao dịch', summary?.totalTransactions],
    ['Đối tác hoạt động', summary?.activePartners],
    ['Tổng booking', summary?.totalBookings],
    ['Đối tác chờ duyệt', summary?.pendingPartners],
    ['Yêu cầu hoàn tiền chờ', summary?.pendingRefunds],
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={String(label)} className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold">
              {value == null ? '—' : Number(value).toLocaleString('vi-VN')}
            </p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-xl border bg-white p-5">
          <h3 className="mb-4 font-semibold">Tài chính hệ thống</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Số dư ví hệ thống</span><strong>{formatMoney(summary?.systemWalletBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Ví hoa hồng</span><strong>{formatMoney(summary?.commissionWalletBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Đối tác có thể chi trả</span><strong>{formatMoney(summary?.partnerWithdrawableBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Tổng tiền vé đã thu (chưa phải doanh thu)</span><strong>{formatMoney(summary?.collectedBookingAmount)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Tổng tiền vé chuyến đã quyết toán</span><strong>{formatMoney(summary?.settledTripGrossAmount)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Đối tác được nhận</span><strong>{formatMoney(summary?.partnerSettlementAmount)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Doanh thu hoa hồng Admin</span><strong>{formatMoney(summary?.adminCommissionRevenue)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Hoàn tiền đã duyệt</span><strong>{formatMoney(summary?.approvedRefundTotal)}</strong></div>
          </div>
        </article>

        <article className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">Doanh thu hoa hồng Admin theo ngày quyết toán</h3>
          {overview?.revenue?.items?.length ? (
            <div className="max-h-64 space-y-2 overflow-auto">
              {overview.revenue.items.map((item: any) => (
                <div key={String(item.date)} className="flex justify-between border-b py-2 text-sm">
                  <span>{formatDate(item.date)}</span><strong>{formatMoney(item.revenue)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Chưa có dữ liệu doanh thu.</p>}
          {overview?.revenue?.total > 20 && <PageControls page={page} total={overview.revenue.total} onChange={onPageChange} />}
        </article>
      </div>

      <article className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 font-semibold">Hoạt động gần đây</h3>
        {overview?.activities?.items?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Loại</th><th>Tham chiếu</th><th>Người liên quan</th>
                  <th>Số tiền</th><th>Trạng thái</th><th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {overview.activities.items.map((item: any, index: number) => (
                  <tr key={`${item.type}-${item.reference}-${index}`} className="border-b last:border-0">
                    <td className="py-3">{activityLabels[item.type] ?? item.type}</td>
                    <td>{item.reference ?? '—'}</td>
                    <td>{item.actor}</td>
                    <td className={Number(item.amount) < 0 ? 'text-red-700' : 'text-green-700'}>{formatMoney(item.amount)}</td>
                    <td><Status value={item.status} /></td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Chưa có hoạt động để hiển thị.</p>}
        {overview?.activities?.total > 20 && <PageControls page={page} total={overview.activities.total} onChange={onPageChange} />}
      </article>
    </section>
  );
}
