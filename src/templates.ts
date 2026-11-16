/** The HTML behind a walkthrough's video frames, its PDF and the index page. Rendered by Chromium (compose.ts). */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { FontFile, Resolved } from "./settings.js";

/** Canvas of the composed video. */
export const W = 1920;
export const H = 1080;
/** Heights of the top bar, the caption strip and a screen's label, and the frame drawn around each screen. */
export const TOP = 44;
export const CAPTION = 124;
export const LABEL = 30;
export const BEZEL = 6;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where each actor's video sits on the canvas, and the steps panel when there is room beside them. */
export interface Layout {
  screens: Rect[];
  panel: Rect | null;
}

/** What `flow.json` holds: everything the index page needs about a finished walkthrough. */
export interface FlowManifest {
  id: string;
  title: string;
  role: string;
  summary: string;
  targetLabel: string;
  generatedAt: string;
  commit: string;
  durationSec: number;
  video: string;
  pdf: string;
  poster: string;
  actors: { slug: string; label: string; device: string; width: number; height: number }[];
  steps: { n: number; caption: string; note: string | null; atSec: number; shown: string[]; shots: { actor: string; file: string }[] }[];
}

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// The brand's own faces, inlined so a page needs no file or network access.
const FONT_FORMAT: Record<string, string> = { ".woff2": "woff2", ".woff": "woff", ".ttf": "truetype", ".otf": "opentype" };
const fontCss = new WeakMap<Resolved, string>();
const fonts = (kit: Resolved) => {
  let css = fontCss.get(kit);
  if (css === undefined) {
    const face = (family: string, font: FontFile) => {
      const format = FONT_FORMAT[extname(font.file).toLowerCase()];
      if (!format) throw new Error(`walkthrough-kit: ${font.file} is not a .woff2, .woff, .ttf or .otf font`);
      const data = readFileSync(font.file).toString("base64");
      return `@font-face{font-family:"${family}";${font.weight ? `font-weight:${font.weight};` : ""}font-display:block;src:url(data:font/${format};base64,${data}) format("${format}")}`;
    };
    css = kit.brand.fonts ? face("WalkHeading", kit.brand.fonts.heading) + face("WalkBody", kit.brand.fonts.body) : "";
    fontCss.set(kit, css);
  }
  return css;
};

const darkVars = ({ bg, fg, card, muted, dim, line, accent }: Resolved["brand"]["palette"]) =>
  `--bg:${bg};--fg:${fg};--card:${card};--muted:${muted};--dim:${dim};--line:${line};--accent:${accent}`;

function wordmark({ wordmark, wordmarkAccent }: Resolved["brand"]) {
  if (!wordmarkAccent || !wordmark.endsWith(wordmarkAccent)) return esc(wordmark);
  return `${esc(wordmark.slice(0, -wordmarkAccent.length))}<b>${esc(wordmarkAccent)}</b>`;
}

/** The line above a flow's title: "Customer walkthrough". */
function kicker(kit: Resolved, role: string) {
  return esc(kit.roles.find((r) => r.name === role)?.kicker ?? `${role} walkthrough`);
}

