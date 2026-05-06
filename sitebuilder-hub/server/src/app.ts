import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { getMongoStatus } from "./db/mongo";
import sitesRoutes from "./routes/sites.routes";
import { fail, ok } from "./utils/http";
import { logger } from "./utils/logger";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  logger.info("API request started", { method: req.method, path: req.path });
  res.on("finish", () => {
    logger.info("API request finished", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
});

app.get("/api/health", (_req, res) => {
  return ok(res, {
    status: "ok",
    serverTime: new Date().toISOString(),
    mongo: getMongoStatus()
  });
});

app.use("/api/sites", sitesRoutes);

app.use((_req, res) => fail(res, "NOT_FOUND", "הנתיב המבוקש לא נמצא", undefined, 404));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { message: err.message });
  return fail(res, "INTERNAL_ERROR", "אירעה שגיאה פנימית בשרת", undefined, 500);
});
