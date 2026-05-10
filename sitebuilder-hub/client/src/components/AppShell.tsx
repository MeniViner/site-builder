import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children, serverStatus }: { children: ReactNode; serverStatus?: { mongo?: string; status?: string } }) {
  return (
    <div className="min-h-screen text-slate-100" dir="rtl">
      <TopBar serverStatus={serverStatus} />
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-3 pb-6 pt-4 lg:min-h-[calc(100vh-84px)] lg:flex-row lg:px-4">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
