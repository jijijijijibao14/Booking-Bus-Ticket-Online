export type DialogVariant = 'info' | 'warning' | 'danger';

type DialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
};

export type DialogRequest = DialogOptions & {
  type: 'alert' | 'confirm';
  resolve: (confirmed: boolean) => void;
};

type DialogListener = (request: DialogRequest) => void;

let listener: DialogListener | null = null;
const pendingDialogs: DialogRequest[] = [];

function publishDialog(request: DialogRequest) {
  if (listener) {
    listener(request);
  } else {
    pendingDialogs.push(request);
  }
}

export function subscribeToDialogs(nextListener: DialogListener) {
  listener = nextListener;
  while (pendingDialogs.length > 0) {
    nextListener(pendingDialogs.shift()!);
  }

  return () => {
    if (listener === nextListener) listener = null;
  };
}

export function showConfirmDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    publishDialog({ ...options, type: 'confirm', resolve });
  });
}

export function showAlertDialog(
  message: string,
  options: Pick<DialogOptions, 'title' | 'variant' | 'confirmLabel'> = {},
): Promise<void> {
  return new Promise((resolve) => {
    publishDialog({
      title: options.title || 'Thông báo',
      message,
      confirmLabel: options.confirmLabel || 'Đã hiểu',
      variant: options.variant || 'info',
      type: 'alert',
      resolve: () => resolve(),
    });
  });
}
