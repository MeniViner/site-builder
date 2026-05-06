import dotenv from "dotenv";
import { connectMongo } from "../db/mongo";
import { Site } from "../models/Site";

dotenv.config();

const samples = [
  {
    siteCode: "schedule",
    displayName: "מערכת לו\"ז חטיבתית",
    sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
    finalAppUrl: "https://portal.army.idf/sites/schedule/app",
    siteDbLibrary: "siteDB",
    usersDbLibrary: "siteUsersDb",
    ownerName: "רון כהן",
    ownerPhone: "050-1111111",
    unitName: "אג\"ם",
    status: "active",
    version: "1.4.2",
    storageMb: 392,
    filesCount: 1012,
    lastHealthCheckAt: new Date(),
    health: { siteDbExists: true, usersDbExists: true, distExists: true, indexExists: true, assetsExists: true, txtFilesExist: true, adminsSyncOk: true, permissionsOk: true }
  },
  {
    siteCode: "demo-training",
    displayName: "אתר הדגמות הדרכה",
    sharePointSiteUrl: "https://portal.army.idf/sites/demo-training",
    siteDbLibrary: "siteDB2",
    usersDbLibrary: "siteUsersDb2",
    ownerName: "שירה לוי",
    ownerPhone: "050-2222222",
    unitName: "בה\"ד הדרכה",
    status: "warning",
    version: "1.2.0",
    storageMb: 118,
    filesCount: 94,
    lastHealthCheckAt: new Date(),
    health: { siteDbExists: true, usersDbExists: true, distExists: true, indexExists: true, assetsExists: false, txtFilesExist: true, adminsSyncOk: false, permissionsOk: true }
  },
  {
    siteCode: "reports",
    displayName: "דוחות יחידה",
    sharePointSiteUrl: "https://portal.army.idf/sites/reports",
    siteDbLibrary: "siteDB3",
    usersDbLibrary: "siteUsersDb3",
    ownerName: "יואב אדרי",
    ownerPhone: "050-3333333",
    unitName: "מחלקת נתונים",
    status: "failed",
    version: "0.9.4",
    storageMb: 70,
    filesCount: 56,
    lastHealthCheckAt: new Date(),
    health: { siteDbExists: false, usersDbExists: true, distExists: false, indexExists: false, assetsExists: true, txtFilesExist: false, adminsSyncOk: false, permissionsOk: false }
  },
  {
    siteCode: "draft-ops",
    displayName: "אתר תכנון מבצעי",
    sharePointSiteUrl: "https://portal.army.idf/sites/draft-ops",
    siteDbLibrary: "siteDB4",
    usersDbLibrary: "siteUsersDb4",
    ownerName: "מיכל ברק",
    ownerPhone: "050-4444444",
    unitName: "מבצעים",
    status: "draft",
    version: "0.1.0",
    storageMb: 12,
    filesCount: 8
  },
  {
    siteCode: "archive-legacy",
    displayName: "אתר מורשת ישן",
    sharePointSiteUrl: "https://portal.army.idf/sites/archive-legacy",
    siteDbLibrary: "siteDB5",
    usersDbLibrary: "siteUsersDb5",
    ownerName: "דני רביב",
    ownerPhone: "050-5555555",
    unitName: "תיעוד",
    status: "archived",
    version: "0.7.0",
    storageMb: 810,
    filesCount: 4033,
    lastHealthCheckAt: new Date(),
    health: { siteDbExists: true, usersDbExists: true, distExists: true, indexExists: true, assetsExists: true, txtFilesExist: true, adminsSyncOk: true, permissionsOk: true }
  }
];

async function seed() {
  await connectMongo();
  for (const sample of samples) {
    await Site.updateOne({ siteCode: sample.siteCode }, { $set: sample }, { upsert: true });
  }
  console.log(`Seed completed: ${samples.length} records synced`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
