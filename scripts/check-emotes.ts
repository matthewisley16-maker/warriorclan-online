// Emote/animation system verification (spec §10/§11/§12/§21):
//  1. Registry integrity: every EMOTE_DEFS id required by the spec exists
//     (incl. 4 distinct dances); poses are valid CatPose values; durs sane.
//  2. UI contract: ANIM_TABS emote ids all resolve in EMOTE_DEFS; every
//     button label is a plain ACTION NAME (ASCII — no emoji); the gameUi
//     source contains no pictographs; emoteIconFor() is null for everything.
//  3. drawCat smoke test: ALL CatPose values render without throwing across
//     fx overlays (yawn/alert/tailFlick/talking/wet/carry/head/hop), times,
//     phases, facings and skins (incl. the 4 dances' distinct beats).
//  4. Engine flow: startEmote → engineState().emote one-shot broadcast exactly
//     once, repeat starts re-broadcast (receiver dedupes on payload change),
//     expiry cleans up, movement-cancel path clears head/pose state, remote
//     replay pipeline (queueRemoteAction "anim:id" / playRemoteAnim) works.
// Run: bun scripts/check-emotes.ts

import fs from "node:fs";

// ---- canvas/window stubs (same approach as check-entrances) ----
type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      return () => undefined;
    },
    set() {
      return true;
    },
  });
}
const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0,
  height: 0,
  style: {},
};
(globalThis as Record<string, unknown>).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout,
  clearTimeout,
};

let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simNow };

function pump(ms: number) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    simNow += 16;
    rafCb?.(simNow);
  }
}

const { GameCanvas, EMOTE_DEFS, emoteIconFor } = await import("../src/game/engine");
const { drawCat } = await import("../src/game/draw");
const { SPAWN } = await import("../src/game/world");

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

// ===========================================================================
// 1. Registry integrity
// ===========================================================================
console.log("— registry —");
const SPEC_EMOTES = [
  "sit", "lie", "sleep", "groom", "stretch", "yawn", "scratch", "shake", "sniff",
  "alert", "tail-flick", "crouch", "stalk", "pounce", "leap", "play", "greet",
  "bow", "nod", "shake-head", "challenge", "dance1", "dance2", "dance3", "dance4",
];
for (const id of SPEC_EMOTES) {
  check(!!EMOTE_DEFS[id], `EMOTE_DEFS has "${id}"`);
}
const VALID_POSES: ReadonlySet<string> = new Set([
  "walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake",
  "lie", "yawn", "sniff", "stalk", "pounce", "leap", "play", "bow",
  "scratch", "challenge", "dance1", "dance2", "dance3", "dance4",
]);
let posesValid = true;
let dursValid = true;
for (const [id, def] of Object.entries(EMOTE_DEFS)) {
  if (def.pose && !VALID_POSES.has(def.pose)) {
    console.error(`FAIL  EMOTE_DEFS["${id}"].pose "${def.pose}" is not a CatPose`);
    posesValid = false;
  }
  if (!(def.dur > 0 && def.dur <= 30)) {
    console.error(`FAIL  EMOTE_DEFS["${id}"].dur ${def.dur} out of range`);
    dursValid = false;
  }
}
check(posesValid, "all EMOTE_DEFS poses are valid CatPose values");
check(dursValid, "all EMOTE_DEFS durations are sane (0 < dur <= 30)");
const dancePoses = new Set(["dance1", "dance2", "dance3", "dance4"].map((d) => EMOTE_DEFS[d]?.pose));
check(dancePoses.size === 4, "the 4 dances map to 4 DISTINCT poses");

// draw.ts must give each dance a distinct beat (source-level mirror check)
const drawSrc = fs.readFileSync("src/game/draw.ts", "utf8");
const rotMatch = drawSrc.match(/DANCE_ROT[^=]*=\s*\{([\s\S]*?)\}/);
const rotVals = rotMatch
  ? [...rotMatch[1].matchAll(/dance[1-4]:\s*([\d.]+)/g)].map((m) => Number(m[1]))
  : [];
check(rotVals.length === 4 && new Set(rotVals).size === 4, `draw.ts DANCE_ROT has 4 distinct beats (${rotVals.join(", ")})`);

