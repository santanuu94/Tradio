import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------------------------------------------
// Robust path resolver for local development & Netlify serverless deployment
// ---------------------------------------------------------------------------
function findDataFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), "data", filename),
    path.join(process.cwd(), "public", "data", filename),
    path.join(process.cwd(), "..", "data", filename),
    path.join(process.cwd(), "web", "data", filename),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findConfigFile(): string | null {
  const directData = findDataFile("config.json");
  if (directData) return directData;

  const candidates = [
    path.join(process.cwd(), "config.json"),
    path.join(process.cwd(), "..", "config.json"),
    path.join(process.cwd(), "web", "config.json"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safe file readers
// ---------------------------------------------------------------------------
function readJSON(fp: string | null, fallback: any = null): any {
  try {
    if (!fp || !fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return fallback;
  }
}

function readJSONL(fp: string | null, limit = 0): any[] {
  try {
    if (!fp || !fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const parsed = lines
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
    if (limit > 0 && parsed.length > limit) return parsed.slice(-limit);
    return parsed;
  } catch {
    return [];
  }
}

/** Keep at most `max` evenly-spaced points, always including the last. */
function downsample(arr: any[], max: number): any[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: any[] = [];
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  // Always include the very last data point
  if (out.length > 0) {
    out[out.length - 1] = arr[arr.length - 1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/state
// ---------------------------------------------------------------------------
export async function GET() {
  const configFile  = findConfigFile();
  const config      = readJSON(configFile, {});
  const signals     = readJSON(findDataFile("signals.v2.json"), {});
  const state       = readJSON(findDataFile("state.v2.json"), {});
  const strategies  = readJSON(findDataFile("strategies.json"), []);

  const episodes    = readJSONL(findDataFile("episodes.jsonl"), 40);
  const generations = readJSONL(findDataFile("generations.jsonl"), 30).reverse();
  const memory      = readJSONL(findDataFile("memory.jsonl"), 20).reverse();
  const equityRaw   = readJSONL(findDataFile("equity.v2.jsonl"));
  const equity      = downsample(equityRaw, 320);
  const trades      = readJSONL(findDataFile("trades.v2.jsonl"), 60).reverse();

  return NextResponse.json(
    {
      v2: {
        signals,
        state,
        config,
        strategies,
        episodes,
        generations,
        memory,
        equity,
        trades,
        serverTs: Date.now(),
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
