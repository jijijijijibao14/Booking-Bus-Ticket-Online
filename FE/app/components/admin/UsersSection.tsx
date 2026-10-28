import { Eye } from 'lucide-react';
import { actionButtonStyles, AdminListLayout, Status, formatMoney, type AdminDetail, type AdminListProps } from './AdminSectionShared';

export default function UsersSection({
  onViewDetails,
  onUpdateStatus,
  ...list
}: AdminListProps & {
  onViewDetails: (detail: AdminDetail) => void;
  onUpdateStatus: (user: any, action: 'activate' | 'suspend' | 'delete') => void;
}) {
  return (
    <AdminListLayout tab="customers" columns={['Tài khoản', 'Liên hệ', 'Số dư', 'Trạng thái', 'Thao tác']} {...list}>
      <tbody>{list.rows.map((item) => (
        <tr key={item.id} className="border-t align-top hover:bg-slate-50">
          <td className="px-4 py-3">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => onViewDetails({ title: item.name, item })} className={actionButtonStyles.view} title="Xem chi tiết" aria-label={`Xem chi tiết người dùng ${item.name}`}><Eye className="h-4 w-4" /></button>
              <div className="min-w-0">
                <div className="font-semibold leading-8 text-slate-800">{item.name}</div>
                <div className="text-xs leading-5 text-slate-500">{item.id} · {item.username}</div>
              </div>
            </div>
          </td>
          <td className="px-4 py-3">{item.email}<div>{item.phone ?? '—'}</div></td>
          <td className="px-4 py-3">{formatMoney(item.walletBalance)}</td>
          <td className="px-4 py-3"><Status value={item.status} /></td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {['Active', 'Suspended'].includes(item.status) && <button onClick={() => onUpdateStatus(item, item.status === 'Suspended' ? 'activate' : 'suspend')} className={actionButtonStyles.neutral}>{item.status === 'Suspended' ? 'Mở khóa' : 'Khóa'}</button>}
              {item.status !== 'Deleted' && <button onClick={() => onUpdateStatus(item, 'delete')} className={actionButtonStyles.danger}>Xóa</button>}
            </div>
          </td>
        </tr>
      ))}</tbody>
    </AdminListLayout>
  );
}
