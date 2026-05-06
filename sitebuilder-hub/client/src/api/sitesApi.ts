import { Site, SitesStats, SiteHealth } from "../types/site";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100/api";

type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
type ApiError = { ok: false; error: { code: string; message: string; details?: unknown } };

async function parseResponse<T>(response: Response): Promise<ApiSuccess<T>> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiError;
  if (!response.ok || payload.ok === false) {
    const message = (payload as ApiError).error?.message ?? "שגיאת API";
    throw new Error(message);
  }
  return payload as ApiSuccess<T>;
}

export const sitesApi = {
  health: async () => parseResponse<{ status: string; serverTime: string; mongo: string }>(await fetch(`${API_BASE_URL}/health`)),
  list: async (params?: Record<string, string>) => {
    const query = new URLSearchParams(params ?? {}).toString();
    const url = query ? `${API_BASE_URL}/sites?${query}` : `${API_BASE_URL}/sites`;
    const res = await parseResponse<Site[]>(await fetch(url));
    return { data: res.data, meta: res.meta as { count: number; stats: SitesStats } };
  },
  getById: async (id: string) => parseResponse<Site>(await fetch(`${API_BASE_URL}/sites/${id}`)),
  create: async (site: Partial<Site>) =>
    parseResponse<Site>(
      await fetch(`${API_BASE_URL}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(site)
      })
    ),
  update: async (id: string, site: Partial<Site>) =>
    parseResponse<Site>(
      await fetch(`${API_BASE_URL}/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(site)
      })
    ),
  archive: async (id: string) => parseResponse<Site>(await fetch(`${API_BASE_URL}/sites/${id}`, { method: "DELETE" })),
  updateManualHealth: async (id: string, health: SiteHealth) =>
    parseResponse<Site>(
      await fetch(`${API_BASE_URL}/sites/${id}/health-check/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ health })
      })
    )
};
