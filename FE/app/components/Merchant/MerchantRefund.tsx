import React from 'react';

type Props = {
  refunds: any[];
  loading: boolean;
  error: string | null;
  onApprove: (item: any) => void;
  onReject: (item: any) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);

export default function MerchantRefund({ refunds, loading, error, onApprove, onReject }: Props) {
  const [tab, setTab] = React.useState<'pending' | 'processed'>('pending');

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

  const renderRefundTable = (items: any[]) => (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Mã Đặt Vé</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Khách Hàng</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Tuyến</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Số Tiền</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Lý Do</th>
            <th className="text-left p-4 font-semibold text-sm whitespace-nowrap">Hành Động</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-4 text-center text-sm text-muted-foreground">
                Không có yêu cầu hoàn tiền.
              </td>
            </tr>
          ) : (
            items.map((refund) => (
              <tr key={refund.id} className="border-b border-border">
                <td className="p-4">{refund.bookingCode}</td>
                <td className="p-4">{refund.customer}</td>
                <td className="p-4">{refund.route || '-'}</td>
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
    </>
  );
}
