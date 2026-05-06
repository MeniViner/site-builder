import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { app } from "./app";
import { logger } from "./utils/logger";

const bootstrap = async () => {
  await connectMongo();
  app.listen(env.SERVER_PORT, () => {
    logger.info("Site Builder Hub server started", { port: env.SERVER_PORT });
  });
};

bootstrap().catch((error) => {
  logger.error("Failed to start server", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
