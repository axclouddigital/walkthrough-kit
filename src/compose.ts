/**
 * Turns a recorded flow (harness.ts) into its outputs under `<outDir>/<id>/`:
 *
 *   <id>.mp4     1920x1080: a title card, then the actors' screens side by side over a
 *                still per step (labels, frames, caption), set-up time cut out
 *   <id>.pdf     the steps with their screenshots (also steps.html, steps/*.jpg)
 *   poster.jpg   the video's preview image
 *   flow.json    what the index page lists
 *
 * Needs `ffmpeg` (with libx264) on the PATH. Playwright's own ffmpeg only records.
 */
import { execFile, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import type { FlowRun } from "./harness.js";
import type { Resolved } from "./settings.js";
import { BEZEL, CAPTION, H, LABEL, TOP, W, frameHtml, introHtml, pdfHtml, type FlowManifest, type Layout } from "./templates.js";
import { VOICE_LEAD } from "./voice.js";

const run = promisify(execFile);

const FPS = 25;
/** Seconds the title card stays up (longer when the spoken title needs it). */
const INTRO = 3.5;
/** Seconds into the title card that the spoken title starts, and the pause after it. */
const INTRO_VOICE_LEAD = 0.4;
const INTRO_VOICE_TAIL = 0.9;
const MARGIN = 36;
const GAP = 34;
const PANEL_MIN = 430;
const PANEL_MAX = 600;

const even = (n: number) => 2 * Math.round(n / 2);

/** Screens side by side at their CSS size where they fit (a phone is shown 1:1), scaled down together where they don't. */
function layoutFor(viewports: { width: number; height: number }[]): Layout {
  const top = TOP + 8 + LABEL + BEZEL;
  const maxHeight = H - CAPTION - 6 - BEZEL - top;
  const chrome = viewports.length * 2 * BEZEL + (viewports.length - 1) * GAP;
  let scales = viewports.map((v) => Math.min(1, maxHeight / v.height));
  const widthAt = (s: number[]) => viewports.reduce((sum, v, i) => sum + even(v.width * s[i]), 0);
  const room = W - 2 * MARGIN - chrome;
  if (widthAt(scales) > room) {
    const shrink = room / widthAt(scales);
    scales = scales.map((s) => s * shrink);
  }
  const total = widthAt(scales) + chrome;
  const free = W - 2 * MARGIN - total;
  const panelWidth = free >= PANEL_MIN + GAP ? Math.min(PANEL_MAX, free - GAP) : 0;
  let x = Math.round((W - total - (panelWidth ? panelWidth + GAP : 0)) / 2);
  const screens = viewports.map((v, i) => {
    const rect = { x: x + BEZEL, y: top, w: even(v.width * scales[i]), h: even(v.height * scales[i]) };
    x += rect.w + 2 * BEZEL + GAP;
    return rect;
  });
  return { screens, panel: panelWidth ? { x, y: top - BEZEL, w: panelWidth, h: maxHeight + 2 * BEZEL } : null };
}

async function ffmpeg(args: string[]) {
  try {
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stderr?: string };
    if (detail.code === "ENOENT") throw new Error("ffmpeg isn't on the PATH: the walkthrough videos need it (brew install ffmpeg).");
    throw new Error(`ffmpeg failed: ${(detail.stderr ?? detail.message).trim().split("\n").slice(-6).join("\n")}`);
  }
}

