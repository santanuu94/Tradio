// web/scripts/bundle-data.mjs
// Bundles Tradio data and config for Netlify serverless deployment
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const WEB_DIR = path.resolve(path.dirname(__filename), "..");
const ROOT_DIR = path.resolve(WEB_DIR, "..");

const SRC_DATA = path.join(ROOT_DIR, "data");
const SRC_CONFIG = path.join(ROOT_DIR, "config.json");

const DEST_DATA = path.join(WEB_DIR, "data");
const DEST_PUBLIC_DATA = path.join(WEB_DIR, "public", "data");
const DEST_CONFIG = path.join(WEB_DIR, "config.json");
const DEST_DATA_CONFIG = path.join(WEB_DIR, "data", "config.json");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("[bundle-data] Bundling Tradio data for Netlify...");

fs.mkdirSync(DEST_DATA, { recursive: true });
fs.mkdirSync(DEST_PUBLIC_DATA, { recursive: true });

if (fs.existsSync(SRC_CONFIG)) {
  fs.copyFileSync(SRC_CONFIG, DEST_CONFIG);
  fs.copyFileSync(SRC_CONFIG, DEST_DATA_CONFIG);
  console.log("[bundle-data] Copied config.json to web/ and web/data/");
}

if (fs.existsSync(SRC_DATA)) {
  copyRecursive(SRC_DATA, DEST_DATA);
  console.log("[bundle-data] Copied data to web/data/");
  copyRecursive(SRC_DATA, DEST_PUBLIC_DATA);
  console.log("[bundle-data] Copied data to web/public/data/");
} else {
  console.log("[bundle-data] No parent data directory found; using existing web/data.");
}

console.log("[bundle-data] Done!");
