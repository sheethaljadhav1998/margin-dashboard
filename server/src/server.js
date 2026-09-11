#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestSampleDir } from "../ingest/index.js";
import { createApp } from "./app.js";
import { defaultDbPath, openDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, "../../data/sample");
const PORT = Number(process.env.PORT) || 3001;

function seedIfEmpty(db) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM timesheet_entries").get().n;
  if (n > 0) return false;
  if (!fs.existsSync(SAMPLE_DIR)) return false;
  ingestSampleDir(db, SAMPLE_DIR);
  return true;
}

const db = openDb(process.env.MARGIN_DB || defaultDbPath());
const seeded = seedIfEmpty(db);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Margin Dashboard API on http://localhost:${PORT}`);
  if (seeded) console.log("Seeded empty database from data/sample");
});
