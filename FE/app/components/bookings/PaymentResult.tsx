import { useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Copy,
  Home,
  RefreshCw,
  TicketCheck,
  XCircle,
} from 'lucide-react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

type PaymentStatus =
  | 'success'
  | 'failed'
  | 'processing';

export default function PaymentResult() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [copied, setCopied] = useState(false);

  const rawStatus =
    searchParams.get('status') ?? 'processing';

  const txnRef =
    searchParams.get('txnRef') ?? '';

  const responseCode =
    searchParams.get('responseCode') ?? '';

  const rspCode =
    searchParams.get('rspCode') ?? '';

  /*
   * Backend trả:
   * rspCode = 00: vừa xác nhận thành công
   * rspCode = 02: giao dịch đã được xác nhận trước đó
   */
  const backendConfirmed =
    rspCode === '00' || rspCode === '02';

  const status: PaymentStatus =
    rawStatus === 'success' ||
    (
      responseCode === '00' &&
      backendConfirmed
    )
      ? 'success'
      : rawStatus === 'failed'
        ? 'failed'
        : 'processing';

  const copyTransactionCode = async () => {
    if (!txnRef) {
      return;
    }

    try {
      await navigator.clipboard.writeText(txnRef);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        'Không thể sao chép mã giao dịch:',
        error,
      );
    }
  };

  const renderStatusIcon = () => {
    if (status === 'success') {
      return (
        <CheckCircle2 className="w-20 h-20 text-emerald-500" />
      );
    }

    if (status === 'failed') {
      return (
        <XCircle className="w-20 h-20 text-red-500" />
      );
    }

    return (
      <Clock3 className="w-20 h-20 text-amber-500 animate-pulse" />
    );
  };

  const statusTitle =
    status === 'success'
      ? 'Thanh toán thành công'
      : status === 'failed'
        ? 'Thanh toán không thành công'
        : 'Đang kiểm tra thanh toán';

  const statusDescription =
    status === 'success'
      ? 'VNPay đã xác nhận giao dịch. Trạng thái đặt vé của bạn đã được cập nhật thành Paid.'
      : status === 'failed'
        ? 'Giao dịch chưa được hoàn tất. Bạn có thể quay lại trang chủ và thực hiện lại thanh toán.'
        : 'Hệ thống đang chờ xác nhận trạng thái cuối cùng của giao dịch.';

  const statusBackground =
    status === 'success'
      ? 'bg-emerald-50 border-emerald-200'
      : status === 'failed'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div
            className={`border-b px-6 py-10 flex flex-col items-center text-center ${statusBackground}`}
          >
            <div className="mb-5">
              {renderStatusIcon()}
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              {statusTitle}
            </h1>

            <p className="mt-3 max-w-lg text-slate-600 leading-relaxed">
              {statusDescription}
            </p>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <TicketCheck className="w-6 h-6 text-blue-700" />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">
                  Thông tin giao dịch
                </h2>

                <p className="text-sm text-slate-500">
                  Kết quả trả về từ cổng thanh toán VNPay
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-200">
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="text-sm text-slate-500">
                  Trạng thái
                </span>

                <span
                  className={`font-semibold ${
                    status === 'success'
                      ? 'text-emerald-600'
                      : status === 'failed'
                        ? 'text-red-600'
                        : 'text-amber-600'
                  }`}
                >
                  {status === 'success'
                    ? 'Đã thanh toán'
                    : status === 'failed'
                      ? 'Thanh toán thất bại'
                      : 'Đang xử lý'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="text-sm text-slate-500">
                  Mã giao dịch
                </span>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-slate-800 break-all text-right">
                    {txnRef || 'Không có'}
                  </span>

                  {txnRef && (
                    <button
                      type="button"
                      onClick={copyTransactionCode}
                      className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Sao chép mã giao dịch"
                    >
                      <Copy className="w-4 h-4 text-slate-500" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="text-sm text-slate-500">
                  Mã phản hồi VNPay
                </span>

                <span className="font-mono font-medium text-slate-800">
                  {responseCode || 'Không có'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="text-sm text-slate-500">
                  Mã xử lý hệ thống
                </span>

                <span className="font-mono font-medium text-slate-800">
                  {rspCode || 'Không có'}
                </span>
              </div>
            </div>

            {copied && (
              <p className="mt-3 text-sm text-emerald-600 text-center">
                Đã sao chép mã giao dịch.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-blue-700 text-blue-700 font-semibold hover:bg-blue-50 transition-colors"
              >
                <Home className="w-5 h-5" />
                Về trang chủ
              </button>

              {status === 'processing' ? (
       <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors"
  >
       <RefreshCw className="w-5 h-5" />
        Kiểm tra lại
     </button>
) : status === 'success' ? (
  <button
    type="button"
    onClick={() =>
      navigate('/profile?tab=history')
    }
    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors"
  >
    <TicketCheck className="w-5 h-5" />
    Xem vé của tôi
  </button>
) : (
  <button
    type="button"
    onClick={() => navigate('/')}
    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors"
  >
    <RefreshCw className="w-5 h-5" />
    Đặt vé và thanh toán lại
  </button>
)}
            </div>

            <p className="mt-6 text-xs text-center text-slate-400">
              Vui lòng lưu lại mã giao dịch để đối chiếu khi cần hỗ trợ.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}