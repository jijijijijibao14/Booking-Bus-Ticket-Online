import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  AdminListLayout,
  actionButtonStyles,
  Status,
  formatDate,
  formatMoney,
  type AdminDetail,
  type AdminListProps,
} from './AdminSectionShared';

type RefundItem = {
  id: number | string;
  bookingCode: string;
  customer: string;
  email: string;
  route?: string;
  departureTime?: string;
  refundAmount?: number;
  totalAmount?: number;
  reason?: string;
  status: string;
};

function RefundTable({
  rows,
  onViewDetails,
  onProcess,
  showActions,
}: {
  rows: RefundItem[];
  onViewDetails: (detail: AdminDetail) => void;
  onProcess: (item: RefundItem, action: 'approve-refund' | 'reject-refund') => void;
  showActions: boolean;
}) {
  return (
    <tbody>{rows.map((item) => (
      <tr key={item.id} className="border-t align-top hover:bg-slate-50">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => onViewDetails({ title: `Yêu cầu hoàn tiền ${item.bookingCode}`, item })}
              className={actionButtonStyles.view}
              title="Xem chi tiết"
              aria-label={`Xem chi tiết yêu cầu hoàn tiền ${item.bookingCode}`}
            >
              <Eye className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="font-semibold leading-8 text-slate-800">{item.bookingCode}</div>
              <div className="text-xs leading-5 text-slate-700">{item.customer}</div>
              <div className="text-xs leading-5 text-slate-500">{item.email}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">{item.route ?? '—'}<div className="text-xs text-slate-500">{formatDate(item.departureTime)}</div></td>
        <td className="px-4 py-3">{formatMoney(item.refundAmount)}<div className="text-xs text-slate-500">Tổng booking: {formatMoney(item.totalAmount)}</div></td>
        <td className="max-w-xs px-4 py-3">{item.reason ?? '—'}</td>
        <td className="px-4 py-3"><Status value={item.status} /></td>
        <td className="px-4 py-3">
          {showActions && <div className="flex flex-wrap gap-2">
            <button onClick={() => onProcess(item, 'approve-refund')} className={actionButtonStyles.success}>Duyệt hoàn</button>
            <button onClick={() => onProcess(item, 'reject-refund')} className={actionButtonStyles.danger}>Từ chối</button>
          </div>}
        </td>
      </tr>
    ))}</tbody>
  );
}

export default function RefundSection({
  rows,
  total,
  historyRows,
  historyTotal,
  onViewDetails,
  onProcess,
  ...list
}: AdminListProps & {
  historyRows: RefundItem[];
  historyTotal: number;
  onViewDetails: (detail: AdminDetail) => void;
  onProcess: (item: RefundItem, action: 'approve-refund' | 'reject-refund') => void;
}) {
  const [section, setSection] = useState<'pending' | 'history'>('pending');
  const changeSection = (nextSection: 'pending' | 'history') => {
    setSection(nextSection);
    list.onPageChange(1);
  };
  const columns = ['Booking / khách hàng', 'Tuyến / khởi hành', 'Số tiền hoàn', 'Lý do', 'Trạng thái', 'Thao tác'];

  return (
    <section className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => changeSection('pending')} aria-pressed={section === 'pending'} className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'pending' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Hoàn tiền chờ xử lý
        </button>
        <button onClick={() => changeSection('history')} aria-pressed={section === 'history'} className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'history' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Lịch sử hoàn tiền
        </button>
      </div>
      {section === 'pending' ? (
        <AdminListLayout {...list} tab="refunds" columns={columns} rows={rows} total={total}>
          <RefundTable rows={rows} onViewDetails={onViewDetails} onProcess={onProcess} showActions />
        </AdminListLayout>
      ) : (
        <AdminListLayout {...list} tab="refunds" columns={columns} rows={historyRows} total={historyTotal} showFilters={false}>
          <RefundTable rows={historyRows} onViewDetails={onViewDetails} onProcess={onProcess} showActions={false} />
        </AdminListLayout>
      )}
    </section>
  );
}
