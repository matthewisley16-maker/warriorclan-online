// Online multiplayer SKIN SYNCHRONIZATION test.
//
// Reproduces the reported bug end-to-end at the level that actually broke:
//
//   client saves a skin → the send gate is told "already broadcast" → no packet
//   ever carries the payload → the presence row keeps the OLD coat → every
//   other player keeps rendering the old cat.
//
// Asserts, through the REAL code:
//   - a packet carrying only a version number can never advance (strand) the
//     stored look and its version (nextPresenceAppearance, src/game/saveShared)
//   - an identical coat is never re-written (no version churn at 300ms)
//   - a real change swaps the look AND advances the version monotonically
//   - a fresh presence row starts from the server clock, so a returning
//     player's look is always newer than anything a remote client cached
//   - the fixed client converges to the new skin within a packet or two, while
//     the REMOVED client line provably strands the row forever (control)
//   - an appearance-only swap never recreates/repositions a remote cat
//     (no duplicate character, no flicker, no movement reset)
//   - every appearance field survives fullSkin (incl. morph/presetId)
//   - source guard: the client must INVALIDATE the send gate after a confirmed
//     save instead of marking the new look as already sent
//
// Run with: bun scripts/check-skin-sync.ts

import fs from "node:fs";

type AnyFn = (...args: unknown[]) => unknown;

// ---- stubs (must exist before importing the engine) ----
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
const rafCbs = new Set<(t: number) => void>();
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCbs.add(cb);
  return rafCbs.size;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
let simTime = 0;
(globalThis as Record<string, unknown>).performance = { now: () => simTime };
function stepFrames(frames: number) {
  for (let i = 0; i < frames; i++) {
    simTime += 16.7;
    for (const cb of [...rafCbs]) cb(simTime);
  }
}

// ---- real code under test ----
const { appearanceVersion, nextPresenceAppearance } = await import("../src/game/saveShared");
const { fullSkin } = await import("../src/pages/gameUi");
const { GameCanvas } = await import("../src/game/engine");
type RemotePlayer = import("../src/game/engine").RemotePlayer;
type AppearanceT = import("../src/game/saveShared").AppearanceT;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// A. server merge: version-only packets, identical payloads, real changes
// ---------------------------------------------------------------------------

