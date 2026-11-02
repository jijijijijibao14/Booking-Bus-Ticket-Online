import { Eye } from 'lucide-react';
import { actionButtonStyles, AdminListLayout, Status, formatDate, formatMoney, type AdminDetail, type AdminListProps } from './AdminSectionShared';

export default function PaymentsSection({
  onViewDetails,
  onCloseFailed,
  statistics,
  topCustomers,
  ...list
}: AdminListProps & {
  onViewDetails: (detail: AdminDetail) => void;
  onCloseFailed: (payment: any) => void;
  statistics: {
    totalTransactions?: number;
    paidTransactions?: number;
    pendingTransactions?: number;
    failedTransactions?: number;
    cancelledTransactions?: number;
    totalCollected?: number;
  } | null;
  topCustomers: any[];
}) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ['Tổng giao dịch', statistics?.totalTransactions],
          ['Đã thanh toán', statistics?.paidTransactions],
          ['Đang chờ xử lý', statistics?.pendingTransactions],
          ['Thất bại', statistics?.failedTransactions],
          ['Đã hủy / đóng', statistics?.cancelledTransactions],
          ['Số tiền đã thu', formatMoney(statistics?.totalCollected)],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-xl border bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold">
              {label === 'Số tiền đã thu'
                ? value
                : Number(value ?? 0).toLocaleString('vi-VN')}
            </p>
          </article>
        ))}
      </div>

      <article className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold">Thống kê theo khách hàng</h3>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          Tối đa 10 khách hàng có tổng tiền thanh toán thành công cao nhất trong bộ lọc hiện tại.
        </p>
        {topCustomers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Khách hàng</th>
                  <th>Tổng giao dịch</th>
                  <th>Đã thanh toán</th>
                  <th className="text-right">Tổng tiền đã thanh toán</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((customer) => (
                  <tr key={customer.customerId} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="font-medium">{customer.customer ?? '—'}</div>
                      <div className="text-xs text-slate-500">{customer.email ?? ''}</div>
                    </td>
                    <td>{Number(customer.totalTransactions ?? 0).toLocaleString('vi-VN')}</td>
                    <td>{Number(customer.paidTransactions ?? 0).toLocaleString('vi-VN')}</td>
                    <td className="text-right font-semibold">{formatMoney(customer.totalPaidAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Không có dữ liệu thanh toán thành công trong bộ lọc.</p>}
      </article>

      <AdminListLayout
        tab="payments"
        columns={['Giao dịch', 'Booking / khách hàng', 'Số tiền', 'Trạng thái', 'Đối soát', 'Thời gian']}
        {...list}
      >
        <tbody>{list.rows.map((item) => {
          const bookingStatuses = Array.isArray(item.bookingStatuses)
            ? item.bookingStatuses
            : typeof item.bookingStatuses === 'string'
              ? item.bookingStatuses.split(',').filter(Boolean)
              : [];

          return (
            <tr key={item.id ?? item.transactionCode} className="border-t align-top hover:bg-slate-50">
              <td className="px-4 py-3">
                <button onClick={() => onViewDetails({ title: `Giao dịch ${item.transactionCode}`, item })} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                  <Eye className="h-3.5 w-3.5" />{item.transactionCode}
                </button>
                <div className="text-xs text-slate-500">{item.provider} · {item.orderCode ?? '—'}</div>
              </td>
              <td className="px-4 py-3">{item.bookingCodes ?? '—'}<div>{item.customers ?? '—'}</div></td>
              <td className="px-4 py-3">{formatMoney(item.amount)}</td>
              <td className="px-4 py-3"><Status value={item.status} /></td>
              <td className="px-4 py-3">
                {item.consistent
                  ? <span className="text-green-700">Khớp booking</span>
                  : <span className="font-semibold text-red-700">Không nhất quán · booking: {bookingStatuses.join(', ') || 'không có'}</span>}
                {item.status === 'Failed' && (
                  <button onClick={() => onCloseFailed(item)} className={`mt-2 ${actionButtonStyles.neutral}`}>
                    Đóng giao dịch
                  </button>
                )}
              </td>
              <td className="px-4 py-3">{formatDate(item.paymentTime ?? item.createdAt)}</td>
            </tr>
          );
        })}</tbody>
      </AdminListLayout>
    </section>
  );
}
