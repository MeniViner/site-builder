import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { SiteDetailsPage } from "./pages/SiteDetailsPage";
import { sitesApi } from "./api/sitesApi";

export default function App() {
  const [serverStatus, setServerStatus] = useState<{ status?: string; mongo?: string }>({});

  useEffect(() => {
    sitesApi.health().then((res) => setServerStatus(res.data)).catch(() => setServerStatus({}));
  }, []);

  return (
    <BrowserRouter>
      <Layout>
        <AppShell serverStatus={serverStatus}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sites/:id" element={<SiteDetailsPage />} />
          </Routes>
        </AppShell>
      </Layout>
    </BrowserRouter>
  );
}
