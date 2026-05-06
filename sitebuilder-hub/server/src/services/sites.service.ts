import { FilterQuery } from "mongoose";
import { Site, SiteDocument } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";

export const listSites = (filters: { status?: string; search?: string; siteCode?: string }) => {
  const query: FilterQuery<SiteDocument> = {};
  if (filters.status) query.status = filters.status;
  if (filters.siteCode) query.siteCode = filters.siteCode;
  if (filters.search) {
    query.$or = [
      { displayName: { $regex: filters.search, $options: "i" } },
      { siteCode: { $regex: filters.search, $options: "i" } },
      { ownerName: { $regex: filters.search, $options: "i" } },
      { unitName: { $regex: filters.search, $options: "i" } }
    ];
  }
  return Site.find(query).sort({ updatedAt: -1 });
};

export const getSiteById = (id: string) => Site.findById(id);
export const createSite = (payload: Record<string, unknown>) => Site.create(payload);
export const updateSite = (id: string, payload: Record<string, unknown>) =>
  Site.findByIdAndUpdate(id, payload, { new: true, runValidators: true });

export const archiveOrDeleteSite = async (id: string, force: boolean) => {
  if (force) return Site.findByIdAndDelete(id);
  return Site.findByIdAndUpdate(id, { status: "archived" }, { new: true, runValidators: true });
};

export const manualHealthCheck = (id: string, health: Record<string, boolean>) =>
  Site.findByIdAndUpdate(id, { health, lastHealthCheckAt: new Date() }, { new: true, runValidators: true });

export const withDerivedHealth = <T extends { health?: unknown; lastHealthCheckAt?: Date | null }>(site: T) => ({
  ...site,
  derivedHealthStatus: deriveHealthStatus(site.health as any, site.lastHealthCheckAt ?? null)
});

export const getStats = async () => {
  const sites = await Site.find({ status: { $ne: "archived" } }, { health: 1, lastHealthCheckAt: 1, status: 1, storageMb: 1 });
  const summary = { healthy: 0, warning: 0, failed: 0, unknown: 0 };

  let totalStorageMb = 0;
  for (const site of sites) {
    totalStorageMb += site.storageMb ?? 0;
    const key = deriveHealthStatus(site.health, site.lastHealthCheckAt ?? null);
    summary[key] += 1;
  }

  return {
    total: sites.length,
    active: sites.filter((s) => s.status === "active").length,
    warning: sites.filter((s) => s.status === "warning").length,
    failed: sites.filter((s) => s.status === "failed").length,
    archived: await Site.countDocuments({ status: "archived" }),
    totalStorageMb,
    health: summary
  };
};
