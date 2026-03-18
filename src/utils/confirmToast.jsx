import React from 'react';
import { toast } from 'react-toastify';

/**
 * מציג הודעת אישור בתוך Toast ומחזיר Promise<boolean>.
 * שימוש:
 * const ok = await confirmToast({ message: 'למחוק?' });
 */
export function confirmToast({
  message,
  title = 'אישור פעולה',
  confirmText = 'אישור',
  cancelText = 'ביטול',
  type = 'default',
}) {
  return new Promise((resolve) => {
    let resolved = false;

    toast(
      ({ closeToast }) => (
        <div dir="rtl" className="w-[min(92vw,380px)] max-w-full">
          <div className="font-bold text-sm text-gray-900 mb-1 text-center">{title}</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap text-center">{message}</div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (resolved) return;
                resolved = true;
                resolve(false);
                closeToast?.();
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm font-bold"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                if (resolved) return;
                resolved = true;
                resolve(true);
                closeToast?.();
              }}
              className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition text-sm font-bold"
            >
              {confirmText}
            </button>
          </div>
        </div>
      ),
      {
        toastId: `confirm:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        type,
        position: 'top-center',
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
        onClose: () => {
          if (resolved) return;
          resolved = true;
          resolve(false);
        },
      }
    );
  });
}

