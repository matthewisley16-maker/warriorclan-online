// Two-engine multiplayer sync test.
//
// Engine A acts as the SENDer (its engineState() is sampled, like Game.tsx's
// movement-sync heartbeat). Engine B is the RECEIVER: the sampled states are
// delivered into b.remotes with network faults (delay, duplication,
// reordering, bursts). Asserts:
//   - B's render of A is smooth (no per-packet teleporting, no big snaps)
//   - old/duplicate packets can never move the render backward
//   - a stalled stream briefly extrapolates (no freeze), then catches up
//     smoothly (no rubber-banding)
//   - pose follows movement state (walk while moving, sit when stopped)
//     and NEVER renders a walking animation for a stationary state
//   - late join / reconnect starts exactly at the authoritative snapshot
//   - leaving cleans up interpolation state
//
// Run with: bun scripts/check-sync.ts

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

// both engines re-register their loop every frame — keep a Set
const rafCbs = new Set<(t: number) => void>();
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCbs.add(cb);
  return rafCbs.size;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simTime };

let simTime = 0;
function stepFrames(frames: number) {
  for (let i = 0; i < frames; i++) {
    simTime += 16.7;
    for (const cb of [...rafCbs]) cb(simTime);
  }
}

// ---- import the real engine ----
const { GameCanvas } = await import("../src/game/engine");
type RemotePlayer = import("../src/game/engine").RemotePlayer;

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

const a = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, makeCb());
const b = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, makeCb());
// real input paths: position + facing (the private fields the engine itself drives)
const A = a as unknown as { px: number; py: number; pxFacing: 1 | -1; pSpeed: number; pPose: string };
const B = b as unknown as {
  remotes: Map<string, RemotePlayer>;
  remoteRender: Map<string, { x: number; y: number; pose: string; facing: number; serverTick: number; buffer: { x: number; receivedAt: number }[] }>;
};
stepFrames(2); // boot both engines

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let tick = 1000;
/** sample A's authoritative state and deliver it to B (the "heartbeat") */
function deliver(serverTick?: number) {
  const s = a.engineState();
  const t = serverTick ?? ++tick;
  B.remotes.set("A", {
    userId: "A",
    catName: "Alpha",
    clan: "thunderclan",
    rank: "apprentice",
    appearance: {
      fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086",
      pattern: "tabby", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false,
    },
    x: s.x, y: s.y, facing: s.facing, moving: s.moving,
    movementState: s.movementState, animationState: s.animationState,
    serverTick: t,
  });
}

const WALK = 165; // engine px/s
const DT = 16.7 / 1000;

/** Move A along (dx,dy) (normalized like real input) and step the sim. */
function walkA(dx: number, dy: number, seconds: number, deliverEveryMs = 0) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (ux !== 0) A.pxFacing = ux > 0 ? 1 : -1;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    A.px += ux * WALK * DT;
    A.py += uy * WALK * DT;
    stepFrames(1);
    if (deliverEveryMs > 0 && i % Math.max(1, Math.round(deliverEveryMs / 16.7)) === 0) deliver();
  }
}

/** Keep stepping while A stands still, delivering on the heartbeat cadence. */
function idleDeliver(seconds: number) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    stepFrames(1);
    if (i % 18 === 0) deliver();
  }
}

let maxStep = 0;
function watchMaxStep(frames: number) {
  let last = B.remoteRender.get("A")?.x;
  for (let i = 0; i < frames; i++) {
    stepFrames(1);
    const cur = B.remoteRender.get("A")?.x;
    if (last !== undefined && cur !== undefined) maxStep = Math.max(maxStep, Math.abs(cur - last));
    last = cur;
  }
}

// ---------------------------------------------------------------------------
// 1. smooth walk: deliver every 300ms while A walks right for 3s
// ---------------------------------------------------------------------------
const startX = A.px;
walkA(1, 0, 3, 300);
const render = B.remoteRender.get("A");
check("remote render exists while A walks", !!render);
check("walk pose plays for a moving remote", render?.pose === "walk", `pose=${render?.pose}`);
check("no teleporting during walk (max per-frame step sane)", maxStep < 12, `maxStep=${maxStep.toFixed(2)}px`);
check(
  "render tracks the walker (no huge lag)",
  Math.abs((render?.x ?? 0) - A.px) < 220,
  `render=${render?.x?.toFixed(1)} actual=${A.px.toFixed(1)} startX=${startX.toFixed(1)}`,
);

