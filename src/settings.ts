/** What a project tells the kit about itself (`defineWalkthroughs`), and the defaults filled in around it. */
import { resolve } from "node:path";
import type { BrowserContext, BrowserContextOptions } from "@playwright/test";
import { DEVICES, type Device } from "./devices.js";

/** A font file inlined into the video frames, the PDF and the index page, so they need no network. */
export interface FontFile {
  /** Path to a .woff2, .woff, .ttf or .otf file; relative paths are taken from `root`. */
  file: string;
  /** The `font-weight` range of a variable font, e.g. `"200 900"`. Leave out for a single-weight file. */
  weight?: string;
}

/** Colours of the video frame and the index page (dark), plus the accent used on the PDF's white page. Six-digit hex. */
export interface Palette {
  bg: string;
  fg: string;
  card: string;
  muted: string;
  dim: string;
  line: string;
  /** Step numbers, the active screen's frame, links and the tap mark. */
  accent: string;
  /** The accent on white paper; pick one dark enough to read. */
  printAccent: string;
}

export interface Brand {
  /** The product's name, as in page titles: "Truckbites". */
  name: string;
  /** The name as the logo writes it: "truckbites". */
  wordmark: string;
  /** The tail of the wordmark drawn in the accent colour: "bites". */
  wordmarkAccent?: string;
  /** Without them the pages fall back to the system sans-serif. */
  fonts?: { heading: FontFile; body: FontFile };
  palette?: Partial<Palette>;
}

export interface RoleSpec<Role extends string = string> {
  /** What a flow's `role` names. */
  name: Role;
  /** The index page's section heading: "As a customer". */
  heading: string;
  /** The line above a flow's title. Default: "<name> walkthrough". */
  kicker?: string;
}

export interface Settings<Role extends string = string> {
  /** The project's root: where `git` reads the build's commit, and what relative paths start from. */
  root: string;
  /** Finished videos, PDFs and the index page. */
  outDir: string;
  /** Raw recordings and rendered frames of the run in progress. */
  workDir: string;
  /** Where the app under recording is served. */
  baseURL: string;
  /** One line on every output saying what was recorded: "Local test build · seeded demo data". */
  targetLabel: string;
  brand: Brand;
  /** Who the flows are about, in the order the index page lists them. */
  roles: readonly RoleSpec<Role>[];
  locale: string;
  timezoneId: string;
  /** Default: dark. */
  colorScheme?: "light" | "dark";
  /** Default: true. */
  headless?: boolean;
  /** The screens `walk.actor(label, deviceId)` can open. Default: the kit's `DEVICES`. */
  devices?: readonly Device[];
  /** Extra options for an actor's browser context (permissions, geolocation, …). */
  contextOptions?: (device: Device) => BrowserContextOptions;
  /** Runs on each actor's context before its page opens: route stubs, init scripts. */
  prepareContext?: (context: BrowserContext, device: Device) => Promise<void>;
  /** Runs before each flow: put the shared data back to a known state. */
  beforeFlow?: () => Promise<void>;
  /** The command the index page says regenerates it: "npm run walkthrough". */
  regenerate?: string;
  /** A spoken track on the videos. Leave out for silent videos; the project decides when to pass it (an env switch). */
  voiceover?: Voiceover;
}

/**
 * The voice used when `voiceover.voiceId` is left out: "Paul - Australian Professional Presenter", from
 * ElevenLabs' voice library. Its owner can withdraw it, and then this needs a new id.
 */
export const DEFAULT_VOICE_ID = "WLKp2jV6nrS8aMkPPDRO";

/** ElevenLabs text to speech. Each step's caption is spoken unless the step sets `say`. */
export interface Voiceover {
  apiKey: string;
  /** The voice's id from the ElevenLabs voice library. Default: `DEFAULT_VOICE_ID` (Paul). */
  voiceId?: string;
  /** Default: `eleven_multilingual_v2`. */
  modelId?: string;
  /** ElevenLabs `voice_settings` (stability, similarity_boost, speed, …), sent as given. */
  voiceSettings?: Record<string, number | boolean>;
  /** Where clips are kept between runs. Default: `node_modules/.cache/walkthrough-kit/voice`. */
  cacheDir?: string;
}

export type Resolved = Required<Pick<Settings, "colorScheme" | "headless" | "devices">> &
  Omit<Settings, "colorScheme" | "headless" | "devices" | "brand" | "voiceover"> & {
    brand: Omit<Brand, "palette" | "fonts"> & { palette: Palette; fonts: { heading: FontFile; body: FontFile } | null };
    voiceover: (Voiceover & Required<Pick<Voiceover, "voiceId" | "modelId" | "cacheDir">>) | null;
  };

const DEFAULT_PALETTE: Palette = {
  bg: "#111113",
  fg: "#f4f4f5",
  card: "#1c1c1f",
  muted: "#27272a",
  dim: "#a1a1aa",
  line: "#3f3f46",
  accent: "#f59e0b",
  printAccent: "#b45309",
};

export function resolveSettings(settings: Settings): Resolved {
  const root = resolve(settings.root);
  const palette = { ...DEFAULT_PALETTE, ...settings.brand.palette };
  for (const [name, value] of Object.entries(palette)) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`walkthrough-kit: palette.${name} must be a six-digit hex colour, got "${value}"`);
  }
  if (settings.roles.length === 0) throw new Error("walkthrough-kit: settings.roles is empty");
  const voice = settings.voiceover;
  if (voice && !voice.apiKey) throw new Error("walkthrough-kit: settings.voiceover needs an apiKey");
  const fonts = settings.brand.fonts;
  return {
    ...settings,
    root,
    outDir: resolve(root, settings.outDir),
    workDir: resolve(root, settings.workDir),
    colorScheme: settings.colorScheme ?? "dark",
    headless: settings.headless ?? true,
    devices: settings.devices ?? DEVICES,
    brand: {
      ...settings.brand,
      palette,
      fonts: fonts
        ? { heading: { ...fonts.heading, file: resolve(root, fonts.heading.file) }, body: { ...fonts.body, file: resolve(root, fonts.body.file) } }
        : null,
    },
    voiceover: voice
      ? {
          ...voice,
          voiceId: voice.voiceId || DEFAULT_VOICE_ID,
          modelId: voice.modelId ?? "eleven_multilingual_v2",
          cacheDir: resolve(root, voice.cacheDir ?? "node_modules/.cache/walkthrough-kit/voice"),
        }
      : null,
  };
}
