export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">
      <p className="text-sm font-medium">{message}</p>
      {onRetry ? (
        <button className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm" onClick={onRetry}>
          נסה שוב
        </button>
      ) : null}
    </div>
  );
}
