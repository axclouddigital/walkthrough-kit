/**
 * The spoken track (settings.voiceover): one ElevenLabs clip per step, saved under the cache
 * folder by what was said and how, so a re-recording only pays for the lines that changed.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Resolved } from "./settings.js";

const run = promisify(execFile);

/** Seconds between a step's caption going up and its line starting, and the pause after the line. */
export const VOICE_LEAD = 0.3;
export const VOICE_TAIL = 0.5;

export interface VoiceClip {
  file: string;
  seconds: number;
}

/** Speaks `text` in the settings' voice. Only call it when `kit.voiceover` is set. */
export async function narrate(kit: Resolved, text: string): Promise<VoiceClip> {
  const voice = kit.voiceover!;
  const request = { text, model_id: voice.modelId, ...(voice.voiceSettings ? { voice_settings: voice.voiceSettings } : {}) };
  const key = createHash("sha256").update(JSON.stringify([voice.voiceId, request])).digest("hex").slice(0, 24);
  const file = join(voice.cacheDir, `${key}.mp3`);
  if (!existsSync(file)) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`ElevenLabs returned ${response.status} for "${text.slice(0, 60)}": ${(await response.text()).slice(0, 300)}`);
    mkdirSync(voice.cacheDir, { recursive: true });
    // Written beside it first, so a run that dies mid-download leaves no half clip in the cache.
    writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()));
    renameSync(`${file}.part`, file);
  }
  let probed: string;
  try {
    probed = (await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("ffprobe isn't on the PATH: the voiceover needs it (brew install ffmpeg).");
    throw error;
  }
  const seconds = Number(probed);
  if (!(seconds > 0)) throw new Error(`walkthrough-kit: ${file} is not a playable clip; delete it and record again`);
  return { file, seconds };
}
