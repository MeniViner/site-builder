import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function LinkRow({ label, value, isUrl = false }: { label: string; value?: string; isUrl?: boolean }) {
  if (!value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-400">-</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="max-w-[340px] truncate font-mono text-xs tabular text-slate-800">{value}</span>
        <CopyButton value={value} />
        {isUrl ? (
          <a className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs" href={value} target="_blank" rel="noreferrer">
            פתח <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
