import * as Dialog from '@radix-ui/react-dialog';
import { Star, X } from 'lucide-react';

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}

interface ReviewsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  operatorName: string;
  averageRating: number;
  totalReviews: number;
  reviews: Review[];
}

export function ReviewsDialog({ isOpen, onOpenChange, operatorName, averageRating, totalReviews, reviews }: ReviewsDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm transition-opacity" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg max-h-[85vh] z-50 flex flex-col outline-none animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-6 border-b border-slate-100">
            <div>
              <Dialog.Title className="text-xl font-bold text-slate-900">Đánh giá khách hàng</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">{operatorName}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            <div className="flex items-center gap-6 mb-8 bg-slate-50 p-4 rounded-xl">
              <div className="text-center">
                <div className="text-4xl font-black text-slate-900">{averageRating.toFixed(1)}</div>
                <div className="flex justify-center my-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`w-4 h-4 ${star <= Math.round(averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`} />
                  ))}
                </div>
                <div className="text-xs text-slate-500 font-medium">{totalReviews} đánh giá</div>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviews.filter(r => Math.round(r.rating) === star).length;
                  const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-slate-600 font-medium">{star}</span>
                      <Star className="w-3 h-3 fill-slate-400 text-slate-400" />
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${percentage}%` }}></div>
                      </div>
                      <span className="w-8 text-right text-xs text-slate-500">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              {reviews.map((review) => (
                <div key={review.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-slate-800">{review.author}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{review.date}</div>
                    </div>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