// ---------------------------------------------------------------------------
// 2. stop -> idle: A halts, idle states arrive, remote returns to idle pose
// ---------------------------------------------------------------------------
idleDeliver(1.5);
const afterStop = B.remoteRender.get("A");
check(
  "idle pose when movement stops (never stuck walking)",
  afterStop?.pose === "sit",
  `pose=${afterStop?.pose}`,
);
check(
  "remote converged to A's stop position",
  Math.abs((afterStop?.x ?? 0) - A.px) < 30,
  `render=${afterStop?.x?.toFixed(1)} actual=${A.px.toFixed(1)}`,
);
check("local player also stops to idle (no walk-in-place)", A.pPose === "sit", `pose=${A.pPose}`);
maxStep = 0;
watchMaxStep(30);
check("still smooth while idling", maxStep < 12, `maxStep=${maxStep.toFixed(2)}px`);

// ---------------------------------------------------------------------------
// 3. duplicate + old packets: render must not move backward
// ---------------------------------------------------------------------------
const stableTick = B.remoteRender.get("A")!.serverTick;
const xBefore = B.remoteRender.get("A")!.x;
deliver(stableTick); // exact duplicate
stepFrames(3);
B.remotes.set(
  "A",
  { ...(B.remotes.get("A") as RemotePlayer), x: A.px + 50, y: A.py, serverTick: stableTick - 5 },
);
stepFrames(3); // out-of-order (older tick)
const after = B.remoteRender.get("A")!;
check(
  "duplicate packet ignored",
  after.serverTick === stableTick && Math.abs(after.x - xBefore) < 3,
  `tick=${after.serverTick} dx=${(after.x - xBefore).toFixed(2)}`,
);
check("old packet cannot move a player backward", after.x >= xBefore - 1, `dx=${(after.x - xBefore).toFixed(2)}`);

// ---------------------------------------------------------------------------
// 4. packet stall: stream stops mid-walk — extrapolate, no freeze; then a
//    burst of delayed packets arrives — smooth catch-up, no rubber-banding
// ---------------------------------------------------------------------------
walkA(1, 0, 0.2, 0);
deliver(); // newest state of a MOVING cat…
let froze = false;
let xs: number[] = [];
for (let f = 0; f < 30; f++) {
  A.px += WALK * DT; // A keeps walking; packets are lost for ~0.5s
  stepFrames(1);
  xs.push(B.remoteRender.get("A")!.x);
}
for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1] - 0.25) froze = true;
check(
  "no freeze during packet stall (keeps easing/extrapolating forward)",
  !froze && xs[xs.length - 1] > xs[0],
  `first=${xs[0].toFixed(1)} last=${xs[xs.length - 1].toFixed(1)}`,
);
maxStep = 0;
deliver(); deliver(); deliver(); // delayed burst arrives
watchMaxStep(45);
check("no rubber-band snap when the burst arrives", maxStep < 40, `maxStep=${maxStep.toFixed(2)}px`);
idleDeliver(0.7); // converge cleanly before the next scenario

// ---------------------------------------------------------------------------
// 5. small correction (200px desync < 250px snap threshold): smooth glide
// ---------------------------------------------------------------------------
deliver();
stepFrames(1);
A.px += 200; // below REMOTE_SNAP_DIST — must reconcile smoothly
maxStep = 0;
idleDeliver(1);
check("small desync glides smoothly (no visible teleport)", maxStep < 40, `maxStep=${maxStep.toFixed(2)}px`);
check("small desync converges to the authoritative position", Math.abs(B.remoteRender.get("A")!.x - A.px) < 40,
  `render=${B.remoteRender.get("A")!.x.toFixed(1)} actual=${A.px.toFixed(1)}`);

