import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children, serverStatus }: { children: ReactNode; serverStatus?: { mongo?: string; status?: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" dir="rtl">
      <TopBar serverStatus={serverStatus} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col lg:min-h-[calc(100vh-72px)] lg:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
