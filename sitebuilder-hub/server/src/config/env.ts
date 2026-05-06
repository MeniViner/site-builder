import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_PORT: z.coerce.number().int().positive("SERVER_PORT חייב להיות מספר חיובי").default(4100),
  MONGO_URI: z.string().min(1, "MONGO_URI הוא שדה חובה"),
  CLIENT_ORIGIN: z.string().url("CLIENT_ORIGIN חייב להיות URL תקין").default("http://localhost:5177")
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  SERVER_PORT: process.env.SERVER_PORT,
  MONGO_URI: process.env.MONGO_URI,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN
});

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`תצורת סביבה לא תקינה: ${details}`);
}

export const env = parsed.data;
