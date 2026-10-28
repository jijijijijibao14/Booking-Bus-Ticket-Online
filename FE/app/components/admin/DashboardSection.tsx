import { PageControls, Status, formatDate, formatMoney } from './AdminSectionShared';

export default function DashboardSection({
  overview,
  page,
  onPageChange,
}: {
  overview: any;
  page: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Tổng người dùng', overview?.summary?.totalUsers],
          ['Tổng đối tác', overview?.summary?.totalPartners],
          ['Tổng vé', overview?.summary?.totalTickets],
          ['Tổng giao dịch', overview?.summary?.totalTransactions],
          ['Đối tác hoạt động', overview?.summary?.activePartners],
          ['Tổng booking', overview?.summary?.totalBookings],
          ['Đối tác chờ duyệt', overview?.summary?.pendingPartners],
          ['Yêu cầu hoàn tiền chờ', overview?.summary?.pendingRefunds],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value == null ? '—' : Number(value).toLocaleString('vi-VN')}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-4 font-semibold">Tài chính (dữ liệu hiện có)</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Số dư ví hệ thống</span><strong>{overview?.summary?.systemWalletBalance == null ? 'Backend chưa cung cấp' : formatMoney(overview.summary.systemWalletBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Ví hoa hồng</span><strong>{overview?.summary?.commissionWalletBalance == null ? 'Backend chưa cung cấp' : formatMoney(overview.summary.commissionWalletBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Đối tác có thể chi trả</span><strong>{formatMoney(overview?.summary?.partnerWithdrawableBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Booking đã hoàn tất</span><strong>{formatMoney(overview?.summary?.completedBookingRevenue)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Hoàn tiền đã duyệt</span><strong>{formatMoney(overview?.summary?.approvedRefundTotal)}</strong></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold">Doanh thu booking đã thanh toán</h3>
          {overview?.revenue?.items?.length ? (
            <div className="max-h-64 space-y-2 overflow-auto">
              {overview.revenue.items.map((item: any) => (
                <div key={String(item.date)} className="flex justify-between border-b py-2 text-sm">
                  <span>{formatDate(item.date)}</span><strong>{formatMoney(item.revenue)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Backend chưa có dữ liệu doanh thu.</p>}
          {overview?.revenue?.total > 20 && <PageControls page={page} total={overview.revenue.total} onChange={onPageChange} />}
        </div>
      </div>
      <div className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 font-semibold">Hoạt động gần đây</h3>
        {overview?.activities?.items?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Loại</th><th>Tham chiếu</th><th>Người liên quan</th><th>Số tiền</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
              <tbody>{overview.activities.items.map((item: any, index: number) => (
                <tr key={`${item.type}-${item.reference}-${index}`} className="border-b last:border-0">
                  <td className="py-3">{item.type}</td><td>{item.reference ?? '—'}</td><td>{item.actor}</td>
                  <td className={Number(item.amount) < 0 ? 'text-red-700' : 'text-green-700'}>{formatMoney(item.amount)}</td>
                  <td><Status value={item.status} /></td><td>{formatDate(item.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Chưa có hoạt động để hiển thị.</p>}
        {overview?.activities?.total > 20 && <PageControls page={page} total={overview.activities.total} onChange={onPageChange} />}
      </div>
    </section>
  );
}
