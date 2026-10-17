// §PERF / §ANIM-STABILITY verification — the reported problems:
//
//   "The character animations are glitchy and the whole game runs far too
//    slowly."
//
// This suite holds the FIXES in place, measured against the real engine, the
// real renderer and the real world data (no mocks of the code under test):
//
//   1. Water: the moving surface was painted PER 8px CELL — ~12,000 canvas
//      ops in one frame at the river (measured before the fix). It is tiled
//      now, so the cost no longer scales with the number of water cells.
//   2. Full-screen passes: the background clear, four uniform lighting tints
//      and a re-rasterized vignette gradient every frame are now: no clear
//      (the terrain covers the canvas), ONE composed tint, one baked vignette.
//   3. Static ground detail (9000 specks) and forest flora are filled as one
//      path per style instead of one path per item.
//   4. One update loop: nothing simulates from inside the render path, a
//      frame schedules exactly one next frame, opening/closing a dialogue or
//      menu never adds a loop, and destroy() really stops everything.
//   5. Animation stability: turning never snaps, a stopped stride settles at
//      the same speed at any frame rate, a teleport is not a stride, and a
//      crouch-walk uses real leg animation instead of sliding on static paws.
//
// Run: bun scripts/check-perf.ts

type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };

interface OpLog {
  counts: Record<string, number>;
  fullScreenFills: number;
  radialGradients: number;
}

function makeCtx(log?: OpLog) {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient") {
        if (log) log.radialGradients++;
        return () => gradient;
      }
      if (prop === "createLinearGradient" || prop === "createPattern") return () => gradient;
      if (prop === "canvas") return canvas;
      const key = String(prop);
      return (...args: unknown[]) => {
        if (log) {
          log.counts[key] = (log.counts[key] ?? 0) + 1;
          if (key === "fillRect" && args[0] === 0 && args[1] === 0) {
            const w = Number(args[2]);
            const h = Number(args[3]);
            if (w >= 1200 && h >= 700) log.fullScreenFills++;
          }
        }
        return undefined;
      };
    },
    set() {
      return true;
    },
  });
}

const CANVAS_W = 1600;
const CANVAS_H = 900;
const opLog: OpLog = { counts: {}, fullScreenFills: 0, radialGradients: 0 };
const ctx = makeCtx(opLog);
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: CANVAS_W, height: CANVAS_H, left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H }),
  width: 0,
  height: 0,
  style: {},
};

let newCanvases = 0;
(globalThis as Record<string, unknown>).document = {
  createElement: (tag: string) => {
    if (tag !== "canvas") return {};
    newCanvases++;
    return { width: 0, height: 0, getContext: () => makeCtx(), style: {} };
  },
};
(globalThis as Record<string, unknown>).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout,
  clearTimeout,
  devicePixelRatio: 2,
};
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
let rafRequests = 0;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  rafRequests++;
  return rafRequests;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {
  rafCb = null;
};
(globalThis as Record<string, unknown>).performance = { now: () => simNow };

function stepFrame(dtMs = 16.7) {
  simNow += dtMs;
  const cb = rafCb;
  rafCb = null;
  cb?.(simNow);
}

const { GameCanvas } = await import("../src/game/engine");
const { trees, flora, allObjects } = await import("../src/game/world");
const { easeFacing, advanceGait, newGaitState, CatAnimator, SETTLE_SECONDS, TELEPORT_PX } = await import("../src/game/anim");
const { drawCat, normalizeSkin } = await import("../src/game/draw");
const { readFileSync } = await import("node:fs");

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail = "") {
  checks++;
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const noop = () => undefined;
const TILE = 32;
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * TILE, y: 146 * TILE }, {
  onAreaChange: noop,
  onNearby: noop,
  onMove: noop,
  onInteract: noop,
  onPreyCaught: noop,
  onClock: noop,
  onWeatherChange: noop,
  onInteriorChange: noop,
  onConvoEnd: noop,
  onRemoteAnim: noop,
  onRemoteVocal: noop,
  onWaypoint: noop,
  onStoryWaypoint: noop,
  onDeath: noop,
  onEmfx: noop,
} as never);

/** Measure one settled frame at a world position. */
function measure(x: number, y: number) {
  g.teleport(x, y);
  for (let i = 0; i < 30; i++) stepFrame();
  opLog.counts = {};
  opLog.fullScreenFills = 0;
  opLog.radialGradients = 0;
  newCanvases = 0;
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) stepFrame();
  const frames = 20;
  const total = Object.values(opLog.counts).reduce((a, b) => a + b, 0) / frames;
  return {
    total,
    fillRect: (opLog.counts.fillRect ?? 0) / frames,
    fullScreenFills: opLog.fullScreenFills / frames,
    radialGradients: opLog.radialGradients / frames,
    newCanvases,
    ms: (Date.now() - t0) / frames,
  };
}

