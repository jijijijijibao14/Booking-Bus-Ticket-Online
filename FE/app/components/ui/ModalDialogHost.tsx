import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToDialogs, type DialogRequest } from '@/utils/modal-dialog';

export default function ModalDialogHost() {
  const [activeDialog, setActiveDialog] = useState<DialogRequest | null>(null);
  const activeDialogRef = useRef<DialogRequest | null>(null);
  const queuedDialogs = useRef<DialogRequest[]>([]);

  useEffect(() => subscribeToDialogs((request) => {
    if (activeDialogRef.current) {
      queuedDialogs.current.push(request);
      return;
    }
    activeDialogRef.current = request;
    setActiveDialog(request);
  }), []);

  useEffect(() => {
    if (!activeDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDialog]);

  const closeDialog = (confirmed: boolean) => {
    const currentDialog = activeDialogRef.current;
    if (!currentDialog) return;
    currentDialog.resolve(confirmed);
    const nextDialog = queuedDialogs.current.shift() || null;
    activeDialogRef.current = nextDialog;
    setActiveDialog(nextDialog);
  };

  if (!activeDialog) return null;

  const Icon = activeDialog.variant === 'danger'
    ? AlertTriangle
    : activeDialog.variant === 'warning'
      ? AlertTriangle
      : Info;
  const iconStyle = activeDialog.variant === 'danger'
    ? 'bg-rose-100 text-rose-600'
    : activeDialog.variant === 'warning'
      ? 'bg-amber-100 text-amber-600'
      : 'bg-blue-100 text-blue-700';
  const confirmStyle = activeDialog.variant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300'
    : 'bg-blue-700 hover:bg-blue-800 focus-visible:ring-blue-300';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog(false);
      }}
    >
      <section
        role={activeDialog.type === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="modal-dialog-title"
        aria-describedby="modal-dialog-message"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconStyle}`}>
              {activeDialog.variant === 'info'
                ? <Info className="h-6 w-6" />
                : <Icon className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h2 id="modal-dialog-title" className="text-lg font-bold text-slate-900">
                  {activeDialog.title}
                </h2>
                <button
                  type="button"
                  onClick={() => closeDialog(false)}
                  aria-label="Đóng thông báo"
                  className="-mr-2 -mt-2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p id="modal-dialog-message" className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {activeDialog.message}
              </p>
            </div>
          </div>
          <div className="mt-7 flex justify-end gap-3">
            {activeDialog.type === 'confirm' && (
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
              >
                {activeDialog.cancelLabel || 'Hủy'}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => closeDialog(true)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4 ${confirmStyle}`}
            >
              {activeDialog.confirmLabel || 'Xác nhận'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
