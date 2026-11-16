/**
 * Walkthrough recordings: each flow is driven at watching speed by one or more "actors"
 * (a customer's phone, a staff tablet, an admin's laptop), every actor's screen is recorded,
 * and each captioned step ends with a screenshot. compose.ts turns that into one MP4 (the
 * screens side by side with the caption underneath) and a PDF of the steps.
 *
 *   export const { walkthrough, writeIndex } = defineWalkthroughs({ … });
 *
 *   walkthrough({ id: "customer-order", title: "…", role: "Customer", summary: "…" }, async (walk) => {
 *     const customer = await walk.actor("Customer", "iphone-15");
 *     await walk.step("Scan the sign: tonight's market opens", async () => {
 *       await customer.goto("/?event=42");
 *     });
 *     await walk.step("Pick a truck", async () => {
 *       await customer.tap(customer.page.getByRole("link", { name: "Taco Tempo" }));
 *     });
 *   });
 *
 * Nothing is asserted beyond what a flow needs to know the screen is ready. A flow that
 * can't reach a screen fails the run.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, test, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { compose } from "./compose.js";
import type { Device } from "./devices.js";
import { writeIndex } from "./index-page.js";
import { resolveSettings, type Resolved, type Settings } from "./settings.js";

export interface FlowSpec<Role extends string = string> {
  /** Folder and file name of the output: lower-case words joined by hyphens. */
  id: string;
  title: string;
  /** Who the flow is about, one of the settings' roles; the index page groups by it. */
  role: Role;
  /** One or two sentences for the title card, the PDF and the index. */
  summary: string;
}

export interface StepOptions {
  /** A second, smaller line under the caption. */
  note?: string;
  /** Whose screens the step's screenshot shows. Default: the actors driven during the step. */
  show?: Actor[];
  /** How long the result stays on screen before the next step, ms. */
  hold?: number;
}

export interface StepRecord {
  caption: string;
  note: string | null;
  /** Wall-clock ms when the caption went up. */
  startedAt: number;
  /** Slugs of the actors the step is about. */
  shown: string[];
  shots: { actor: string; file: string }[];
}

export interface ActorRecord {
  label: string;
  slug: string;
  device: Pick<Device, "id" | "label" | "viewport">;
  /** Wall-clock ms when the recording started. */
  startedAt: number;
  video: string;
}

export interface FlowRun {
  spec: FlowSpec;
  actors: ActorRecord[];
  steps: StepRecord[];
  /** Wall-clock ranges left out of the video (set-up before the first step, `offCamera`). */
  cuts: [number, number][];
  endedAt: number;
  workDir: string;
  outDir: string;
}

// Watching speed: time to read the caption, see where the finger goes, and take in the result.
const STEP_LEAD = 900;
const STEP_HOLD = 1500;
const BEFORE_TAP = 350;
const AFTER_TAP = 550;
const KEY_DELAY = 55;

const tapMark = (accent: string) => {
  const rgb = [1, 3, 5].map((at) => parseInt(accent.slice(at, at + 2), 16)).join(",");
  return `width:44px;height:44px;border-radius:50%;background:rgba(${rgb},.35);border:2px solid rgba(${rgb},.95)`;
};

const slugOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** One recorded screen. `page` is the Playwright page, for locators and for waiting on what the app shows. */
export class Actor {
  readonly slug: string;
  startedAt = 0;
  /** Driven during the current step (decides whose screenshot the step gets). */
  touched = false;

