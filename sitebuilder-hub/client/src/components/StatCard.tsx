import { ReactNode } from "react";

export function StatCard({
  title,
  value,
  icon,
  description,
  secondary
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  description: string;
  secondary: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{title}</span>
        <span className="rounded-lg bg-slate-100 p-2 text-slate-700">{icon}</span>
      </div>
      <p className="tabular font-mono text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <p className="mt-3 text-xs text-slate-400">{secondary}</p>
    </div>
  );
}
