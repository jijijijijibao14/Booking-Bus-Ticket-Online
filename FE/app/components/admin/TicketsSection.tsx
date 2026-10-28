import { Eye } from 'lucide-react';
import { actionButtonStyles, AdminListLayout, Status, formatMoney, type AdminDetail, type AdminListProps } from './AdminSectionShared';

export default function TicketsSection({
  onViewDetails,
  ...list
}: AdminListProps & { onViewDetails: (detail: AdminDetail) => void }) {
  return (
    <AdminListLayout tab="tickets" columns={['Vé / hành khách', 'Booking', 'Tuyến / ghế', 'Giá', 'Trạng thái', 'Thao tác']} {...list}>
      <tbody>{list.rows.map((item) => (
        <tr key={item.id} className="border-t align-top hover:bg-slate-50">
          <td className="px-4 py-3">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => onViewDetails({ title: `Vé ${item.id}`, item })} className={actionButtonStyles.view} title="Xem chi tiết" aria-label={`Xem chi tiết vé ${item.id}`}><Eye className="h-4 w-4" /></button>
              <div className="min-w-0">
                <div className="font-semibold leading-8 text-slate-800">{item.id}</div>
                <div className="text-xs leading-5 text-slate-500">{item.passenger}</div>
              </div>
            </div>
          </td>
          <td className="px-4 py-3">{item.bookingCode}<div className="text-xs text-slate-500">{item.customer}</div></td>
          <td className="px-4 py-3">{item.route ?? '—'}<div>Ghế: {item.seat ?? '—'}</div></td>
          <td className="px-4 py-3">{formatMoney(item.price)}</td>
          <td className="px-4 py-3"><Status value={item.status} /></td>
        </tr>
      ))}</tbody>
    </AdminListLayout>
  );
}
