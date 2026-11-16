/** Rebuilds `<outDir>/index.html` from every finished flow's `flow.json`, so a run of one flow keeps the others listed. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Resolved } from "./settings.js";
import { indexHtml, type FlowManifest } from "./templates.js";

export function writeIndex(kit: Resolved) {
  const out = kit.outDir;
  if (!existsSync(out)) return;
  const flows = readdirSync(out, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(out, entry.name, "flow.json")))
    .map((entry) => JSON.parse(readFileSync(join(out, entry.name, "flow.json"), "utf8")) as FlowManifest);
  if (flows.length === 0) return;
  writeFileSync(join(out, "index.html"), indexHtml(kit, flows));
  console.log(`\nWalkthroughs: ${flows.length} flow(s) listed in ${join(out, "index.html")}`);
}
