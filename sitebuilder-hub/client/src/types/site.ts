export type SiteStatus = "active" | "warning" | "failed" | "draft" | "archived";
export type DerivedHealthStatus = "healthy" | "warning" | "failed" | "unknown";

export interface SiteHealth {
  siteDbExists?: boolean;
  usersDbExists?: boolean;
  distExists?: boolean;
  indexExists?: boolean;
  assetsExists?: boolean;
  txtFilesExist?: boolean;
  adminsSyncOk?: boolean;
  permissionsOk?: boolean;
}

export interface Site {
  _id: string;
  siteCode: string;
  displayName: string;
  description?: string;
  sharePointHost?: string;
  sharePointSiteUrl: string;
  finalAppUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  ownerName?: string;
  ownerPersonalNumber?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  unitName?: string;
  status: SiteStatus;
  version?: string;
  storageMb?: number;
  filesCount?: number;
  adminsCount?: number;
  lastHealthCheckAt?: string;
  lastDeployAt?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  notes?: string;
  health?: SiteHealth;
  derivedHealthStatus: DerivedHealthStatus;
}

export interface SitesStats {
  total: number;
  active: number;
  warning: number;
  failed: number;
  archived: number;
  totalStorageMb: number;
  health: Record<DerivedHealthStatus, number>;
}
