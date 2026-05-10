export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-200 shadow-sm">
      <p className="text-sm font-medium">{message}</p>
      {onRetry ? (
        <button className="mt-3 rounded-lg border border-rose-400/40 bg-slate-950/40 px-3 py-2 text-sm" onClick={onRetry}>
          נסה שוב
        </button>
      ) : null}
    </div>
  );
}
