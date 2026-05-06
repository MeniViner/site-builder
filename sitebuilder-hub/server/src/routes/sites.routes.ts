import { Router } from "express";
import {
  createSite,
  deleteSite,
  getSite,
  listSites,
  manualHealthCheck,
  updateSite
} from "../controllers/sites.controller";

const router = Router();

router.get("/", listSites);
router.get("/:id", getSite);
router.post("/", createSite);
router.patch("/:id", updateSite);
router.delete("/:id", deleteSite);
router.post("/:id/health-check/manual", manualHealthCheck);

export default router;
