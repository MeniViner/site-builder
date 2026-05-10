import { Gauge, FolderKanban, ShieldCheck, Rocket, DatabaseBackup, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { key: "dashboard", label: "דשבורד", icon: Gauge, to: "/", active: true },
  { key: "sites", label: "רשימת אתרים", icon: FolderKanban, to: "/", active: true },
  { key: "health", label: "בדיקות תקינות", icon: ShieldCheck, active: false },
  { key: "deploy", label: "פריסות ועדכונים", icon: Rocket, active: false },
  { key: "backup", label: "גיבויים", icon: DatabaseBackup, active: false },
  { key: "settings", label: "הגדרות", icon: Settings, active: false }
];

export function Sidebar() {
  return (
    <aside className="glass-card w-full rounded-2xl lg:sticky lg:top-24 lg:h-fit lg:w-72">
      <div className="p-4">
        <div className="mb-4 rounded-xl bg-slate-800/70 p-3 text-xs text-slate-300">ניווט מרכז הבקרה</div>
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.active) {
              return (
                <NavLink
                  key={item.key}
                  to={item.to!}
                  className={({ isActive }) =>
                    `group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-100"
                        : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/70"
                    }`
                  }
                >
                  <span className="flex items-center gap-2"><Icon size={15} />{item.label}</span>
                </NavLink>
              );
            }

            return (
              <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 text-sm text-slate-500">
                <span className="flex items-center gap-2"><Icon size={15} />{item.label}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px]">בקרוב</span>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
