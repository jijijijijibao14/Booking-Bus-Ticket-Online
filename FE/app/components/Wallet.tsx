import {
  useEffect,
  useState,
} from 'react';
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import {
  getWalletTransactions,
} from '@/api';

interface WalletTransaction {
  id: number;
  bookingId: number | null;
  relatedBookingId: number | null;
  type:
    | 'payment'
    | 'refund'
    | 'adjustment'
    | string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceCode: string | null;
  title: string;
  date: string;
}

export default function Wallet({
  walletBalance,
}: {
  walletBalance: number;
}) {
  const [
    transactions,
    setTransactions,
  ] = useState<WalletTransaction[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  useEffect(() => {
    const fetchTransactions =
      async () => {
        try {
          setLoading(true);
          setErrorMessage('');

          const response =
            await getWalletTransactions();

          const rows =
            Array.isArray(
              response.data?.data,
            )
              ? response.data.data
              : [];

          /*
           * Chuẩn hóa thêm ở frontend để tránh lỗi
           * nếu DECIMAL từ MySQL về dạng string.
           */
          const normalized =
            rows.map((tx: any) => ({
              id: Number(
                tx.id ??
                tx.wallet_transaction_id,
              ),
              bookingId:
                tx.bookingId ??
                tx.booking_id ??
                null,
              relatedBookingId:
                tx.relatedBookingId ??
                tx.related_booking_id ??
                null,
              type: String(
                tx.type ??
                tx.transaction_type ??
                '',
              ).toLowerCase(),
              amount: Number(
                tx.amount ?? 0,
              ),
              balanceBefore:
                Number(
                  tx.balanceBefore ??
                  tx.balance_before ??
                  0,
                ),
              balanceAfter:
                Number(
                  tx.balanceAfter ??
                  tx.balance_after ??
                  0,
                ),
              referenceCode:
                tx.referenceCode ??
                tx.reference_code ??
                null,
              title:
                tx.title ??
                tx.description ??
                'Giao dịch Ví ViệtGo',
              date:
                tx.date ??
                tx.created_at,
            }));

          setTransactions(
            normalized,
          );
        } catch (error: any) {
          console.error(
            'Failed to fetch wallet transactions',
            error,
          );

          setErrorMessage(
            error.response?.data?.message ||
            'Không thể tải lịch sử giao dịch.',
          );
        } finally {
          setLoading(false);
        }
      };

    void fetchTransactions();
  }, []);

  const safeWalletBalance =
    Number(walletBalance) || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="px-7 py-6 border-b border-border">
        <h2 className="text-2xl font-bold text-foreground">
          Ví VIỆTGO
        </h2>

        <p className="text-muted-foreground mt-1">
          Quản lý số dư và các giao dịch của bạn.
        </p>
      </div>

      <div className="p-7">
        <div className="rounded-2xl bg-primary text-primary-foreground p-7 shadow-lg mb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80">
                Số dư hiện tại
              </p>

              <p className="text-4xl font-bold mt-3">
                {safeWalletBalance.toLocaleString(
                  'vi-VN',
                )}
                ₫
              </p>
            </div>

            <WalletIcon className="w-7 h-7 opacity-80" />
          </div>

          <button
            type="button"
            className="mt-7 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/20 hover:bg-white/25 font-semibold"
          >
            <Plus className="w-5 h-5" />
            Nạp tiền
          </button>
        </div>

        <h3 className="font-semibold text-lg text-foreground mb-4">
          Lịch sử giao dịch
        </h3>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center items-center p-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Chưa có giao dịch nào.
            </p>
          ) : (
            transactions.map((tx) => {
              const isIncoming =
                tx.amount > 0;

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isIncoming
                          ? 'bg-green-100 text-green-600'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {isIncoming ? (
                        <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUp className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {tx.title}
                      </p>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span>
                          {new Date(
                            tx.date,
                          ).toLocaleString(
                            'vi-VN',
                          )}
                        </span>

                        {tx.referenceCode && (
                          <span>
                            Mã:{' '}
                            {
                              tx.referenceCode
                            }
                          </span>
                        )}

                        <span>
                          Số dư:{' '}
                          {tx.balanceAfter.toLocaleString(
                            'vi-VN',
                          )}
                          ₫
                        </span>
                      </div>
                    </div>
                  </div>

                  <p
                    className={`font-bold text-sm whitespace-nowrap ${
                      isIncoming
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {isIncoming
                      ? '+'
                      : ''}
                    {tx.amount.toLocaleString(
                      'vi-VN',
                    )}
                    ₫
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}