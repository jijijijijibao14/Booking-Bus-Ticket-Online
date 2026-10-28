import { useState } from 'react';
import { Search } from 'lucide-react';
import { actionButtonStyles, AdminListLayout, PageControls, Status, formatDate, formatMoney, statusLabel, type AdminListProps } from './AdminSectionShared';
export default function WalletSection({
  rows: payoutRows,
  total: payoutTotal,
  partnerRows,
  partnerTotal,
  financialRows,
  financialTotal,
  systemWalletBalance,
  commissionWalletBalance,
  commissionRate,
  onCommissionRateChange,
  onSaveCommissionRate,
  savingCommissionRate,
  onPayout,
  ...list
}: AdminListProps & {
  partnerRows: any[];
  partnerTotal: number;
  financialRows: any[];
  financialTotal: number;
  systemWalletBalance?: number;
  commissionWalletBalance?: number;
  commissionRate: string;
  onCommissionRateChange: (value: string) => void;
  onSaveCommissionRate: () => void;
  savingCommissionRate: boolean;
  onPayout: (partner: any) => void;
}) {
  const [section, setSection] = useState<'partners' | 'payouts' | 'finance'>('partners');
  const changeSection = (nextSection: 'partners' | 'payouts' | 'finance') => {
    setSection(nextSection);
    list.onPageChange(1);
  };

  return (
    <section className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold">Cấu hình hoa hồng</h3>
        <p className="mt-1 text-sm text-slate-500">
          Áp dụng cho chuyến hoàn thành từ thời điểm thay đổi. Hoa hồng = doanh thu vé đã thanh toán × tỷ lệ; đối tác nhận phần còn lại.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">
            Tỷ lệ hoa hồng (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commissionRate}
              onChange={(event) => onCommissionRateChange(event.target.value)}
              className="mt-1 block w-40 rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={onSaveCommissionRate}
            disabled={savingCommissionRate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingCommissionRate ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Ví hệ thống Admin</p>
          <p className="mt-2 text-2xl font-bold">{systemWalletBalance == null ? '—' : formatMoney(systemWalletBalance)}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-500">Ví hoa hồng</p>
          <p className="mt-2 text-2xl font-bold">{commissionWalletBalance == null ? '—' : formatMoney(commissionWalletBalance)}</p>
        </div>
      </section>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => changeSection('partners')} aria-pressed={section === 'partners'} className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'partners' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Thực hiện chi trả
        </button>
        <button onClick={() => changeSection('payouts')} aria-pressed={section === 'payouts'} className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'payouts' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Lịch sử chi trả
        </button>
        <button onClick={() => changeSection('finance')} aria-pressed={section === 'finance'} className={`border-b-2 px-4 py-2 text-sm font-medium ${section === 'finance' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Hoạt động tài chính
        </button>
      </div>

      {section === 'partners' ? <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <label className="min-w-56 flex-1 text-xs font-medium text-slate-600">
            Tìm kiếm đối tác
            <div className="mt-1 flex items-center rounded-lg border px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={list.search}
                onChange={(event) => list.onSearchChange(event.target.value)}
                placeholder="Tên, mã, email, số điện thoại..."
                className="w-full border-0 px-2 py-2 text-sm outline-none"
              />
            </div>
          </label>
        </div>
        {list.loading ? <div className="rounded-xl border bg-white p-10 text-center text-slate-500">Đang tải dữ liệu...</div>
          : partnerRows.length === 0 ? <div className="rounded-xl border bg-white p-10 text-center text-slate-500">Không có đối tác phù hợp.</div>
            : <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr>{['Đối tác', 'Liên hệ', 'Tài khoản nhận', 'Có thể chi trả', 'Thao tác'].map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
                </thead>
                <tbody>{partnerRows.map((partner) => (
                  <tr key={partner.id} className="border-t align-top hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{partner.brandName ?? partner.name}<div className="text-xs text-slate-500">{partner.id}</div></td>
                    <td className="px-4 py-3">{partner.email}<div>{partner.phone ?? '—'}</div></td>
                    <td className="px-4 py-3">
                      {partner.bankName ? <>{partner.bankName}<div>{partner.bankAccountName}</div><div className="text-xs text-slate-500">{partner.bankAccountNumber}{partner.bankBranchName ? ` · ${partner.bankBranchName}` : ''}</div></> : 'Chưa khai báo tài khoản'}
                    </td>
                    <td className="px-4 py-3">{formatMoney(partner.withdrawableBalance)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={Number(partner.withdrawableBalance) <= 0}
                        onClick={() => onPayout(partner)}
                        className={actionButtonStyles.primary}
                      >
                        Chi trả
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
        {partnerTotal > 20 && <PageControls page={list.page} total={partnerTotal} onChange={list.onPageChange} />}
      </section> : section === 'payouts' ? <section className="space-y-3">
        <AdminListLayout
          {...list}
          tab="wallet"
          rows={payoutRows}
          total={payoutTotal}
          columns={['Mã chi trả', 'Đối tác', 'Số tiền', 'Trạng thái', 'Mã tham chiếu', 'Thời gian']}
        >
          <tbody>{payoutRows.map((item) => (
            <tr key={item.id ?? item.transactionCode} className="border-t align-top hover:bg-slate-50">
              <td className="px-4 py-3">{item.id}</td>
              <td className="px-4 py-3">{item.partner}<div className="text-xs text-slate-500">{item.partnerId}</div></td>
              <td className="px-4 py-3 text-red-700">−{formatMoney(item.amount)}</td>
              <td className="px-4 py-3"><Status value={item.status} /></td>
              <td className="px-4 py-3">{item.referenceCode}</td>
              <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
            </tr>
          ))}</tbody>
        </AdminListLayout>
      </section> : <section className="space-y-3">
        <AdminListLayout
          {...list}
          tab="finance"
          rows={financialRows}
          total={financialTotal}
          showSearch={false}
          columns={['Loại', 'Tham chiếu', 'Người liên quan', 'Số tiền / chiều', 'Thời gian']}
        >
          <tbody>{financialRows.map((item) => (
            <tr key={item.id ?? item.transactionCode} className="border-t align-top hover:bg-slate-50">
              <td className="px-4 py-3">{statusLabel(item.type)}</td>
              <td className="px-4 py-3">{item.reference ?? '—'}</td>
              <td className="px-4 py-3">{item.actor}<div className="text-xs text-slate-500">{item.description}</div></td>
              <td className={`px-4 py-3 font-semibold ${item.direction === 'in' ? 'text-green-700' : 'text-red-700'}`}>
                {item.direction === 'in' ? '+' : '−'}{formatMoney(Math.abs(item.amount))}<div className="text-xs">{item.direction === 'in' ? 'Tiền vào' : 'Tiền ra'}</div>
              </td>
              <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
            </tr>
          ))}</tbody>
        </AdminListLayout>
      </section>}
    </section>
  );
}
