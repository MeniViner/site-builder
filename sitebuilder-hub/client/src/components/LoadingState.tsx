export function LoadingState({ label = "טוען נתונים..." }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-8 text-center text-slate-300 shadow-sm">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-300" />
      {label}
    </div>
  );
}