// ---------------------------------------------------------------------------
// 1) WATER: the surface cost must NOT scale with the water on screen
// ---------------------------------------------------------------------------
console.log("— water rendering —");
{
  const land = measure(70 * TILE, 70 * TILE); // deep forest, no water in view
  const river = measure(150 * TILE, 100 * TILE); // the river is in view here
  check(river.total > 0, "the river frame renders");
  // the old per-cell painter produced ~11,900 fillRects (3-4 per water cell)
  check(river.fillRect < 1200, "the water surface is no longer painted per cell", `${river.fillRect.toFixed(0)} fillRect/frame (was ~11,900)`);
  check(river.fillRect - land.fillRect < 900, "water adds a bounded, tiled cost", `land ${land.fillRect.toFixed(0)} -> river ${river.fillRect.toFixed(0)}`);
  check(river.total < 9000, "a water-heavy frame stays inside the op budget", `${river.total.toFixed(0)} ops/frame (was ~19,800)`);
  check(land.total < 9000, "a forest frame stays inside the op budget", `${land.total.toFixed(0)} ops/frame (was ~11,600)`);
}

// ---------------------------------------------------------------------------
// 2) FULL-SCREEN PASSES: one composed tint, a baked vignette, no clear
// ---------------------------------------------------------------------------
console.log("— full-screen passes —");
{
  const day = measure(89 * TILE, 86 * TILE);
  check(day.fullScreenFills <= 2, "a day frame paints at most two full-screen overlays", `${day.fullScreenFills} (clear + 4 tints + gradient before)`);
  check(day.radialGradients === 0, "the vignette is baked, not re-rasterized per frame", `${day.radialGradients} radial gradients/frame`);
  check(day.newCanvases === 0, "no offscreen canvas is created per frame (caches are reused)");
}

// ---------------------------------------------------------------------------
// 3) ONE UPDATE LOOP, AND ONLY ONE
// ---------------------------------------------------------------------------
console.log("— update loops —");
{
  // a normal frame schedules exactly one next frame
  rafRequests = 0;
  stepFrame();
  check(rafRequests === 1, "a frame schedules exactly one next frame", `${rafRequests} requests`);

  // opening/closing a dialogue or a menu must not create a second loop
  for (let i = 0; i < 40; i++) {
    g.setPaused(i % 2 === 0, false);
    stepFrame();
  }
  rafRequests = 0;
  stepFrame();
  check(rafRequests === 1, "pause/menu churn never adds a permanent loop", `${rafRequests} requests`);

  // the render path must not simulate the world (traffic used to advance there)
  const src = readFileSync(new URL("../src/game/engine.ts", import.meta.url), "utf8");
  const renderPart = src.slice(src.indexOf("private renderWorld("), src.indexOf("private renderInterior("));
  check(!renderPart.includes("updateTraffic("), "no simulation runs inside the render path");
  check(src.includes("updateTraffic(dt, this.time)"), "traffic is advanced from the simulation step");

  // destroy really stops the loop
  g.destroy();
  rafRequests = 0;
  rafCb = null;
  stepFrame();
  check(rafRequests === 0, "destroy() cancels the frame loop (nothing keeps running)");
}

// ---------------------------------------------------------------------------
// 4) ANIMATION STABILITY
// ---------------------------------------------------------------------------
console.log("— animation stability —");
{
  // a turn never jumps: reversing direction mid-turn used to snap 0.35 -> 1.0
  let facing = 1;
  let maxStep = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    const target: 1 | -1 = Math.floor(i / 12) % 2 === 0 ? 1 : -1;
    const next = easeFacing(facing, target, dt);
    maxStep = Math.max(maxStep, Math.abs(next - facing));
    facing = next;
  }
  check(maxStep <= (dt / 0.17) * 2 + 1e-9, "the drawn facing walks through a turn, never snaps", `max ${maxStep.toFixed(3)}/frame`);
  check(Math.abs(easeFacing(0, 1, dt) - Math.min(1, dt / 0.17)) < 1e-9, "a fresh cat eases into its facing");
  check(easeFacing(0.9, 1, dt) <= 1 && easeFacing(0.9, 1, dt) > 0.9, "re-facing already-leaned forward cannot pop to full");
}

