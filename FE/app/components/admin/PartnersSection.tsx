import { useState } from 'react';
import { Eye, Search } from 'lucide-react';
import { actionButtonStyles, PageControls, Status, formatDate, formatMoney, statusLabel, type AdminDetail, type AdminListProps } from './AdminSectionShared';

const statusOptions = ['Active', 'Suspended', 'Deleted', 'Pending Approval', 'Rejected'];

export default function PartnersSection({
  rows: partners,
  total: partnerTotal,
  approvalRows,
  approvalTotal,
  loading,
  page,
  onPageChange,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onViewDetails,
  onUpdateStatus,
  onApproval,
}: AdminListProps & {
  approvalRows: any[];
  approvalTotal: number;
  onViewDetails: (detail: AdminDetail) => void;
  onUpdateStatus: (partner: any, action: 'activate' | 'suspend' | 'delete') => void;
  onApproval: (partner: any, action: 'approve' | 'reject') => void;
}) {
  const [section, setSection] = useState<'partners' | 'approvals'>('partners');

  return (
    <section className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => { setSection('partners'); onPageChange(1); }}
          aria-pressed={section === 'partners'}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'partners' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Danh sách đối tác
        </button>
        <button
          onClick={() => { setSection('approvals'); onPageChange(1); }}
          aria-pressed={section === 'approvals'}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${section === 'approvals' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Phê duyệt đối tác
          {approvalTotal > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{approvalTotal}</span>}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="min-w-56 flex-1 text-xs font-medium text-slate-600">
          Tìm kiếm đối tác
          <div className="mt-1 flex items-center rounded-lg border px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tên, mã, email, số điện thoại..."
              className="w-full border-0 px-2 py-2 text-sm outline-none"
            />
          </div>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Trạng thái
          <select value={status} onChange={(event) => onStatusChange(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {statusOptions.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
          </select>
        </label>
      </div>

      {section === 'partners' ? (
        <section className="space-y-3">
          {loading ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Đang tải dữ liệu...</div>
            : partners.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Không có đối tác phù hợp.</div>
              : <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>{['Tài khoản', 'Liên hệ', 'Số dư', 'Trạng thái', 'Thao tác'].map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
                  </thead>
                  <tbody>{partners.map((item) => (
                    <tr key={item.id} className="border-t align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <button type="button" onClick={() => onViewDetails({ title: item.brandName ?? item.name, item })} className={actionButtonStyles.view} title="Xem chi tiết" aria-label={`Xem chi tiết đối tác ${item.brandName ?? item.name}`}><Eye className="h-4 w-4" /></button>
                          <div className="min-w-0">
                            <div className="font-semibold leading-8 text-slate-800">{item.brandName ?? item.name}</div>
                            <div className="text-xs leading-5 text-slate-500">{item.id} · {item.username}</div>
                            {item.licenseNumber && <div className="text-xs leading-5 text-slate-500">Giấy phép: {item.licenseNumber}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.email}<div>{item.phone ?? '—'}</div></td>
                      <td className="px-4 py-3">{formatMoney(item.withdrawableBalance)}</td>
                      <td className="px-4 py-3"><Status value={item.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {['Active', 'Suspended'].includes(item.status) && <button onClick={() => onUpdateStatus(item, item.status === 'Suspended' ? 'activate' : 'suspend')} className={actionButtonStyles.neutral}>{item.status === 'Suspended' ? 'Mở khóa' : 'Khóa'}</button>}
                          {item.status !== 'Deleted' && <button onClick={() => onUpdateStatus(item, 'delete')} className={actionButtonStyles.danger}>Xóa</button>}
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
          {partnerTotal > 20 && <PageControls page={page} total={partnerTotal} onChange={onPageChange} />}
        </section>
      ) : (
        <section className="space-y-3">
          {loading ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Đang tải dữ liệu...</div>
            : approvalRows.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Không có đối tác cần phê duyệt.</div>
              : <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>{['Đối tác', 'Liên hệ', 'Ngày đăng ký', 'Trạng thái', 'Thao tác'].map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
                  </thead>
                  <tbody>{approvalRows.map((item) => (
                    <tr key={item.id} className="border-t align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <button type="button" onClick={() => onViewDetails({ title: item.companyName, item })} className={actionButtonStyles.view} title="Xem chi tiết" aria-label={`Xem chi tiết đối tác ${item.companyName}`}><Eye className="h-4 w-4" /></button>
                          <div className="min-w-0">
                            <div className="font-semibold leading-8 text-slate-800">{item.companyName}</div>
                            <div className="text-xs leading-5 text-slate-500">{item.id} · {item.contactPerson}</div>
                            {item.licenseNumber && <div className="text-xs leading-5 text-slate-500">Giấy phép: {item.licenseNumber}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.email}<div>{item.phone}</div></td>
                      <td className="px-4 py-3">{formatDate(item.submittedDate)}</td>
                      <td className="px-4 py-3"><Status value={item.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => onApproval(item, 'approve')} className={actionButtonStyles.success}>Duyệt</button>
                          <button onClick={() => onApproval(item, 'reject')} className={actionButtonStyles.danger}>Từ chối</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
          {approvalTotal > 20 && <PageControls page={page} total={approvalTotal} onChange={onPageChange} />}
        </section>
      )}
    </section>
  );
}
