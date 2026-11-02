import React from 'react';
import { Eye, X } from 'lucide-react';

type Props = {
  refunds: any[];
  loading: boolean;
  error: string | null;
  onApprove: (item: any) => void;
  onReject: (item: any) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('vi-VN');
};

export default function MerchantRefund({ refunds, loading, error, onApprove, onReject }: Props) {
  const [tab, setTab] = React.useState<'pending' | 'processed'>('pending');
  const [selectedRefund, setSelectedRefund] = React.useState<any | null>(null);

  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  const pendingRefunds = refunds.filter(
    (refund) => refund.status === 'Pending'
  );
  const processedRefunds = refunds.filter(
    (refund) => ['Approved', 'Rejected', 'WaitRefund'].includes(refund.status)
  );

  const refundStatusLabel = (status: string) => {
    if (status === 'Pending') return 'Chờ duyệt';
    if (status === 'WaitRefund') return 'Chờ admin hoàn tiền';
    if (status === 'Approved') return 'Đã duyệt';
    if (status === 'Rejected') return 'Đã từ chối';
    return status || '-';
  };

  const renderRefundStatus = (status: string) => (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
      status === 'Pending' ? 'bg-amber-100 text-amber-800'
        : status === 'Approved' ? 'bg-green-100 text-green-800'
          : status === 'Rejected' ? 'bg-red-100 text-red-800'
            : 'bg-blue-100 text-blue-800'
    }`}>
      {refundStatusLabel(status)}
    </span>
  );

  const renderRefundTable = (items: any[]) => (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full">
        <thead>
          <tr>
            <th className="p-4" aria-label="Xem chi tiết" />
            <th className="whitespace-nowrap p-4 text-left text-sm font-semibold">Mã Đặt Vé</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Khách Hàng</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Tuyến</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Ngày khởi hành</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Ngày gửi yêu cầu</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Số Tiền</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Lý Do</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Hành Động</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={9} className="p-4 text-center text-sm text-muted-foreground">
                Không có yêu cầu hoàn tiền.
              </td>
            </tr>
          ) : (
            items.map((refund) => (
              <tr key={refund.id} className="border-b border-border">
                <td className="p-4">
                  <button
                    type="button"
                    onClick={() => setSelectedRefund(refund)}
                    title="Xem chi tiết yêu cầu hoàn tiền"
                    aria-label={`Xem chi tiết yêu cầu hoàn tiền ${refund.bookingCode || refund.id}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
                <td className="whitespace-nowrap p-4 font-medium">{refund.bookingCode || '-'}</td>
                <td className="p-4">{refund.customer || '-'}</td>
                <td className="p-4">{refund.route || '-'}</td>
                <td className="whitespace-nowrap p-4">{formatDateTime(refund.departureTime)}</td>
                <td className="whitespace-nowrap p-4">{formatDateTime(refund.createdAt)}</td>
                <td className="p-4">{formatCurrency(refund.totalAmount)}</td>
                <td className="p-4">{refund.reason || '-'}</td>
                <td className="p-4">
                  {refund.status === 'Pending' ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <button
                        onClick={() => onApprove(refund)}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md"
                      >
                        Duyệt
                      </button>
                      <button
                        onClick={() => onReject(refund)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md"
                      >
                        Từ chối
                      </button>
                    </div>
                  ) : refund.status === 'WaitRefund' ? (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
                      Đang chờ hoàn tiền
                    </span>
                  ) : refund.status === 'Approved' ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                      Đã duyệt
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
                      Đã từ chối
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Quản Lý Hoàn Tiền</h2>
          <p className="text-muted-foreground">Thông tin về các yêu cầu hoàn tiền</p>
        </div>
      </div>

      {renderContent(
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 border-b border-border pb-2 mb-4">
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-2 rounded-lg font-semibold ${tab === 'pending' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              Chờ Duyệt
            </button>
            <button
              onClick={() => setTab('processed')}
              className={`px-4 py-2 rounded-lg font-semibold ${tab === 'processed' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              Đã Xử Lý / Chờ Hoàn Tiền
            </button>
          </div>

          <div>{tab === 'pending' ? renderRefundTable(pendingRefunds) : renderRefundTable(processedRefunds)}</div>
        </div>
      )}
      {selectedRefund && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedRefund(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="merchant-refund-detail-title"
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-5 flex items-center justify-between gap-4">
              <h3 id="merchant-refund-detail-title" className="text-lg font-bold text-slate-900 sm:text-xl">
                Yêu cầu hoàn tiền {selectedRefund.bookingCode ? ` ${selectedRefund.bookingCode}` : ''} · Chi tiết
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRefund(null)}
                aria-label="Đóng chi tiết"
                className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              {[
                ['Mã yêu cầu', selectedRefund.id],
                ['Mã đặt vé', selectedRefund.bookingCode],
                ['Khách hàng', selectedRefund.customer],
                ['Tuyến', selectedRefund.route],
                ['Thời gian khởi hành', formatDateTime(selectedRefund.departureTime)],
                ['Ngày gửi yêu cầu', formatDateTime(selectedRefund.createdAt)],
                ['Số tiền hoàn', formatCurrency(selectedRefund.refundAmount)],
                ['Tổng tiền vé', formatCurrency(selectedRefund.totalAmount)],
                ['Tỷ lệ hoàn', selectedRefund.refundPercent != null ? `${selectedRefund.refundPercent}%` : null],
                ['Trạng thái', selectedRefund.status],
                ['Lý do', selectedRefund.reason],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0 border-b border-slate-200 py-3">
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {label === 'Trạng thái'
                      ? renderRefundStatus(String(value || ''))
                      : value == null || value === ''
                        ? '-'
                        : value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