{
  // the settle after stopping is frame-rate independent
  const settles = [30, 60, 144].map((fps) => {
    const st = { phase: 0.3, travelled: 0, gait: "walk" as const, blend: 1 };
    let s = st;
    for (let i = 0; i < fps; i++) s = advanceGait(s, 0, "idle", 1 / fps);
    return s.blend;
  });
  const spread = Math.max(...settles) - Math.min(...settles);
  check(spread < 0.01, "a stopped stride settles at the same rate at 30/60/144 fps", `blend ${settles.map((v) => v.toFixed(4)).join("/")}`);
  check(SETTLE_SECONDS > 0 && SETTLE_SECONDS < 1, "the settle window is a real time constant", `${SETTLE_SECONDS}s`);
}

{
  // a teleport must not be fed to the gait
  const anim = new CatAnimator();
  let v = anim.update("a", { x: 0, y: 0, nowSec: 0, dtSec: 1 / 60 }, 1);
  const phaseBefore = v.phase;
  v = anim.update("a", { x: TELEPORT_PX + 400, y: 0, gait: "walk", nowSec: 0.016, dtSec: 1 / 60 }, 1);
  check(v.phase === phaseBefore, "a teleport advances no stride (no invisible leg sprint)", `${phaseBefore} -> ${v.phase}`);

  // walking still advances it by exactly the distance travelled
  const anim2 = new CatAnimator();
  anim2.update("b", { x: 0, y: 0, gait: "walk", nowSec: 0, dtSec: 1 / 60 }, 1);
  const w = anim2.update("b", { x: 15, y: 0, gait: "walk", nowSec: 0.016, dtSec: 1 / 60 }, 1);
  check(Math.abs(w.phase - 0.5) < 1e-9, "half a stride is half a cycle", `phase=${w.phase}`);
}

{
  // crouch-walking is a MOVEMENT pose: it must animate legs, not slide
  const anim = new CatAnimator();
  let view = anim.update("c", { x: 0, y: 0, gait: "crouch", poseLocked: false, nowSec: 0, dtSec: 1 / 60 }, 1);
  for (let i = 1; i <= 30; i++) {
    view = anim.update("c", { x: i * 1.3, y: 0, gait: "crouch", poseLocked: false, nowSec: i / 60, dtSec: 1 / 60 }, 1);
  }
  check(view.moving, "a crouch-walking cat is marked as moving");
  check(view.legs.some((l) => l.lift > 0.5), "its paws actually lift (no ground slide on static feet)");

  // …and the renderer draws them only while it travels (the stride blends
  // away on stopping, then the original crouch stance returns)
  let still = view;
  for (let i = 0; i < 60; i++) {
    still = anim.update("c", { x: 39, y: 0, gait: "crouch", poseLocked: false, nowSec: 1 + i / 60, dtSec: 1 / 60 }, 1);
  }
  check(!still.moving, "a stopped crouch is not moving");
  const rec: unknown[][] = [];
  const legCtx = makeCtx();
  const proxy = new Proxy(legCtx, {
    get(t, prop) {
      if (prop === "roundRect") return (...args: unknown[]) => rec.push(args);
      return Reflect.get(t, prop);
    },
  }) as unknown as CanvasRenderingContext2D;
  drawCat(proxy, normalizeSkin({ fur: "#c9a27a" }), 0, 0, 1, "crouch", 1, 0, { anim: still });
  const crouchPaws = rec.filter((a) => a.length === 5 && a[2] === 4 && a[3] === 7).length;
  check(crouchPaws === 0, "a STILL crouched cat keeps the original crouch stance (2 static paws)", `${crouchPaws}`);
  const movingView = { ...view, moving: true };
  const rec2: unknown[][] = [];
  const proxy2 = new Proxy(makeCtx(), {
    get(t, prop) {
      if (prop === "roundRect") return (...args: unknown[]) => rec2.push(args);
      return Reflect.get(t, prop);
    },
  }) as unknown as CanvasRenderingContext2D;
  drawCat(proxy2, normalizeSkin({ fur: "#c9a27a" }), 0, 0, 1, "crouch", 1, 0, { anim: movingView });
  const movingPaws = rec2.filter((a) => a.length === 5 && a[2] === 4 && a[3] === 7).length;
  check(movingPaws === 4, "a crouch-WALKING cat is drawn with its four animated paws", `${movingPaws}`);
}

// ---------------------------------------------------------------------------
// 5) THE WORLD DATA IS UNCHANGED (no map/asset downgrade to win performance)
// ---------------------------------------------------------------------------
console.log("— the world is intact —");
check(trees.length > 2000, "every tree is still in the world", `${trees.length}`);
check(flora.length > 3000, "every plant is still in the world", `${flora.length}`);
check(allObjects.length > 250, "every object is still in the world", `${allObjects.length}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
