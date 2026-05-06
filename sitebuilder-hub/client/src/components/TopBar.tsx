import { CircleDot } from "lucide-react";

export function TopBar({ serverStatus }: { serverStatus?: { mongo?: string; status?: string } }) {
  const healthy = serverStatus?.status === "ok";
  const mongoConnected = serverStatus?.mongo === "connected";

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Site Builder Hub</h1>
          <p className="text-xs text-slate-500">מרכז ניהול לאתרי Site Builder</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-800">פיתוח מקומי</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${healthy ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}><CircleDot size={10} />Server</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${mongoConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}><CircleDot size={10} />Mongo</span>
        </div>
      </div>
    </header>
  );
}
