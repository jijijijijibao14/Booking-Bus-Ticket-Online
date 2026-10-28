import { Eye } from 'lucide-react';
import { actionButtonStyles, AdminListLayout, Status, formatDate, formatMoney, type AdminDetail, type AdminListProps } from './AdminSectionShared';

export default function PaymentsSection({
  onViewDetails,
  onCloseFailed,
  ...list
}: AdminListProps & {
  onViewDetails: (detail: AdminDetail) => void;
  onCloseFailed: (payment: any) => void;
}) {
  return (
    <AdminListLayout tab="payments" columns={['Giao dịch', 'Booking / khách hàng', 'Số tiền', 'Trạng thái', 'Đối soát', 'Thời gian']} {...list}>
      <tbody>{list.rows.map((item) => {
        const bookingStatuses = Array.isArray(item.bookingStatuses)
          ? item.bookingStatuses
          : typeof item.bookingStatuses === 'string'
            ? item.bookingStatuses.split(',').filter(Boolean)
            : [];

        return (
          <tr key={item.id ?? item.transactionCode} className="border-t align-top hover:bg-slate-50">
            <td className="px-4 py-3"><button onClick={() => onViewDetails({ title: `Giao dịch ${item.transactionCode}`, item })} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Eye className="h-3.5 w-3.5" />{item.transactionCode}</button><div className="text-xs text-slate-500">{item.orderCode ?? item.providerReference ?? '—'}</div></td>
            <td className="px-4 py-3">{item.bookingCodes ?? '—'}<div>{item.customers ?? '—'}</div></td>
            <td className="px-4 py-3">{formatMoney(item.amount)}</td>
            <td className="px-4 py-3"><Status value={item.status} /></td>
            <td className="px-4 py-3">
              {item.consistent ? <span className="text-green-700">Khớp booking</span> : <span className="font-semibold text-red-700">Không nhất quán · booking: {bookingStatuses.join(', ') || 'không có'}</span>}
              {item.status === 'Failed' && <button onClick={() => onCloseFailed(item)} className={`mt-2 ${actionButtonStyles.neutral}`}>Đóng giao dịch</button>}
            </td>
            <td className="px-4 py-3">{formatDate(item.paymentTime ?? item.createdAt)}</td>
          </tr>
        );
      })}</tbody>
    </AdminListLayout>
  );
}