const when = (kit: Resolved, iso: string) =>
  new Intl.DateTimeFormat(kit.locale, { timeZone: kit.timezoneId, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const frameCss = (kit: Resolved) => `${fonts(kit)}
:root{${darkVars(kit.brand.palette)}}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;background:var(--bg);color:var(--fg);font-family:WalkBody,sans-serif;overflow:hidden;position:relative}
.top{position:absolute;inset:0 0 auto 0;height:${TOP}px;display:flex;align-items:center;gap:14px;padding:0 28px;border-bottom:1px solid var(--line);font-size:17px;color:var(--dim)}
.mark{font-family:WalkHeading,sans-serif;font-weight:700;font-size:21px;color:var(--fg)}
.mark b{color:var(--accent);font-weight:700}
.top .title{color:var(--fg);font-weight:600}
.top .right{margin-left:auto}
.label{position:absolute;height:${LABEL}px;display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;color:var(--dim);white-space:nowrap}
.label i{width:9px;height:9px;border-radius:50%;background:var(--line)}
.label.on{color:var(--fg)}
.label.on i{background:var(--accent)}
.label small{font-weight:400;font-size:14px;color:var(--dim)}
.bezel{position:absolute;border-radius:14px;background:#000;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--line);font-size:15px}
.bezel.on{border-color:var(--accent)}
.panel{position:absolute;padding:18px 22px;border-radius:14px;background:var(--card);border:1px solid var(--line);overflow:hidden}
.panel h2{font-family:WalkHeading,sans-serif;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:600;margin-bottom:12px}
.panel li{list-style:none;display:flex;gap:12px;padding:9px 0;font-size:18px;line-height:1.3;color:var(--dim)}
.panel li span{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600}
.panel li.done{opacity:.55}
.panel li.done span{background:var(--muted)}
.panel li.on{color:var(--fg);font-weight:600}
.panel li.on span{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.panel .more{font-size:14px;color:var(--dim);padding:6px 0 0 40px}
.caption{position:absolute;inset:auto 0 0 0;height:${CAPTION}px;display:flex;align-items:center;gap:22px;padding:0 44px;background:var(--card);border-top:1px solid var(--line)}
.caption .n{flex:none;width:58px;height:58px;border-radius:50%;background:var(--accent);color:var(--bg);font-family:WalkHeading,sans-serif;font-weight:700;font-size:28px;display:flex;align-items:center;justify-content:center}
.caption h1{font-family:WalkHeading,sans-serif;font-weight:600;font-size:33px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.caption p{font-size:20px;color:var(--dim);margin-top:5px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.caption.noted h1{-webkit-line-clamp:1}
.intro{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 170px;gap:22px}
.intro .mark{font-size:40px}
.intro .role{font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600}
.intro h1{font-family:WalkHeading,sans-serif;font-weight:700;font-size:78px;line-height:1.05;max-width:1400px}
.intro p{font-size:30px;line-height:1.35;color:var(--dim);max-width:1300px}
.intro .meta{font-size:21px;margin-top:18px}`;

const PANEL_ROWS = 11;

/** One still of the video: the bars, each screen's label and frame (the recordings are laid over them), and step `index`'s caption. */
export function frameHtml(kit: Resolved, flow: FlowManifest, layout: Layout, index: number): string {
  const step = flow.steps[index];
  const screens = flow.actors.map((actor, i) => {
    const rect = layout.screens[i];
    const on = step.shown.includes(actor.slug) ? " on" : "";
    return `<div class="label${on}" style="left:${rect.x}px;top:${rect.y - BEZEL - LABEL}px"><i></i>${esc(actor.label)} <small>${esc(actor.device)}</small></div>
<div class="bezel${on}" style="left:${rect.x - BEZEL}px;top:${rect.y - BEZEL}px;width:${rect.w + 2 * BEZEL}px;height:${rect.h + 2 * BEZEL}px">${esc(actor.label)}</div>`;
  }).join("\n");

  let panel = "";
  if (layout.panel) {
    const first = Math.max(0, Math.min(index - Math.floor(PANEL_ROWS / 2), flow.steps.length - PANEL_ROWS));
    const rows = flow.steps.slice(first, first + PANEL_ROWS).map((s) =>
      `<li class="${s.n - 1 < index ? "done" : s.n - 1 === index ? "on" : ""}"><span>${s.n}</span>${esc(s.caption)}</li>`).join("");
    const left = flow.steps.length - first - PANEL_ROWS;
    panel = `<div class="panel" style="left:${layout.panel.x}px;top:${layout.panel.y}px;width:${layout.panel.w}px;height:${layout.panel.h}px">
<h2>Steps</h2><ol>${rows}</ol>${left > 0 ? `<div class="more">+ ${left} more</div>` : ""}</div>`;
  }

  return `<!doctype html><meta charset="utf-8"><style>${frameCss(kit)}</style>
<div class="top"><span class="mark">${wordmark(kit.brand)}</span><span>walkthrough</span><span>·</span><span class="title">${esc(flow.title)}</span>
<span class="right">Step ${step.n} of ${flow.steps.length} · ${esc(flow.targetLabel)}</span></div>
${screens}
${panel}
<div class="caption${step.note ? " noted" : ""}"><div class="n">${step.n}</div><div><h1>${esc(step.caption)}</h1>${step.note ? `<p>${esc(step.note)}</p>` : ""}</div></div>`;
}

/** The title card the video opens on. */
export function introHtml(kit: Resolved, flow: FlowManifest): string {
  const who = flow.actors.map((actor) => `${actor.label} (${actor.device})`).join(" · ");
  return `<!doctype html><meta charset="utf-8"><style>${frameCss(kit)}</style>
<div class="intro"><span class="mark">${wordmark(kit.brand)}</span><div class="role">${kicker(kit, flow.role)}</div><h1>${esc(flow.title)}</h1><p>${esc(flow.summary)}</p>
<p class="meta">${esc(who)}<br>${esc(flow.targetLabel)}</p></div>`;
}

/** The printable walkthrough: every step's caption with its screenshot(s). Image paths are relative to the flow's folder. */
export function pdfHtml(kit: Resolved, flow: FlowManifest): string {
  const actor = (slug: string) => flow.actors.find((a) => a.slug === slug)!;
  const date = when(kit, flow.generatedAt);
  const steps = flow.steps.map((step) => {
    const shots = step.shots.map((shot) => ({ ...shot, who: actor(shot.actor) }));
    // A lone phone screen sits three to a row; anything wider, or several screens, takes the full width.
    const narrow = shots.length === 1 && shots[0].who.width < shots[0].who.height;
    const aspect = shots.reduce((sum, shot) => sum + shot.who.width / shot.who.height, 0);
    const figures = shots.map((shot) =>
      `<figure style="flex:${(100 * shot.who.width / shot.who.height).toFixed(2)} 1 0%"><img src="${esc(shot.file)}" alt="">${shots.length > 1 || !narrow ? `<figcaption>${esc(shot.who.label)} · ${esc(shot.who.device)}</figcaption>` : ""}</figure>`).join("");
    return `<section class="step ${narrow ? "narrow" : "wide"}"><div class="shots" style="max-width:calc(${narrow ? 88 : 104}mm * ${aspect.toFixed(4)})">${figures}</div>
<h2><span>${step.n}</span>${esc(step.caption)}</h2>${step.note ? `<p>${esc(step.note)}</p>` : ""}</section>`;
  }).join("\n");

  return `<!doctype html><html lang="${esc(kit.locale)}"><meta charset="utf-8"><title>${esc(flow.title)} · ${esc(kit.brand.name)} walkthrough</title><style>${fonts(kit)}
@page{size:A4;margin:10mm 12mm}
*{box-sizing:border-box;margin:0}
body{font-family:WalkBody,sans-serif;color:#1c1917;font-size:9.5pt;line-height:1.35}
header{padding-bottom:5mm;margin-bottom:5mm;border-bottom:.4mm solid #1c1917}
.mark{font-family:WalkHeading,sans-serif;font-weight:700;font-size:13pt}
.mark b{color:${kit.brand.palette.printAccent}}
.role{font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:${kit.brand.palette.printAccent};font-weight:600;margin-top:3mm}
h1{font-family:WalkHeading,sans-serif;font-size:22pt;line-height:1.1;margin:1mm 0 2mm}
header p{font-size:10.5pt;color:#44403c;max-width:160mm}
header .meta{font-size:8pt;color:#78716c;margin-top:2mm}
main{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm 5mm}
.step{break-inside:avoid}
.step.wide{grid-column:1/-1}
.shots{display:flex;gap:4mm;align-items:flex-start}
figure{min-width:0}
img{display:block;width:100%;height:auto;border-radius:2mm;border:.2mm solid #d6d3d1}
figcaption{font-size:7.5pt;color:#78716c;margin-top:1mm}
h2{font-family:WalkBody,sans-serif;font-size:10pt;font-weight:600;line-height:1.25;margin-top:2.5mm;display:flex;gap:2mm}
h2 span{flex:none;width:5.2mm;height:5.2mm;border-radius:50%;background:#1c1917;color:#fff;font-size:8pt;display:flex;align-items:center;justify-content:center}
.step p{font-size:8.5pt;color:#57534e;margin:1mm 0 0 7.2mm}
</style><body>
<header><div class="mark">${wordmark(kit.brand)}</div><div class="role">${kicker(kit, flow.role)}</div><h1>${esc(flow.title)}</h1><p>${esc(flow.summary)}</p>
<p class="meta">${esc(flow.actors.map((a) => `${a.label} (${a.device})`).join(" · "))} · ${esc(flow.targetLabel)}<br>${flow.steps.length} steps · video ${clock(flow.durationSec)} (${esc(flow.video)}) · recorded ${esc(date)} · build ${esc(flow.commit)}</p></header>
<main>
${steps}
</main></body></html>`;
}

/** `index.html` beside the flow folders: every walkthrough's video, PDF and steps (a step's time seeks the video). */
export function indexHtml(kit: Resolved, flows: FlowManifest[]): string {
  const card = (flow: FlowManifest) => `<article id="${esc(flow.id)}">
<video controls preload="none" poster="${esc(`${flow.id}/${flow.poster}`)}" src="${esc(`${flow.id}/${flow.video}`)}"></video>
<div class="about"><h3>${esc(flow.title)}</h3><p>${esc(flow.summary)}</p>
<p class="meta">${clock(flow.durationSec)} · ${flow.steps.length} steps · ${esc(flow.actors.map((a) => `${a.label} (${a.device})`).join(", "))}<br>${esc(flow.targetLabel)}</p>
<p class="links"><a href="${esc(`${flow.id}/${flow.video}`)}">Video (MP4)</a><a href="${esc(`${flow.id}/${flow.pdf}`)}">Steps (PDF)</a><a href="${esc(`${flow.id}/steps.html`)}">Steps (web page)</a></p>
<ol>${flow.steps.map((step) => `<li><button type="button" data-t="${step.atSec.toFixed(2)}">${clock(step.atSec)}</button>${esc(step.caption)}</li>`).join("")}</ol></div></article>`;
  // The settings' roles in their order, then any role only an older recording still names.
  const known = kit.roles.map((role) => role.name);
  const roles = [...kit.roles, ...[...new Set(flows.map((flow) => flow.role))].filter((role) => !known.includes(role)).map((name) => ({ name, heading: name }))];
  const groups = roles.map((role) => {
    const list = flows.filter((flow) => flow.role === role.name).sort((a, b) => a.id.localeCompare(b.id));
    return list.length ? `<section><h2>${esc(role.heading)}</h2>${list.map(card).join("\n")}</section>` : "";
  }).join("\n");
  const newest = flows.map((flow) => flow.generatedAt).sort().at(-1);
  const date = newest ? when(kit, newest) : "";

  return `<!doctype html><html lang="${esc(kit.locale)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(kit.brand.name)} walkthroughs</title><style>${fonts(kit)}
:root{${darkVars(kit.brand.palette)}}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font-family:WalkBody,sans-serif;font-size:16px;line-height:1.45;padding:32px clamp(16px,4vw,56px) 80px}
header{margin-bottom:36px}
.mark{font-family:WalkHeading,sans-serif;font-weight:700;font-size:26px}
.mark b{color:var(--accent)}
h1{font-family:WalkHeading,sans-serif;font-size:40px;line-height:1.1;margin:6px 0 8px}
header p{color:var(--dim);max-width:760px}
h2{font-family:WalkHeading,sans-serif;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:44px 0 16px}
article{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:24px;padding:20px;margin-bottom:20px;background:var(--card);border:1px solid var(--line);border-radius:16px}
@media(max-width:1000px){article{grid-template-columns:1fr}}
video{width:100%;aspect-ratio:16/9;border-radius:10px;background:#000;align-self:start}
h3{font-family:WalkHeading,sans-serif;font-size:24px;line-height:1.15;margin-bottom:6px}
.about p{color:var(--dim)}
.meta{font-size:14px;margin-top:8px}
.links{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.links a{color:var(--bg);background:var(--accent);padding:6px 14px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none}
.links a+a{background:none;color:var(--fg);border:1px solid var(--line)}
ol{list-style:none;max-height:340px;overflow:auto;border-top:1px solid var(--line);padding-top:8px}
li{display:flex;gap:10px;padding:5px 0;font-size:15px}
button{flex:none;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;color:var(--accent);background:var(--muted);border:0;border-radius:6px;padding:1px 8px;cursor:pointer;align-self:flex-start}
</style><body>
<header><div class="mark">${wordmark(kit.brand)}</div><h1>Walkthroughs</h1>
<p>Each flow recorded at watching speed with a caption per step. Tap a step's time to jump to it in the video. ${flows.length === 1 ? "1 flow" : `${flows.length} flows`}${date ? `, last recorded ${esc(date)}` : ""}.${kit.regenerate ? ` Regenerate with <code>${esc(kit.regenerate)}</code>.` : ""}</p></header>
${groups}
<script>
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-t]");
  if (!button) return;
  const video = button.closest("article").querySelector("video");
  video.currentTime = Number(button.dataset.t);
  video.play();
});
</script></body></html>`;
}