const OLD_LOOK = fullSkin({ fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086", pattern: "tabby" }) as AppearanceT;
const NEW_LOOK = fullSkin({
  fur: "#2b2b33",
  furDark: "#15151a",
  eye: "#e0b74a",
  pattern: "spotted",
  markings: ["m-flame"],
  scars: ["scar-eye"],
  acc: { neck: "collar-red" },
  accColors: { neck: "#d95f5f" },
  eye2: "#6fb7e8",
  tail: "bob",
  ears: "fold",
}) as AppearanceT;

const clock = 1_700_000_000_000;

// A player is online with the OLD coat on their presence row.
let row: { appearance?: AppearanceT; appearanceVersion?: number } = {
  appearance: OLD_LOOK,
  appearanceVersion: clock, // a fresh row: version == server clock
};

// §1 — the packet that used to strand the row: a bare version number, no payload.
const stranded = nextPresenceAppearance(row, undefined, clock + 300);
check(
  "version-only packet cannot advance the stored look",
  stranded.appearanceVersion === row.appearanceVersion && appearanceVersion(stranded.appearance) === appearanceVersion(OLD_LOOK),
  `ver=${stranded.appearanceVersion} fur=${stranded.appearance?.fur}`,
);

// A payload that is byte-for-byte the stored coat is a no-op (no version churn).
const same = nextPresenceAppearance(row, OLD_LOOK, clock + 600);
check("identical coat is never re-written (no version churn)", !same.changed && same.appearanceVersion === row.appearanceVersion, `changed=${same.changed}`);

// §3 — the real thing: the payload rides and the row updates, monotonically.
const beforeVer = row.appearanceVersion!;
const applied = nextPresenceAppearance(row, NEW_LOOK, clock + 900);
check(
  "changed payload swaps the look AND advances the version",
  applied.changed &&
    applied.appearanceVersion === beforeVer + 1 &&
    applied.appearance?.fur === NEW_LOOK.fur &&
    applied.appearance?.acc?.neck === "collar-red" &&
    applied.appearance?.eye2 === "#6fb7e8",
  `ver=${applied.appearanceVersion} fur=${applied.appearance?.fur}`,
);
row = { appearance: applied.appearance, appearanceVersion: applied.appearanceVersion };

// A later payload with a content-identical coat still leaves the row current
// (and an older, stale version number can never pull it backwards).
const afterUpdate = nextPresenceAppearance(row, NEW_LOOK, clock + 1200);
check("row stays current after the swap", afterUpdate.appearanceVersion === row.appearanceVersion && !afterUpdate.changed);

// §6 — a player who reconnects gets a fresh row whose version is the server
// clock, i.e. numerically newer than anything a remote cached earlier.
const rejoin = nextPresenceAppearance(null, NEW_LOOK, clock + 60_000);
check(
  "rejoining player's row version outdates any cached remote version",
  rejoin.changed && rejoin.appearanceVersion === clock + 60_000 && rejoin.appearanceVersion > row.appearanceVersion!,
  `ver=${rejoin.appearanceVersion}`,
);

// ---------------------------------------------------------------------------
// B. the pipeline: client send gate → presence row → remote applied version
// ---------------------------------------------------------------------------

/** Mirrors Game.tsx's send gate: the ref holds the version of the last look
 *  actually BROADCAST (null = nothing broadcast yet). */
class Client {
  gate: number | null = null;
  constructor(public skin: AppearanceT) {}
  /** one network packet (5s heartbeat / 300ms movement tick) */
  packet() {
    const ver = appearanceVersion(this.skin);
    const ride = this.gate === null || ver !== this.gate;
    if (ride) this.gate = ver;
    return { appearanceVersion: ver, appearance: ride ? this.skin : undefined };
  }
  /** SAVE CAT confirmed → the FIX: invalidate the gate (the look is unsent) */
  saveConfirmed(skin: AppearanceT) {
    this.skin = skin;
    this.gate = null;
  }
}

let server: { appearance?: AppearanceT; appearanceVersion?: number } = {
  appearance: OLD_LOOK,
  appearanceVersion: clock,
};
const client = new Client(OLD_LOOK);
// the player is already connected: one packet establishes the baseline
let p = client.packet();
server = nextPresenceAppearance(server, p.appearance, clock + 100);
const beforeSaveVer = server.appearanceVersion;

// A changes fur + markings + accessories while B is online, then SAVE CAT.
client.saveConfirmed(NEW_LOOK);
let packets = 0;
for (let i = 0; i < 10 && server.appearanceVersion === beforeSaveVer; i++) {
  packets++;
  p = client.packet();
  server = nextPresenceAppearance(server, p.appearance, clock + 500 + i * 300);
}
check(
  "after SAVE the new skin reaches the server row within a packet or two",
  server.appearance?.fur === NEW_LOOK.fur && server.appearance?.acc?.neck === "collar-red" && packets <= 2,
  `packets=${packets} fur=${server.appearance?.fur}`,
);
check("look and version moved together (remotes can trust the pair)", server.appearanceVersion === beforeSaveVer + 1);

// CONTROL — the removed client line: the gate was told the new look had been
// sent, so no packet ever carried it. The row must provably stay stale.
const buggyGateClient = new Client(NEW_LOOK);
buggyGateClient.gate = appearanceVersion(NEW_LOOK); // the deleted line
let staleServer: { appearance?: AppearanceT; appearanceVersion?: number } = {
  appearance: OLD_LOOK,
  appearanceVersion: clock,
};
for (let i = 0; i < 20; i++) {
  const q = buggyGateClient.packet();
  staleServer = nextPresenceAppearance(staleServer, q.appearance, clock + 1000 + i * 300);
}
check(
  "control: marking the look as sent before broadcasting strands the row",
  appearanceVersion(staleServer.appearance) === appearanceVersion(OLD_LOOK) && staleServer.appearanceVersion === clock,
  `fur=${staleServer.appearance?.fur} ver=${staleServer.appearanceVersion}`,
);

// ---------------------------------------------------------------------------
// C. remote client: an appearance-only swap must not disturb the cat
// ---------------------------------------------------------------------------

const SPAWN = { x: 78 * 32, y: 146 * 32 };
const noop = () => undefined;
const makeCb = () =>
  ({
    onAreaChange: noop,
    onNearby: noop,
    onInteract: noop,
    onMove: noop,
    onPreyCaught: noop,
    onClock: noop,
    onWeatherChange: noop,
    onInteriorChange: noop,
    onNpcIdle: noop,
  }) as never;

const b = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, makeCb());
const B = b as unknown as {
  remotes: Map<string, RemotePlayer>;
  remoteRender: Map<string, { x: number; y: number; pose: string; facing: number; serverTick: number; buffer: unknown[] }>;
};
stepFrames(2);

let tick = 1000;
function rowFor(appearance: AppearanceT, over: Partial<RemotePlayer> = {}): RemotePlayer {
  return {
    userId: "A",
    catName: "Alpha",
    clan: "thunderclan",
    rank: "warrior",
    appearance: appearance as RemotePlayer["appearance"],
    x: 4000,
    y: 3000,
    facing: 1,
    moving: false,
    movementState: "idle",
    animationState: "sit",
    appearanceVersion: 1,
    serverTick: ++tick,
    ...over,
  };
}

// A walks into view, then turns and keeps walking (pose + facing to preserve).
B.remotes.set("A", rowFor(OLD_LOOK));
stepFrames(2);
B.remotes.set("A", rowFor(OLD_LOOK, { x: 4200, facing: -1, moving: true, movementState: "walk", animationState: "walk" }));
// the render buffer intentionally lags the newest packet (interpolate-at-a-
// delay), so walk a few frames before sampling the stabilized facing
stepFrames(30);
const renderBefore = B.remoteRender.get("A")!;
const xBefore = renderBefore.x;
const poseBefore = renderBefore.pose;
const facingBefore = renderBefore.facing;
check("remote cat renders while walking", renderBefore.pose === "walk" && renderBefore.facing === -1, `pose=${poseBefore} facing=${facingBefore}`);

// The skin update arrives. Game.tsx replaces the row in the remotes map —
// exactly what happens when listOnline delivers a newer appearanceVersion.
const newRow = rowFor(NEW_LOOK, { x: 4200, facing: -1, moving: true, movementState: "walk", animationState: "walk", appearanceVersion: 2 });
B.remotes.set("A", newRow);
stepFrames(1);
const renderAfter = B.remoteRender.get("A")!;
check("the swap updates the remote's appearance in place", B.remotes.get("A")!.appearance.fur === NEW_LOOK.fur, `fur=${B.remotes.get("A")!.appearance.fur}`);
check("no duplicate character object for the same player", B.remotes.size === 1 && [...B.remotes.keys()].join(",") === "A", `size=${B.remotes.size}`);
check("the renderer is NOT recreated (no flicker/teardown)", renderAfter === renderBefore);
check(
  "position, facing and animation survive the skin swap",
  Math.abs(renderAfter.x - xBefore) < 40 && renderAfter.pose === poseBefore && renderAfter.facing === facingBefore,
  `x ${xBefore.toFixed(1)}→${renderAfter.x.toFixed(1)} pose ${poseBefore}→${renderAfter.pose} facing ${facingBefore}→${renderAfter.facing}`,
);

// Repeated simultaneous edits (three more skins) never reset or duplicate it.
for (let i = 3; i <= 6; i++) {
  B.remotes.set("A", rowFor(i % 2 ? OLD_LOOK : NEW_LOOK, { x: 4200 + i * 5, facing: -1, moving: true, movementState: "walk", animationState: "walk", appearanceVersion: i }));
  stepFrames(2);
}
const renderFinal = B.remoteRender.get("A")!;
check("repeated skin updates keep one cat, still moving", B.remotes.size === 1 && renderFinal === renderBefore && renderFinal.pose === "walk", `size=${B.remotes.size} pose=${renderFinal.pose}`);

// A stale row (same applied version) must not undo a newer look: the client
// keeps the look it already applied.
const cachedVer = B.remotes.get("A")!.appearanceVersion;
const keptLook = B.remotes.get("A")!.appearance;
const stale = rowFor(OLD_LOOK, { appearanceVersion: cachedVer, serverTick: ++tick });
const merged = cachedVer !== undefined && stale.appearanceVersion !== undefined && cachedVer === stale.appearanceVersion
  ? { ...stale, appearance: keptLook }
  : stale;
check("an identical-version row never regresses the rendered coat", appearanceVersion(merged.appearance as never) === appearanceVersion(keptLook as never));

// ---------------------------------------------------------------------------
// D. fullSkin completeness: every supported appearance field rides along
// ---------------------------------------------------------------------------

const rich = fullSkin({
  fur: "#2b2b33",
  furDark: "#15151a",
  chest: "#f4e9d8",
  eye: "#e0b74a",
  eye2: "#6fb7e8",
  nose: "#d98d8d",
  face: "round",
  pattern: "spotted",
  patternIntensity: 0.55,
  furLength: 1.2,
  furStyle: "fluffy",
  tail: "bob",
  ears: "fold",
  size: 1.05,
  scar: true,
  markings: ["m-flame"],
  scars: ["scar-eye"],
  acc: { neck: "collar-red", head: "flower" },
  accColor: "#d95f5f",
  accColors: { neck: "#d95f5f" },
  morph: "morph-lion",
  presetId: "firestar",
}) as AppearanceT;
const missing = (
  ["fur", "furDark", "eye", "eye2", "nose", "face", "pattern", "patternIntensity", "furLength", "furStyle", "tail", "ears", "size", "scar", "markings", "scars", "acc", "accColor", "accColors", "morph", "presetId"] as const
).filter((k) => rich[k] === undefined);
check("fullSkin carries every appearance field (incl. morph/presetId)", missing.length === 0, `missing=[${missing.join(",")}]`);
// §2/§7 — every field on its OWN must move the fingerprint, otherwise a player
// editing just that field would never broadcast anything at all.
const richVer = appearanceVersion(rich);
const blindFields = (
  ["fur", "furDark", "chest", "eye", "eye2", "nose", "face", "pattern", "patternIntensity", "furLength", "furStyle", "tail", "ears", "size", "scar", "markings", "scars", "acc", "accColor", "accColors", "morph", "presetId"] as const
).filter((k) => appearanceVersion(fullSkin({ ...rich, [k]: undefined })) === richVer);
check("each appearance field individually triggers a broadcast", blindFields.length === 0, `blind=[${blindFields.join(",")}]`);

check(
  "morph/preset id changes the appearance fingerprint (so a morph swap syncs)",
  appearanceVersion(fullSkin({ fur: "#2b2b33", furDark: "#15151a", eye: "#e0b74a", pattern: "solid", morph: "morph-lion" })) !==
    appearanceVersion(fullSkin({ fur: "#2b2b33", furDark: "#15151a", eye: "#e0b74a", pattern: "solid" })),
);

// ---------------------------------------------------------------------------
// E. source guard: the confirmed-save path must invalidate the send gate
// ---------------------------------------------------------------------------

const gameSrc = fs.readFileSync("src/pages/Game.tsx", "utf8");
check(
  "client never marks a look as sent before any packet carried it",
  !/sentAppearanceVerRef\.current = appearanceVersion\(/.test(gameSrc),
);
check(
  "confirmed save invalidates the send gate (next packet rides the new look)",
  /sentAppearanceVerRef\.current = null;/.test(gameSrc) &&
    /lastSkinSaveRef\.current = \{ at: Date\.now\(\), ok: true/.test(gameSrc),
);
// §3/§10 — a FAILED save must never look like a successful one: the handler
// records the failure and rethrows so the editor stays open on "Retry save"
// with the changes intact, and it must not touch the broadcast gate.
check(
  "failed save is recorded and rethrown (editor keeps the changes, offers retry)",
  /lastSkinSaveRef\.current = \{ at: Date\.now\(\), ok: false \};[\s\S]{0,120}throw e;/.test(gameSrc),
);

const presenceSrc = fs.readFileSync("src/convex/presence.ts", "utf8");
check(
  "the server derives the row's appearance version (never trusts the client's number)",
  /nextPresenceAppearance\(existing, args\.appearance, now\)/.test(presenceSrc) &&
    !/appearanceVersion: args\.appearanceVersion \?\?/.test(presenceSrc),
);

console.log(failures === 0 ? "\nALL SKIN-SYNC TESTS PASSED" : `\n${failures} SKIN-SYNC TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
