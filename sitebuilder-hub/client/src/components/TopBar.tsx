import { CircleDot } from "lucide-react";

function Pill({ label, healthy, neutral }: { label: string; healthy?: boolean; neutral?: boolean }) {
  const style = neutral
    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
    : healthy
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : "border-amber-400/30 bg-amber-500/10 text-amber-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${style}`}>
      <CircleDot size={10} />{label}
    </span>
  );
}

export function TopBar({ serverStatus }: { serverStatus?: { mongo?: string; status?: string } }) {
  const healthy = serverStatus?.status === "ok";
  const mongoConnected = serverStatus?.mongo === "connected";

  return (
    <header className="border-b border-slate-700/60 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Site Builder Hub</h1>
          <p className="text-xs text-slate-400">מרכז שליטה לניהול, ניטור ופריסה של מופעי אתר</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Pill label="סביבת פיתוח מקומית" neutral />
          <Pill label="שרת API" healthy={healthy} />
          <Pill label="MongoDB" healthy={mongoConnected} />
        </div>
      </div>
    </header>
  );
}