export async function compose(kit: Resolved, flow: FlowRun): Promise<FlowManifest> {
  const { spec, actors, steps, workDir, outDir } = flow;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(workDir, "steps"), join(outDir, "steps"), { recursive: true });

  // One timeline in seconds: the title card, then the recording from the first screen's start.
  const origin = Math.min(...actors.map((actor) => actor.startedAt));
  const introSec = Math.max(INTRO, flow.introVoice ? INTRO_VOICE_LEAD + flow.introVoice.seconds + INTRO_VOICE_TAIL : 0);
  const at = (wallClock: number) => introSec + (wallClock - origin) / 1000;
  const end = at(flow.endedAt);
  const cuts = flow.cuts
    .map(([from, to]): [number, number] => [at(from), Math.min(at(to), end)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  /** Where a moment of the timeline lands once the cuts are out. */
  const kept = (t: number) => t - cuts.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(t, to) - from), 0);
  // The spoken track: the title over the title card, then each step's line as its caption goes up.
  const spoken = [
    ...(flow.introVoice ? [{ file: flow.introVoice.file, atSec: INTRO_VOICE_LEAD }] : []),
    ...steps.flatMap((step) => (step.voice ? [{ file: step.voice.file, atSec: kept(at(step.startedAt)) + VOICE_LEAD }] : [])),
  ];

  const manifest: FlowManifest = {
    id: spec.id,
    title: spec.title,
    role: spec.role,
    summary: spec.summary,
    targetLabel: kit.targetLabel,
    generatedAt: new Date(flow.endedAt).toISOString(),
    commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: kit.root, encoding: "utf8" }).trim(),
    durationSec: kept(end),
    video: `${spec.id}.mp4`,
    pdf: `${spec.id}.pdf`,
    poster: "poster.jpg",
    narrated: spoken.length > 0,
    actors: actors.map((actor) => ({ slug: actor.slug, label: actor.label, device: actor.device.label, ...actor.device.viewport })),
    steps: steps.map((step, i) => ({ n: i + 1, caption: step.caption, note: step.note, atSec: kept(at(step.startedAt)), shown: step.shown, shots: step.shots })),
  };
  const layout = layoutFor(actors.map((actor) => actor.device.viewport));

  const browser = await chromium.launch();
  try {
    // The stills the recordings are laid over: the title card, then one per step.
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const still = async (name: string, html: string) => {
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const file = join(workDir, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    };
    const intro = await still("frame-intro", introHtml(kit, manifest));
    const frames: string[] = [];
    for (const step of manifest.steps) frames.push(await still(`frame-${String(step.n).padStart(2, "0")}`, frameHtml(kit, manifest, layout, step.n - 1)));

    // Each still shows from its step's start to the next one's; boundaries are rounded to whole
    // frames from the timeline, never summed, so the captions can't drift from the recordings.
    const bounds = [0, introSec, ...steps.map((step) => at(step.startedAt)), end].map((t) => Math.round(t * FPS));
    const stills = [intro, frames[0], ...frames]
      .map((file, i) => ({ file, frames: bounds[i + 1] - bounds[i] }))
      .filter((segment) => segment.frames > 0);

    const inputs: string[] = [];
    const graph: string[] = [];
    stills.forEach((segment, i) => {
      inputs.push("-loop", "1", "-framerate", String(FPS), "-t", ((segment.frames + 2) / FPS).toFixed(3), "-i", segment.file);
      graph.push(`[${i}:v]trim=end_frame=${segment.frames},setpts=PTS-STARTPTS,format=yuv420p[s${i}]`);
    });
    graph.push(`${stills.map((_, i) => `[s${i}]`).join("")}concat=n=${stills.length}:v=1:a=0[bg]`);
    let last = "bg";
    actors.forEach((actor, i) => {
      const rect = layout.screens[i];
      inputs.push("-i", actor.video);
      graph.push(`[${stills.length + i}:v]fps=${FPS},scale=${rect.w}:${rect.h}:flags=lanczos,setpts=PTS-STARTPTS+${at(actor.startedAt).toFixed(3)}/TB[a${i}]`);
      graph.push(`[${last}][a${i}]overlay=x=${rect.x}:y=${rect.y}:eof_action=repeat[v${i}]`);
      last = `v${i}`;
    });
    // The recordings run on a moment past the last step (their screens close afterwards): stop with the stills.
    const dropped = cuts.map(([from, to]) => `gte(t,${from.toFixed(3)})*lt(t,${to.toFixed(3)})`).join("+");
    graph.push(`[${last}]trim=end_frame=${bounds.at(-1)},select='not(${dropped || 0})',setpts=N/(${FPS}*TB)[out]`);
    const sound: string[] = [];
    if (spoken.length > 0) {
      spoken.forEach((clip, i) => {
        inputs.push("-i", clip.file);
        graph.push(`[${stills.length + actors.length + i}:a]aresample=44100,adelay=${Math.round(clip.atSec * 1000)}:all=1[n${i}]`);
      });
      graph.push(`${spoken.map((_, i) => `[n${i}]`).join("")}amix=inputs=${spoken.length}:normalize=0:dropout_transition=0,apad[sound]`);
      // The padded track has no end of its own: stop with the picture.
      sound.push("-map", "[sound]", "-c:a", "aac", "-b:a", "160k", "-t", manifest.durationSec.toFixed(3));
    }
    const video = join(outDir, manifest.video);
    await ffmpeg([...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", ...sound, "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video]);
    // The preview: just before the third step, when the screens have something on them.
    const posterAt = (manifest.steps[2]?.atSec ?? manifest.durationSec) - 0.2;
    await ffmpeg(["-ss", posterAt.toFixed(2), "-i", video, "-frames:v", "1", "-q:v", "3", join(outDir, manifest.poster)]);

    const stepsPage = join(outDir, "steps.html");
    writeFileSync(stepsPage, pdfHtml(kit, manifest));
    await page.goto(pathToFileURL(stepsPage).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.pdf({ path: join(outDir, manifest.pdf), format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }

  writeFileSync(join(outDir, "flow.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
