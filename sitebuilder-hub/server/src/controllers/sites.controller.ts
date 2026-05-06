import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  createSiteSchema,
  manualHealthSchema,
  querySchema,
  updateSiteSchema
} from "../validators/site.schema";
import * as sitesService from "../services/sites.service";
import { fail, ok } from "../utils/http";
import { logger } from "../utils/logger";

const handleError = (error: unknown, res: Response) => {
  if (error instanceof ZodError) {
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }
  if (error instanceof Error && /duplicate key/.test(error.message)) {
    return fail(res, "DUPLICATE_SITE_CODE", "קוד אתר כבר קיים במערכת", undefined, 409);
  }
  logger.error("Request failed", { error: error instanceof Error ? error.message : String(error) });
  return fail(res, "INTERNAL_ERROR", "אירעה שגיאה פנימית בשרת", undefined, 500);
};

export const listSites = async (req: Request, res: Response) => {
  try {
    const filters = querySchema.parse(req.query);
    const [sites, stats] = await Promise.all([sitesService.listSites(filters), sitesService.getStats()]);
    const data = sites.map((site) => sitesService.withDerivedHealth(site.toObject()));
    return ok(res, data, { count: data.length, stats });
  } catch (error) {
    return handleError(error, res);
  }
};

export const getSite = async (req: Request, res: Response) => {
  const site = await sitesService.getSiteById(req.params.id);
  if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
  return ok(res, sitesService.withDerivedHealth(site.toObject()));
};

export const createSite = async (req: Request, res: Response) => {
  try {
    const payload = createSiteSchema.parse(req.body);
    const site = await sitesService.createSite(payload);
    logger.info("Site created", { id: site._id.toString(), siteCode: site.siteCode });
    return ok(res, sitesService.withDerivedHealth(site.toObject()), undefined, 201);
  } catch (error) {
    return handleError(error, res);
  }
};

export const updateSite = async (req: Request, res: Response) => {
  try {
    const payload = updateSiteSchema.parse(req.body);
    const site = await sitesService.updateSite(req.params.id, payload);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
    logger.info("Site updated", { id: site._id.toString(), siteCode: site.siteCode });
    return ok(res, sitesService.withDerivedHealth(site.toObject()));
  } catch (error) {
    return handleError(error, res);
  }
};

export const deleteSite = async (req: Request, res: Response) => {
  const force = req.query.force === "true";
  const site = await sitesService.archiveOrDeleteSite(req.params.id, force);
  if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
  logger.info(force ? "Site deleted" : "Site archived", { id: site._id.toString(), siteCode: site.siteCode });
  return ok(res, sitesService.withDerivedHealth(site.toObject()), { mode: force ? "deleted" : "archived" });
};

export const manualHealthCheck = async (req: Request, res: Response) => {
  try {
    const { health } = manualHealthSchema.parse(req.body);
    const site = await sitesService.manualHealthCheck(req.params.id, health);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
    logger.info("Manual health updated", { id: site._id.toString(), siteCode: site.siteCode });
    return ok(res, sitesService.withDerivedHealth(site.toObject()));
  } catch (error) {
    return handleError(error, res);
  }
};
