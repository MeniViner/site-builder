import React from 'react';
import { toast } from 'react-toastify';

const clampPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const buildSummaryText = ({ copiedFiles = 0, skippedFiles = 0, failedFiles = 0 } = {}) =>
    `הועתקו: ${copiedFiles} | דולגו: ${skippedFiles} | שגיאות: ${failedFiles}`;

const renderProgressToastBody = ({ title, message, percent }) => (
    <div dir="rtl" className="w-[min(92vw,420px)] max-w-full">
        <div className="font-bold text-sm text-gray-900 mb-1">{title}</div>
        <div className="text-sm text-gray-700 mb-3">{message}</div>
        <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
                className="h-full bg-primary-600 transition-all duration-300"
                style={{ width: `${clampPercent(percent)}%` }}
            />
        </div>
        <div className="mt-1 text-xs text-gray-500">{clampPercent(percent)}%</div>
    </div>
);

const renderCompletedToastBody = ({ title, summary, backupFolderUrl, buttonText }) => (
    <div dir="rtl" className="w-[min(92vw,420px)] max-w-full">
        <div className="font-bold text-sm text-gray-900 mb-1">{title}</div>
        <div className="text-sm text-gray-700 mb-3">הגיבוי הסתיים בהצלחה.</div>
        <div className="text-xs text-gray-500 mb-3">{summary}</div>
        {backupFolderUrl && (
            <button
                type="button"
                onClick={() => window.open(backupFolderUrl, '_blank', 'noopener,noreferrer')}
                className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition text-sm font-bold"
            >
                {buttonText}
            </button>
        )}
    </div>
);

export const updateBackupProgressToast = ({
    toastId,
    title = 'גיבוי מערכת',
    message = 'מכין גיבוי...',
    percent = 0,
}) => {
    const render = renderProgressToastBody({ title, message, percent });

    if (toast.isActive(toastId)) {
        toast.update(toastId, {
            render,
            type: 'default',
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            closeButton: false,
        });
        return;
    }

    toast(render, {
        toastId,
        type: 'default',
        position: 'top-center',
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
    });
};

export const closeBackupProgressToast = (toastId) => {
    if (!toastId) return;
    toast.dismiss(toastId);
};

export const showBackupCompletedToast = ({
    title = 'גיבוי הושלם',
    copiedFiles = 0,
    skippedFiles = 0,
    failedFiles = 0,
    backupFolderUrl = '',
    autoCloseMs = 5000,
    buttonText = 'מעבר למיקום הגיבוי',
}) => {
    const summary = buildSummaryText({ copiedFiles, skippedFiles, failedFiles });
    toast(
        renderCompletedToastBody({
            title,
            summary,
            backupFolderUrl,
            buttonText,
        }),
        {
            type: failedFiles > 0 ? 'warning' : 'success',
            position: 'top-center',
            autoClose: autoCloseMs,
            closeOnClick: false,
            draggable: false,
            closeButton: true,
        }
    );
};

export const showBackupFailedToast = (message = 'שגיאה ביצירת הגיבוי. אנא נסה שוב.') => {
    toast.error(message, {
        position: 'top-center',
        autoClose: 5000,
    });
};