  constructor(
    readonly label: string,
    readonly device: Device,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {
    this.slug = slugOf(label);
  }

  /** Marks this screen as part of the current step without driving it (something changes on it live). */
  watch() {
    this.touched = true;
  }

  async goto(path: string) {
    this.touched = true;
    await this.page.goto(path);
  }

  /** Taps (or clicks) at watching speed: scrolls the target into view smoothly, then a visible tap. */
  async tap(target: Locator) {
    this.touched = true;
    await this.scrollTo(target);
    await sleep(BEFORE_TAP);
    await target.click();
    await sleep(AFTER_TAP);
  }

  /** Types into a field key by key. Replaces what the field held. */
  async type(target: Locator, text: string) {
    this.touched = true;
    await this.scrollTo(target);
    await target.click();
    await target.fill("");
    await target.pressSequentially(text, { delay: KEY_DELAY });
    await sleep(AFTER_TAP);
  }

  /** Brings an element into view the way a thumb would: a smooth scroll, only when it's off screen. */
  async scrollTo(target: Locator) {
    this.touched = true;
    const scrolled = await target.first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      if (box.top >= 72 && box.bottom <= window.innerHeight - 96) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    });
    if (scrolled) await sleep(700);
  }

  /** Time for the viewer to read what's on this screen. */
  async pause(ms: number) {
    this.touched = true;
    await sleep(ms);
  }
}

export class Walk {
  readonly baseURL: string;
  private readonly actors: Actor[] = [];
  private readonly steps: StepRecord[] = [];
  private readonly cuts: [number, number][] = [];
  private readonly browsers = new Map<string, Browser>();
  private readonly workDir: string;
  private inStep = false;

  constructor(
    private readonly kit: Resolved,
    readonly spec: FlowSpec,
  ) {
    this.baseURL = kit.baseURL;
    this.workDir = join(kit.workDir, spec.id);
    rmSync(this.workDir, { recursive: true, force: true });
    mkdirSync(join(this.workDir, "steps"), { recursive: true });
  }

  /**
   * Opens a recorded screen. `deviceId` is one of the settings' devices (`iphone-15`, `pixel-7`,
   * `tablet-landscape`, `desktop`, …). Open every actor before the first step so all screens are
   * in the video from the start; the set-up before the first step is cut.
   */
  async actor(label: string, deviceId: string): Promise<Actor> {
    if (this.actors.some((actor) => actor.slug === slugOf(label))) throw new Error(`${this.spec.id} already has an actor called ${label}`);
    const device = this.kit.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error(`${this.spec.id}: unknown device ${deviceId} (have ${this.kit.devices.map((d) => d.id).join(", ")})`);
    const browser = await this.browser(device.browserName);
    const context = await browser.newContext({
      baseURL: this.baseURL,
      viewport: device.viewport,
      screen: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      userAgent: device.userAgent,
      colorScheme: this.kit.colorScheme,
      locale: this.kit.locale,
      timezoneId: this.kit.timezoneId,
      ...this.kit.contextOptions?.(device),
      // Recorded at the viewport's CSS size: WebKit pads rather than scales anything larger.
      recordVideo: { dir: join(this.workDir, "video"), size: device.viewport },
    });
    await this.kit.prepareContext?.(context, device);
    const page = await context.newPage();
    const actor = new Actor(label, device, context, page);
    actor.startedAt = Date.now();
    await page.screencast.showActions({
      cursor: device.hasTouch ? "none" : "pointer",
      duration: 700,
      style: { point: tapMark(this.kit.brand.palette.accent), title: "display:none" },
    });
    this.actors.push(actor);
    return actor;
  }

  /** One captioned step. The caption goes up, `body` plays, the result holds, then the step's screenshot is taken. */
  async step(caption: string, body: () => Promise<void>): Promise<void>;
  async step(caption: string, options: StepOptions, body: () => Promise<void>): Promise<void>;
  async step(caption: string, optionsOrBody: StepOptions | (() => Promise<void>), maybeBody?: () => Promise<void>) {
    const options = typeof optionsOrBody === "function" ? {} : optionsOrBody;
    const body = typeof optionsOrBody === "function" ? optionsOrBody : maybeBody!;
    if (this.inStep) throw new Error(`${this.spec.id}: step "${caption}" starts inside another step`);
    if (this.actors.length === 0) throw new Error(`${this.spec.id}: open an actor before the first step`);
    this.inStep = true;
    for (const actor of this.actors) actor.touched = false;
    const record: StepRecord = { caption, note: options.note ?? null, startedAt: Date.now(), shown: [], shots: [] };
    this.steps.push(record);
    try {
      await test.step(caption, async () => {
        await sleep(STEP_LEAD);
        await body();
        await sleep(options.hold ?? STEP_HOLD);
        const driven = this.actors.filter((actor) => actor.touched);
        const shown = options.show ?? (driven.length > 0 ? driven : this.actors);
        const number = String(this.steps.length).padStart(2, "0");
        for (const actor of shown) {
          const file = join("steps", `${number}-${actor.slug}.jpg`);
          await actor.page.screenshot({ path: join(this.workDir, file), type: "jpeg", quality: 85, caret: "hide" });
          record.shown.push(actor.slug);
          record.shots.push({ actor: actor.slug, file });
        }
      });
    } finally {
      this.inStep = false;
    }
  }

