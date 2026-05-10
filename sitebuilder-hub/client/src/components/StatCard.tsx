import { ReactNode } from "react";

export function StatCard({
  title,
  value,
  icon,
  description,
  secondary,
  trend = "stable",
  actionLabel
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  description: string;
  secondary: string;
  trend?: "up" | "down" | "stable";
  actionLabel?: string;
}) {
  const trendTone = trend === "up" ? "text-rose-300" : trend === "down" ? "text-emerald-300" : "text-slate-400";

  return (
    <div className="glass-card rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/30">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{title}</span>
        <span className="rounded-xl bg-slate-800/90 p-2 text-cyan-300">{icon}</span>
      </div>
      <p className="tabular font-mono text-2xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
      <div className="mt-3 flex items-center justify-between">
        <p className={`text-xs ${trendTone}`}>{secondary}</p>
        {actionLabel ? <span className="text-[11px] text-cyan-300">{actionLabel}</span> : null}
      </div>
    </div>
  );
}