// ---------------------------------------------------------------------------
// 6. large desync (500px > snap threshold): authoritative snap allowed
// ---------------------------------------------------------------------------
walkA(1, 0, 0.2, 0);
deliver();
stepFrames(1);
A.px += 500;
deliver(); // discontinuity: buffer resets, render snaps
stepFrames(1);
const snapped = B.remoteRender.get("A")!;
check(
  "large desync snaps to the authoritative position",
  Math.abs(snapped.x - A.px) < 60,
  `render=${snapped.x.toFixed(1)} actual=${A.px.toFixed(1)}`,
);

// ---------------------------------------------------------------------------
// 7. direction change sync
// ---------------------------------------------------------------------------
walkA(-1, 0, 1.2, 300);
check("direction flip reaches the remote", B.remoteRender.get("A")!.facing === -1,
  `facing=${B.remoteRender.get("A")!.facing}`);

// ---------------------------------------------------------------------------
// 8. animation/movement state conflicts resolve to the MOVEMENT state
// ---------------------------------------------------------------------------
deliver(); stepFrames(1);
const feedState = (ms: string, anim: string) => {
  tick += 1;
  const r = B.remotes.get("A") as RemotePlayer & { movementState?: string; animationState?: string };
  B.remotes.set("A", { ...r, movementState: ms, animationState: anim, serverTick: tick });
  stepFrames(2);
};
feedState("walk", "sit");
check(
  "moving + idle-anim state renders WALK (never walk pos + idle anim)",
  B.remoteRender.get("A")!.pose === "walk",
  `pose=${B.remoteRender.get("A")!.pose}`,
);
feedState("idle", "sit");
for (let i = 0; i < 40; i++) stepFrames(1); // past the walk latch
check("idle + sit state renders sit", B.remoteRender.get("A")!.pose === "sit",
  `pose=${B.remoteRender.get("A")!.pose}`);
feedState("idle", "walk");
for (let i = 0; i < 40; i++) stepFrames(1);
check("stationary state never renders a walking animation",
  B.remoteRender.get("A")!.pose !== "walk", `pose=${B.remoteRender.get("A")!.pose}`);

// ---------------------------------------------------------------------------
// 9. late join / reconnect: fresh snapshot renders exactly, no stale reuse
// ---------------------------------------------------------------------------
B.remotes.set("C", {
  userId: "C", catName: "Late", clan: "riverclan", rank: "warrior",
  appearance: {
    fur: "#444", furDark: "#222", eye: "#cc0",
    pattern: "solid", furLength: 1, tail: "bob", ears: "fold", size: 0.95, scar: false,
  },
  x: 4000, y: 3000, facing: 1, moving: false, movementState: "idle", animationState: "sit",
  serverTick: ++tick,
});
stepFrames(1);
const c = B.remoteRender.get("C")!;
check(
  "late joiner renders exactly at their authoritative snapshot",
  Math.abs(c.x - 4000) < 0.01 && Math.abs(c.y - 3000) < 0.01,
  `x=${c.x} y=${c.y}`,
);

// disconnect cleanup: remove A and C
B.remotes.delete("A");
B.remotes.delete("C");
stepFrames(1);
check(
  "leaving cleans up interpolation state",
  !B.remoteRender.has("A") && !B.remoteRender.has("C"),
  `left=[${[...B.remoteRender.keys()].join(",")}]`,
);

// reconnect with fresh data must not reuse the old render
B.remotes.set("A", {
  userId: "A", catName: "Alpha", clan: "thunderclan", rank: "apprentice",
  appearance: {
    fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086",
    pattern: "tabby", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false,
  },
  x: 5000, y: 2500, facing: 1, moving: false, movementState: "idle", animationState: "sit",
  serverTick: ++tick,
});
stepFrames(1);
const ra = B.remoteRender.get("A")!;
check(
  "reconnect starts from the fresh snapshot (no stale state)",
  Math.abs(ra.x - 5000) < 0.01 && Math.abs(ra.y - 2500) < 0.01,
  `x=${ra.x} y=${ra.y}`,
);

console.log(failures === 0 ? "\nALL SYNC TESTS PASSED" : `\n${failures} SYNC TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
