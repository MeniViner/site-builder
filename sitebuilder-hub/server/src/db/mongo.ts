import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export const connectMongo = async () => {
  await mongoose.connect(env.MONGO_URI);
  logger.info("MongoDB connected", { uri: env.MONGO_URI });
};

export const getMongoStatus = () => {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
};
