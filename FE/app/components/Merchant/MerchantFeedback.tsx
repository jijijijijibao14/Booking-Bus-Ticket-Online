import { useEffect, useState } from 'react';
import { MessageSquare, Star } from 'lucide-react';
import { getMerchantFeedback, replyToFeedback } from '@/api';

interface Feedback {
  feedbackId: number;
  rating: number;
  serviceRating: number;
  comment: string | null;
  partnerReply: string | null;
  createdAt: string;
  partnerRepliedAt: string | null;
  customerName: string;
  departureLocation: string;
  arrivalLocation: string;
  departureTime: string;
}

export default function MerchantFeedback() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    const response = await getMerchantFeedback();
    setFeedback(response.data.data);
  };

  useEffect(() => {
    let mounted = true;
    getMerchantFeedback()
      .then((response) => {
        if (mounted) setFeedback(response.data.data);
      })
      .catch((requestError) => {
        console.error('Could not load merchant reviews:', requestError);
        if (mounted) setError(requestError.response?.data?.message || 'Không thể tải đánh giá.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleReply = async (feedbackId: number) => {
    const reply = (replies[feedbackId] || '').trim();
    if (!reply) {
      setError('Vui lòng nhập nội dung phản hồi.');
      return;
    }
    setSavingId(feedbackId);
    setError('');
    setNotice('');
    try {
      await replyToFeedback(feedbackId, reply);
      setReplies((previous) => ({ ...previous, [feedbackId]: '' }));
      await refresh();
      setNotice('Đã gửi phản hồi đánh giá.');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể gửi phản hồi.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-r from-blue-800 to-blue-600 p-6 text-white">
        <h2 className="text-2xl font-bold">Đánh giá từ hành khách</h2>
        <p className="mt-1 text-sm text-blue-100">Theo dõi trải nghiệm và phản hồi trực tiếp tới khách hàng.</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
      {loading ? (
        <p className="p-8 text-center text-slate-500">Đang tải đánh giá...</p>
      ) : feedback.length === 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white p-10 text-center text-slate-500">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-blue-300" />
          Chưa có đánh giá cho các chuyến xe của bạn.
        </div>
      ) : feedback.map((item) => (
        <article key={item.feedbackId} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">{item.customerName}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.departureLocation} → {item.arrivalLocation}</p>
              <p className="mt-1 text-xs text-slate-400">{new Date(item.departureTime).toLocaleString('vi-VN')}</p>
            </div>
            <time className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString('vi-VN')}</time>
          </div>
          <div className="mt-3 flex items-center gap-1" aria-label={`Đánh giá ${item.rating} trên 5 sao`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} className={`h-4 w-4 ${index < item.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
            ))}
            <span className="ml-1 text-sm font-semibold text-slate-700">{item.rating}/5</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Dịch vụ: {item.serviceRating}/5</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.comment || 'Khách hàng không để lại nhận xét.'}</p>
          {item.partnerReply ? (
            <div className="mt-4 rounded-xl bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Phản hồi của nhà xe</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.partnerReply}</p>
              {item.partnerRepliedAt && <time className="mt-2 block text-xs text-slate-400">{new Date(item.partnerRepliedAt).toLocaleString('vi-VN')}</time>}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <textarea
                value={replies[item.feedbackId] || ''}
                onChange={(event) => setReplies((previous) => ({ ...previous, [item.feedbackId]: event.target.value }))}
                maxLength={2000}
                rows={3}
                placeholder="Viết phản hồi cho khách hàng..."
                className="w-full rounded-xl border border-blue-100 p-3 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => handleReply(item.feedbackId)}
                disabled={savingId === item.feedbackId}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {savingId === item.feedbackId ? 'Đang gửi...' : 'Gửi phản hồi'}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}