// ===========================================================================
// 2. UI contract: action names, no emoji
// ===========================================================================
console.log("— emote menu —");
const uiSrc = fs.readFileSync("src/pages/gameUi.tsx", "utf8");
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
check(!PICTO.test(uiSrc), "gameUi.tsx contains NO pictographs (emoji) anywhere");
check(!PICTO.test(drawSrc), "draw.ts sprite layer contains no pictographs");

// extract ANIM_TABS entries from source (mirrors the data, like other suites)
const emoteEntries = [...uiSrc.matchAll(/\{\s*kind:\s*"emote",\s*label:\s*"([^"]+)",\s*emote:\s*"([^"]+)"\s*\}/g)];
const poseEntries = [...uiSrc.matchAll(/\{\s*kind:\s*"pose",\s*label:\s*"([^"]+)",\s*pose:\s*"([a-z]+)"\s*\}/g)];
check(emoteEntries.length >= 18, `emote bar exposes ${emoteEntries.length} animation emotes (>= 18)`);
const allEmoteIds = emoteEntries.map((m) => m[2]);
const missing = allEmoteIds.filter((id) => !EMOTE_DEFS[id]);
check(missing.length === 0, `every menu emote id exists in EMOTE_DEFS${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
const dancesInMenu = ["dance1", "dance2", "dance3", "dance4"].filter((d) => allEmoteIds.includes(d));
check(dancesInMenu.length === 4, "all 4 dances are reachable from the emote menu");
const ENGINE_POSES: ReadonlySet<string> = new Set([
  "sit", "sleep", "groom", "stretch", "crouch", "lie", "walk",
]);
const badPoses = poseEntries.filter((m) => !ENGINE_POSES.has(m[2]));
check(badPoses.length === 0, `menu pose actions map to real poses${badPoses.length ? ` (bad: ${badPoses.map((m) => m[2]).join(", ")})` : ""}`);
const labels = [...emoteEntries, ...poseEntries].map((m) => m[1]);
check(labels.length > 0 && labels.every((l) => /^[A-Za-z0-9 '"()&\-]+$/.test(l)), "every menu button label is a plain ACTION NAME (ASCII text, no emoji)");
for (const id of [...allEmoteIds, ...Object.keys(EMOTE_DEFS), "happy", "sad", "heart", "thumbsup"]) {
  if (emoteIconFor(id) !== null) {
    check(false, `emoteIconFor("${id}") must be null (no emoji layer)`);
  }
}
check(true, "emoteIconFor() returns null for every emote + legacy icon ids");

// ===========================================================================
// 3. drawCat smoke test: every pose × fx × time must render without throwing
// ===========================================================================
console.log("— drawCat smoke —");
const skins = [
  { fur: "#a0713c", furDark: "#6b4a24", eye: "#3f7f5f" },
  {
    fur: "#43443f", furDark: "#26261f", eye: "#c9a227", chest: "#e8e4d8",
    pattern: "tabby", markings: ["muzzle", "chest", "paws"], acc: { collar: "red" },
    furLength: 1.4, size: 1.15, scar: true, eye2: "#7fa8c9",
  },
];
const fxVariants: Array<Record<string, unknown>> = [
  {}, { yawn: true }, { alert: true }, { tailFlick: true }, { talking: true },
  { wet: true }, { carry: true }, { head: "nod" }, { head: "shake" },
  { head: "look" }, { head: "sniff" }, { hop: 2 }, { yawn: true, wet: true },
  { carry: true, tailFlick: true },
];
const times = [0, 0.07, 0.19, 0.43, 0.77, 1.31, 2.9];
let drawCalls = 0;
let drawErrors = 0;
let firstErr = "";
for (const pose of VALID_POSES) {
  for (const skin of skins) {
    for (const fx of fxVariants) {
      for (const time of times) {
        for (const phase of [0, 2.3]) {
          for (const facing of [1, -1] as const) {
            try {
              drawCat(ctx as unknown as CanvasRenderingContext2D, skin as never, 100, 100, facing, pose as never, time, phase, fx as never);
              drawCalls++;
            } catch (e) {
              drawErrors++;
              if (!firstErr) firstErr = `${pose} fx=${JSON.stringify(fx)} t=${time}: ${String(e)}`;
            }
          }
        }
      }
    }
  }
}
check(drawErrors === 0, `drawCat rendered ${drawCalls} pose/fx/time combinations with 0 throws${firstErr ? ` (first: ${firstErr})` : ""}`);

// ===========================================================================
// 4. Engine flow: one-shot broadcast, re-broadcast, cancel, remote replay
// ===========================================================================
console.log("— engine flow —");
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
} as never);
pump(64); // let the engine initialize a few frames

const stateOf = () => (g as unknown as { engineState(): { emote?: string; animationState: string; movementState: string } }).engineState();
const eng = g as unknown as { startEmote: (id: string) => boolean; cancelEmote: () => void; pEmoteId?: string | null; pHeadKind?: string | null; queueRemoteAction: (k: "vocal" | "action", p: string, u?: string) => void; playRemoteAnim: (u: string, id: string) => void; remoteEmotePose: (u: string) => { pose: string; fx: { dur: number } } | null; remotes: Map<string, unknown> };

// 4a. one-shot rides exactly one packet
check(eng.startEmote("groom") === true, "startEmote('groom') starts");
check(stateOf().emote === "groom", "first engineState sample carries emote 'groom'");
pump(50);
check(stateOf().emote === undefined, "subsequent samples are deduped (one-shot)");

// 4b. re-triggering the same emote re-broadcasts (receiver dedupes on change)
eng.startEmote("groom");
check(stateOf().emote === "groom", "re-starting the same emote re-broadcasts");
pump(50);

// 4c. expiry cleans up
pump(3400); // groom dur 3.2s
check(stateOf().emote === undefined && eng.pEmoteId === null, "emote expires cleanly and clears state");
eng.startEmote("groom");
check(stateOf().emote === "groom", "emote re-broadcasts after natural expiry");
pump(50);

// 4d. movement-cancel path clears pose + head state
eng.startEmote("scratch");
check(eng.pHeadKind === "shake", "scratch sets head-acting state");
eng.cancelEmote();
check(eng.pEmoteId === null && eng.pHeadKind === null, "cancelEmote clears pose AND head state");
check(stateOf().emote === undefined, "cancelled emote does not broadcast");

// 4e. invalid ids rejected
check(eng.startEmote("not-a-real-emote") === false, "unknown emote id is rejected");
check(eng.startEmote("dance2") === true, "dance2 starts (valid)");
eng.cancelEmote();

// 4f. movement/animation state vocabulary stays engine-true
const s = stateOf();
check(["idle", "walk", "run", "crouch"].includes(s.movementState), "engineState.movementState uses the synced vocabulary");
check(VALID_POSES.has(s.animationState), "engineState.animationState is always a CatPose");

// 4g. remote replay pipeline (what Game.tsx drives on animOneShot changes).
// The engine prunes emotes for uids missing from g.remotes (players who left),
// so register the fake players first — exactly what Game.tsx does with the
// presence listOnline snapshot.
const fakeRemote = (userId: string) => ({
  userId,
  catName: userId,
  appearance: { fur: "#a0713c", furDark: "#6b4a24", eye: "#3f7f5f" },
  x: 0, y: 0, facing: 1 as const, moving: false,
});
eng.remotes.set("userB", fakeRemote("userB"));
eng.remotes.set("userC", fakeRemote("userC"));

eng.queueRemoteAction("action", "anim:dance1", "userB");
pump(16);
const rb = eng.remoteEmotePose("userB");
check(rb !== null && rb.pose === "dance1", "queueRemoteAction('anim:dance1') replays as dance1 on the remote cat");
eng.playRemoteAnim("userC", "dance3");
pump(16);
const rc = eng.remoteEmotePose("userC");
check(rc !== null && rc.pose === "dance3", "playRemoteAnim('userC','dance3') replays dance3");
const rb2 = eng.remoteEmotePose("userB");
check(rb2 !== null && rb2.pose === "dance1", "per-user remote emotes are independent");
pump(5000); // dance dur 4.5s
check(eng.remoteEmotePose("userB") === null, "remote emote expires after its duration");
eng.queueRemoteAction("action", "anim:not-real", "userB");
pump(16);
check(eng.remoteEmotePose("userB") === null, "invalid remote emote id is dropped");

// 4h. lifecycle guard: emotes from players who left are pruned next frame
eng.playRemoteAnim("userC", "dance2");
pump(16);
check(eng.remoteEmotePose("userC") !== null, "dance2 active for userC");
eng.remotes.delete("userC");
pump(16);
check(eng.remoteEmotePose("userC") === null, "remote emote is pruned when the player leaves the world");

console.log(failures === 0 ? `\nOK  emote system verification passed` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