  /** Runs `body` with the recording's time left out of the video (set-up a viewer shouldn't sit through). */
  async offCamera<T>(body: () => Promise<T>): Promise<T> {
    if (this.inStep) throw new Error(`${this.spec.id}: offCamera inside a step`);
    const from = Date.now();
    try {
      return await body();
    } finally {
      // Only between steps: before the first one everything is cut anyway.
      if (this.steps.length > 0) this.cuts.push([from, Date.now()]);
    }
  }

  private async browser(name: "chromium" | "webkit"): Promise<Browser> {
    let browser = this.browsers.get(name);
    if (!browser) {
      browser = await (name === "webkit" ? webkit : chromium).launch({ headless: this.kit.headless });
      this.browsers.set(name, browser);
    }
    return browser;
  }

  /** Closes the screens (which finishes their videos) and hands the recording to the composer. */
  async finish(): Promise<FlowRun> {
    if (this.steps.length === 0) throw new Error(`${this.spec.id} recorded no steps`);
    const endedAt = Date.now();
    const first = this.steps[0].startedAt;
    const started = Math.min(...this.actors.map((actor) => actor.startedAt));
    const records: ActorRecord[] = [];
    for (const actor of this.actors) {
      await actor.context.close();
      const video = await actor.page.video()?.path();
      if (!video) throw new Error(`${this.spec.id}: no video for ${actor.label}`);
      records.push({ label: actor.label, slug: actor.slug, device: { id: actor.device.id, label: actor.device.label, viewport: actor.device.viewport }, startedAt: actor.startedAt, video });
    }
    return {
      spec: this.spec,
      actors: records,
      steps: this.steps,
      cuts: [[started, first], ...this.cuts],
      endedAt,
      workDir: this.workDir,
      outDir: join(this.kit.outDir, this.spec.id),
    };
  }

  async dispose() {
    for (const actor of this.actors) await actor.context.close().catch(() => undefined);
    for (const browser of this.browsers.values()) await browser.close().catch(() => undefined);
  }
}

export interface Walkthroughs<Role extends string> {
  /** Registers a flow: one Playwright test that records it and writes `<outDir>/<id>/<id>.mp4`, `.pdf` and `flow.json`. */
  walkthrough: (spec: FlowSpec<Role>, body: (walk: Walk) => Promise<void>) => void;
  /** Rebuilds `<outDir>/index.html` from every finished flow. Export it as the Playwright config's `globalTeardown`. */
  writeIndex: () => void;
}

/** Binds the kit to one project. Call it once, in the module the flows import `walkthrough` from. */
export function defineWalkthroughs<const Role extends string>(settings: Settings<Role>): Walkthroughs<Role> {
  const kit = resolveSettings(settings);
  return {
    walkthrough(spec, body) {
      // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures argument.
      test(`${spec.id}: ${spec.title}`, async ({}) => {
        await kit.beforeFlow?.();
        const walk = new Walk(kit, spec);
        try {
          await body(walk);
          const run = await walk.finish();
          await test.step("Compose the video and the PDF", () => compose(kit, run));
        } finally {
          await walk.dispose();
        }
      });
    },
    writeIndex: () => writeIndex(kit),
  };
}
