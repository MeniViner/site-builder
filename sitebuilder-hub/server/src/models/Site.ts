import { InferSchemaType, Schema, model } from "mongoose";

const healthSchema = new Schema(
  {
    siteDbExists: { type: Boolean, default: false },
    usersDbExists: { type: Boolean, default: false },
    distExists: { type: Boolean, default: false },
    indexExists: { type: Boolean, default: false },
    assetsExists: { type: Boolean, default: false },
    txtFilesExist: { type: Boolean, default: false },
    adminsSyncOk: { type: Boolean, default: false },
    permissionsOk: { type: Boolean, default: false }
  },
  { _id: false }
);

const siteSchema = new Schema(
  {
    siteCode: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    sharePointHost: { type: String, default: "portal.army.idf" },
    sharePointSiteUrl: { type: String, required: true },
    finalAppUrl: { type: String, default: "" },
    siteDbLibrary: { type: String, default: "" },
    usersDbLibrary: { type: String, default: "" },
    bootstrapLibrary: { type: String, default: "" },
    bootstrapFolder: { type: String, default: "" },
    ownerName: { type: String, default: "" },
    ownerPersonalNumber: { type: String, default: "" },
    ownerEmail: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    unitName: { type: String, default: "" },
    status: { type: String, enum: ["active", "warning", "failed", "draft", "archived"], default: "draft" },
    version: { type: String, default: "1.0.0" },
    storageMb: { type: Number, default: 0 },
    filesCount: { type: Number, default: 0 },
    adminsCount: { type: Number, default: 0 },
    lastHealthCheckAt: { type: Date },
    lastDeployAt: { type: Date },
    lastError: { type: String, default: "" },
    notes: { type: String, default: "" },
    health: { type: healthSchema, default: () => ({}) }
  },
  { timestamps: true }
);

export type SiteDocument = InferSchemaType<typeof siteSchema>;
export type SiteHealth = InferSchemaType<typeof healthSchema>;
export const Site = model("Site", siteSchema);
