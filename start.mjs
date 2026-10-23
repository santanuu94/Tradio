// start.mjs - Starts both the 24/7 background trading daemon AND the Next.js web dashboard
import { spawn } from "node:child_process";

console.log("[Tradio] Launching 24/7 background trading daemon...");
const engine = spawn("node", ["scripts/v2/engine.mjs"], { stdio: "inherit" });

console.log("[Tradio] Launching Next.js web dashboard...");
const port = process.env.PORT || "3000";
const web = spawn("npm", ["--prefix", "web", "run", "start", "--", "-p", port], { stdio: "inherit" });

engine.on("exit", (code) => {
  console.error(`[Tradio] Trading engine stopped with code ${code}`);
});

web.on("exit", (code) => {
  console.error(`[Tradio] Web dashboard stopped with code ${code}`);
  process.exit(code ?? 1);
});
