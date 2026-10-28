import { useState, type ReactNode } from 'react';
import { CalendarDays, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Calendar } from '../ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export type AdminTab =
  | 'overview'
  | 'customers'
  | 'partners'
  | 'refunds'
  | 'tickets'
  | 'payments'
  | 'wallet'
  | 'finance';

export type AdminDetail = { title: string; item: any };

export type AdminListProps = {
  rows: any[];
  loading: boolean;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  fromDate: string;
  onFromDateChange: (value: string) => void;
  toDate: string;
  onToDateChange: (value: string) => void;
  direction: string;
  onDirectionChange: (value: string) => void;
};

const PAGE_SIZE = 20;

export const actionButtonStyles = {
  neutral: 'inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
  primary: 'inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
  success: 'inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
  danger: 'inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-200 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1',
  view: 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
};

export function formatMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString('vi-VN')}₫` : '—';
}

export function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    Active: 'Đang hoạt động',
    Suspended: 'Đã khóa',
    Deleted: 'Đã lưu trữ',
    'Pending Approval': 'Chờ duyệt',
    Rejected: 'Đã từ chối',
    Pending: 'Chờ xử lý',
    WaitRefund: 'Chờ Admin hoàn tiền',
    Paid: 'Đã thanh toán',
    Failed: 'Thất bại',
    Cancelled: 'Đã đóng / hủy',
    Refunded: 'Đã hoàn tiền',
    Approved: 'Đã duyệt',
    COMMISSION: 'Hoa hồng',
    ADJUSTMENT: 'Giao dịch khác',
    PAYMENT: 'Thanh toán',
    REFUND: 'Hoàn tiền',
    PARTNER_PAYOUT: 'Chi trả đối tác',
  };
  return labels[status] ?? status ?? '—';
}

export function Status({ value }: { value: string }) {
  const className = ['Active', 'Paid', 'Approved'].includes(value)
    ? 'bg-green-100 text-green-800'
    : ['Pending', 'Pending Approval', 'WaitRefund'].includes(value)
      ? 'bg-amber-100 text-amber-800'
      : ['Suspended', 'Deleted', 'Rejected', 'Failed', 'Cancelled', 'Refunded'].includes(value)
        ? 'bg-red-100 text-red-800'
        : 'bg-slate-100 text-slate-700';

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{statusLabel(value)}</span>;
}

export function PageControls({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">{total.toLocaleString('vi-VN')} kết quả · Trang {page}/{pages}</span>
      <div className="flex gap-2">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Trước</button>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Sau</button>
      </div>
    </div>
  );
}

const statusOptions: Partial<Record<AdminTab, string[]>> = {
  tickets: ['Refunded', 'Paid', 'Pending'],
  payments: ['Pending', 'Paid', 'Failed', 'Cancelled'],
  customers: ['Active', 'Suspended', 'Deleted', 'Pending Approval', 'Rejected'],
  partners: ['Active', 'Suspended', 'Deleted', 'Pending Approval', 'Rejected'],
  finance: ['PAYMENT', 'REFUND', 'COMMISSION', 'PARTNER_PAYOUT'],
};

function parseDate(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date | undefined) {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : '';
}

function DateFilter({
  label,
  value,
  onChange,
  minDate,
  maxDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);

  return (
    <div className="min-w-[155px]">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-200 bg-white shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm text-slate-700 outline-none"
              aria-label={`Chọn ${label.toLowerCase()}`}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
              <span className={selectedDate ? 'truncate' : 'truncate text-slate-400'}>
                {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày'}
              </span>
            </button>
          </PopoverTrigger>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Xóa ${label.toLowerCase()}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <PopoverContent align="start" className="w-auto rounded-xl border-slate-200 bg-white p-2 shadow-xl">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              onChange(toDateValue(date));
              setOpen(false);
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            locale={vi}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AdminListLayout({
  tab,
  rows,
  loading,
  total,
  page,
  onPageChange,
  search,
  onSearchChange,
  status,
  onStatusChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  direction,
  onDirectionChange,
  columns,
  children,
  showFilters = true,
  showSearch = true,
}: AdminListProps & {
  tab: AdminTab;
  columns: string[];
  children: ReactNode;
  showFilters?: boolean;
  showSearch?: boolean;
}) {
  return (
    <section className="space-y-4">
      {showFilters && <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm sm:p-5">
        {showSearch && <label className="min-w-56 flex-1 text-xs font-medium text-slate-600">
          Tìm kiếm
          <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tên, mã, email, số điện thoại..."
              className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            />
          </div>
        </label>}
        {statusOptions[tab] && (
          <div className="min-w-[150px]">
            <span className="text-xs font-medium text-slate-600">Trạng thái</span>
            <Select value={status || 'all'} onValueChange={(value) => onStatusChange(value === 'all' ? '' : value)}>
              <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-blue-100">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 bg-white shadow-xl">
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {statusOptions[tab].map((value) => <SelectItem key={value} value={value}>{statusLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {['payments', 'finance'].includes(tab) && <>
          <DateFilter
            label="Từ ngày"
            value={fromDate}
            onChange={onFromDateChange}
            maxDate={parseDate(toDate)}
          />
          <DateFilter
            label="Đến ngày"
            value={toDate}
            onChange={onToDateChange}
            minDate={parseDate(fromDate)}
          />
        </>}
        {tab === 'finance' && <div className="min-w-[145px]">
          <span className="text-xs font-medium text-slate-600">Dòng tiền</span>
          <Select value={direction || 'all'} onValueChange={(value) => onDirectionChange(value === 'all' ? '' : value)}>
            <SelectTrigger className="mt-1 h-10 rounded-lg border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-blue-100">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 bg-white shadow-xl">
              <SelectItem value="all">Tất cả dòng tiền</SelectItem>
              <SelectItem value="in">Tiền vào</SelectItem>
              <SelectItem value="out">Tiền ra</SelectItem>
            </SelectContent>
          </Select>
        </div>}
      </div>}

      {loading ? <div className="rounded-xl border bg-white p-10 text-center text-slate-500">Đang tải dữ liệu...</div>
        : rows.length === 0 ? <div className="rounded-xl border bg-white p-10 text-center text-slate-500">Không có dữ liệu phù hợp.</div>
          : <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
              </thead>
              {children}
            </table>
          </div>}
      {total > PAGE_SIZE && <PageControls page={page} total={total} onChange={onPageChange} />}
    </section>
  );
}
