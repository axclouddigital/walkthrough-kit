# walkthrough-kit

Records a web app's main flows with Playwright at watching speed. Each flow becomes one 1920×1080 MP4 (the screens side by side, a caption per step, set-up cut out), one PDF (a captioned screenshot per step) and an entry on an index page.

Extracted from Truckbites (`e2e/walkthrough/`), which is the reference project.

## Needs

- `@playwright/test` 1.59 or later in the project (the tap marks use `page.screencast`), with Chromium installed (it renders the frames and the PDF) plus whichever browsers the devices use.
- `ffmpeg` with libx264 on the PATH (`brew install ffmpeg`).
- The project is a git checkout: each output names the commit it was recorded from.

## Install

```bash
npm install -D "github:axclouddigital/walkthrough-kit#v0.1.0"
```

The repository is private: the machine needs GitHub access to it (npm fetches it over SSH), and a CI job that runs `npm ci` needs a token or deploy key. The package builds itself on install (`prepare`). With pnpm 10, allow that build: add `walkthrough-kit` to `pnpm.onlyBuiltDependencies`.

## What the project supplies

1. A clean local server with realistic seed data, on its own port.
2. A reset between flows (`beforeFlow`): flows share one database.
3. Stand-ins for anything external, such as payments, email and SMS (`prepareContext` for the browser side).
4. Brand settings: name, colours, fonts.
5. The flows.

## Set-up

`e2e/walkthrough/harness.ts`, the one module the flows import from:

```ts
import { defineWalkthroughs } from "walkthrough-kit";

export const { walkthrough, writeIndex } = defineWalkthroughs({
  root: import.meta.dirname + "/../..",
  outDir: "walkthroughs",                      // git-ignore it
  workDir: "test-results/walkthrough",
  baseURL: "http://localhost:3210",
  targetLabel: "Local test build · seeded demo data",
  locale: "en-AU",
  timezoneId: "Australia/Perth",
  regenerate: "npm run walkthrough",
  brand: {
    name: "Truckbites",
    wordmark: "truckbites",
    wordmarkAccent: "bites",
    fonts: {
      heading: { file: "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", weight: "200 900" },
      body: { file: "node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", weight: "200 900" },
    },
    palette: { bg: "#141110", accent: "#ffb547", printAccent: "#c2410c" },
  },
  roles: [
    { name: "Customer", heading: "As a customer" },
    { name: "Vendor", heading: "As a vendor" },
  ],
  prepareContext: async (context) => { /* route stubs, init scripts */ },
  beforeFlow: async () => { /* reset the shared data */ },
});
export { expect, type Actor, type Walk } from "walkthrough-kit";
```

`e2e/walkthrough/global-teardown.ts`:

```ts
export { writeIndex as default } from "./harness";
```

`playwright.walkthrough.config.ts`: `testMatch: "**/*.walk.ts"`, `workers: 1`, `fullyParallel: false`, `retries: 0`, a long `timeout`, `trace`/`screenshot`/`video` off (the kit records each screen itself), `globalTeardown` pointing at the file above, and a `webServer` with `reuseExistingServer: false`.

Other settings: `colorScheme` (default dark), `headless` (default true), `devices` (default `DEVICES`: `iphone-se`, `iphone-15`, `pixel-7`, `tablet-landscape`, `tablet-portrait`, `ipad-landscape`, `desktop`) and `contextOptions(device)` for extra browser-context options such as permissions. `src/settings.ts` documents each one.

## Writing a flow

One file per flow, `e2e/walkthrough/flows/<id>.walk.ts`:

```ts
import { expect, walkthrough } from "../harness";

walkthrough({ id: "customer-order", title: "Order from one truck", role: "Customer", summary: "…" }, async (walk) => {
  const customer = await walk.actor("Customer", "iphone-15");
  await walk.step("Scan the sign: tonight's trucks open", { note: "No app to install." }, async () => {
    await customer.goto("/?event=42");
    await expect(customer.page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
```

- An actor is one recorded screen. Open every actor before the first step; whatever happens before the first step is cut from the video. `walk.offCamera(…)` cuts set-up between steps.
- Drive the screen with `actor.tap`, `actor.type`, `actor.scrollTo`, `actor.goto` and `actor.pause`: they move at watching speed and show where the tap lands. `actor.page` is the Playwright page, for locators and for waiting; a bare `page.click` is too fast to follow.
- A step is one caption: what the person does or sees, in plain words (clamped to two lines, one with a `note`). After its body the result holds for a moment, then the step's screenshot is taken of the actors it drove. `show: [a, b]` or `actor.watch()` names a screen that changes on its own.
- Wait on what the app shows, never with sleeps; `actor.pause` is only reading time.
- A recording is the viewport at CSS size (WebKit pads rather than scales anything larger), shown 1:1 where the screens fit side by side.
- Keep one tab per actor: a link that opens a new tab isn't in that actor's video.
- Nothing else may use the run's server while it records. Give a run its own port.
- After recording, look at frames of the video and pages of the PDF; that is where caption and scrolling problems show.

## Voiceover

Off unless the settings carry `voiceover`, so the project switches it with an env variable:

```ts
voiceover: process.env.WALK_VOICE === "1"
  ? { apiKey: process.env.ELEVENLABS_API_KEY ?? "", voiceId: "IKne3meq5aSn9XLyUdCD" }
  : undefined,
```

- ElevenLabs speaks the flow's title over the title card and each step's caption as it goes up. `say: "…"` in a step's options gives the voice a different line from the caption; `say: false` keeps that step silent.
- A step lasts at least as long as its line, so a narrated video runs longer than the silent one. The title card also stays up until the title has been said.
- Clips are kept in `node_modules/.cache/walkthrough-kit/voice` (`cacheDir` moves it), named by voice, model and text: a re-recording only pays for lines that changed. `npm ci` empties that folder.
- A run replaces the flow's MP4 either way: the last run decides whether it has sound. The index page marks narrated flows.
- Other options: `modelId` (default `eleven_multilingual_v2`) and `voiceSettings` (ElevenLabs `voice_settings`).
- The key needs only the Text to Speech permission. `bin/with-voice-key <command>` runs a command with `WALK_VOICE=1` and the key from Daniel's Bitwarden, without a phone approval; a project's script calls it by absolute path: `"walkthrough:voice": "\"$HOME/Projects/walkthrough-kit/bin/with-voice-key\" npm run walkthrough:run --"`.

## Output

`<outDir>/index.html`, and per flow `<id>/<id>.mp4`, `<id>.pdf`, `steps.html`, `steps/*.jpg`, `poster.jpg` and `flow.json`. A run of some flows keeps the others listed.

## Releasing

Projects pin a tag. After a change: `npm version patch` (or `minor`), `git push --follow-tags`, then bump the tag in each project's `package.json` and reinstall.

Don't test a change through `npm link` or a `file:` dependency: the kit would load its own copy of `@playwright/test`, and Playwright rejects tests registered through a second copy. Use `npm pack` and install the tarball into the project instead.
