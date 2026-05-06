import { Gauge, FolderKanban, ShieldCheck, Rocket, DatabaseBackup, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { key: "dashboard", label: "דשבורד", icon: Gauge, to: "/" , active: true},
  { key: "sites", label: "אתרים", icon: FolderKanban, to: "/", active: true },
  { key: "health", label: "בדיקות תקינות", icon: ShieldCheck, active: false },
  { key: "deploy", label: "פריסות ועדכונים", icon: Rocket, active: false },
  { key: "backup", label: "גיבויים", icon: DatabaseBackup, active: false },
  { key: "settings", label: "הגדרות", icon: Settings, active: false }
];

export function Sidebar() {
  return (
    <aside className="w-full border-b border-slate-200 bg-white lg:w-64 lg:border-b-0 lg:border-l">
      <div className="p-4">
        <div className="mb-4 rounded-xl bg-slate-100 p-3 text-xs text-slate-600">ניווט מרכז הבקרה</div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.active) {
              return (
                <NavLink
                  key={item.key}
                  to={item.to!}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
                  }
                >
                  <span className="flex items-center gap-2"><Icon size={14} />{item.label}</span>
                </NavLink>
              );
            }

            return (
              <div key={item.key} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400">
                <span className="flex items-center gap-2"><Icon size={14} />{item.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">בקרוב</span>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
