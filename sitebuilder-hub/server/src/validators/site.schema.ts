import { z } from "zod";

const statusEnum = z.enum(["active", "warning", "failed", "draft", "archived"]);

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^https?:\/\//i.test(value), "יש להזין כתובת URL תקינה");

const optionalNonNegative = z.coerce.number().optional().refine((value) => value === undefined || value >= 0, "הערך חייב להיות 0 או יותר");

const healthSchema = z.object({
  siteDbExists: z.boolean().optional(),
  usersDbExists: z.boolean().optional(),
  distExists: z.boolean().optional(),
  indexExists: z.boolean().optional(),
  assetsExists: z.boolean().optional(),
  txtFilesExist: z.boolean().optional(),
  adminsSyncOk: z.boolean().optional(),
  permissionsOk: z.boolean().optional()
});

export const createSiteSchema = z.object({
  siteCode: z.string().trim().min(1, "קוד אתר הוא שדה חובה"),
  displayName: z.string().trim().min(1, "שם אתר הוא שדה חובה"),
  description: z.string().optional(),
  sharePointHost: z.string().optional(),
  sharePointSiteUrl: z.string().trim().url("יש להזין כתובת SharePoint תקינה"),
  finalAppUrl: optionalUrl,
  siteDbLibrary: z.string().optional(),
  usersDbLibrary: z.string().optional(),
  bootstrapLibrary: z.string().optional(),
  bootstrapFolder: z.string().optional(),
  ownerName: z.string().optional(),
  ownerPersonalNumber: z.string().optional(),
  ownerEmail: z.string().trim().email("יש להזין אימייל תקין").optional().or(z.literal("")),
  ownerPhone: z.string().optional(),
  unitName: z.string().optional(),
  status: statusEnum.optional(),
  version: z.string().optional(),
  storageMb: optionalNonNegative,
  filesCount: optionalNonNegative,
  adminsCount: optionalNonNegative,
  lastHealthCheckAt: z.coerce.date().optional(),
  lastDeployAt: z.coerce.date().optional(),
  lastError: z.string().optional(),
  notes: z.string().optional(),
  health: healthSchema.optional()
});

export const updateSiteSchema = createSiteSchema.partial();

export const manualHealthSchema = z.object({ health: healthSchema });

export const querySchema = z.object({
  status: statusEnum.optional(),
  search: z.string().optional(),
  siteCode: z.string().optional()
});
