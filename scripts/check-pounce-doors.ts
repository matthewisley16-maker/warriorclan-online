// Behavior verification: prey pounce rules + walk-through doors.
// Run: bun scripts/check-pounce-doors.ts

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
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => 0 };

const { GameCanvas, interiors } = await import("../src/game/engine");
const { allObjects, isSolidPoint, SPAWN } = await import("../src/game/world");

let simT = 0;
const caught: string[] = [];
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: (k: string) => caught.push(k),
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
} as never);

function frames(n: number) {
  for (let i = 0; i < n; i++) {
    simT += 16.7;
    rafCb?.(simT);
    rafCb = null;
    (g as unknown as { raf: number }).raf = 1; // keep the loop "alive"
    // re-kick: engine schedules itself via requestAnimationFrame each frame
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
      rafCb = cb;
      return 1;
    };
  }
}
// simpler: drive update/render directly each frame
function step(n: number) {
  for (let i = 0; i < n; i++) {
    simT += 16.7;
    rafCb?.(simT);
  }
}

let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "OK " : "✗  "} ${label}`);
  if (!cond) failures++;
};

// ---------- TEST 1: walking over prey does NOT kill it ----------
step(5);
const eng = g as unknown as { prey: { id: string; x: number; y: number; phase: string }[]; px: number; py: number; time: number };
eng.prey = [
  {
    id: "test-mouse",
    x: eng.px,
    y: eng.py, // directly under the player
    kind: "mouse",
    home: { x: eng.px, y: eng.py },
    tx: eng.px,
    ty: eng.py,
    facing: 1,
    fleeing: false,
    waitUntil: 0,
    seed: 1,
    phase: "alive",
    deadUntil: 0,
  } as never,
];
step(30); // ~half a second of walking "through" the prey
const aliveAfterWalk = eng.prey.some((p) => p.id === "test-mouse" && p.phase === "alive");
check(aliveAfterWalk && caught.length === 0, "walking over prey does NOT kill it");

// ---------- TEST 2: pounceAt() (the E path) kills + rewards exactly once ----------
const kind = g.pounceAt();
check(kind === "mouse", `pounceAt() kills the prey (returned ${kind})`);
check(caught.length === 1 && caught[0] === "mouse", "onPreyCaught fired exactly once");
const second = g.pounceAt();
check(second === null && caught.length === 1, "second pounce on the same (dying) prey is ignored");
step(45); // death pose elapses
check(!eng.prey.some((p) => p.id === "test-mouse"), "prey fully despawned after the death pose");

// ---------- TEST 3: walk-through doors — approach, auto-enter, walk out ----------
const house = allObjects.find((o) => o.id === "smudge-house")!;
const room = interiors["smudge-house"];
const gw = room.walls[0].length;
const gh = room.walls.length;
// door point: the doorway gap on the house's south face
const doorX = house.x + (house.doorAt?.dx ?? 0) * 32;
const doorY = house.y + house.h / 2 + (house.doorAt?.dy ?? 0) * 32;
// stand right at the doorstep (inside the walk-in trigger radius)
const doorstep = { x: doorX, y: doorY + 14 };
check(!isSolidPoint(doorstep.x, doorstep.y), "smudge-door doorstep is walkable");
eng.px = doorstep.x;
eng.py = doorstep.y;
eng.camX = doorstep.x;
eng.camY = doorstep.y;
const g2 = g as unknown as { interiorId: string | null; doorArmed: boolean; doorCooldownUntil: number; time: number };
step(3);
check(g2.interiorId === "smudge-house", "walking into the doorway auto-enters (no E needed)");
step(5);
check(g2.interiorId === "smudge-house", "staying inside keeps the room loaded");

// walk out through the doorway gap at the bottom wall (hold "down" like a
// real player walking out — the walk-out runs while moving)
g2.px = (gw / 2) * 32;
g2.py = (gh - 2.6) * 32;
(g2 as unknown as { keys: Set<string> }).keys = new Set(["s"]); // hold S
step(30);
(g2 as unknown as { keys: Set<string> }).keys = new Set();
check(g2.interiorId === null, "walking into the bottom-wall gap exits the room");
step(30);
check(g2.interiorId === null, "standing outside after exit does NOT re-enter");

// come back to the doorway — re-entry works (after the brief re-arm window,
// matching the "stand at the door a moment" behavior)
eng.px = doorstep.x;
eng.py = doorstep.y;
step(220); // ~3.7s: cooldown + re-arm window elapsed
check(g2.interiorId === "smudge-house", "standing at the doorway re-enters after the re-arm window");
g.exitInterior();
step(2);

// ---------- TEST 3b: camp dens (SOLID objects) are enterable ----------
const warriorsDen = allObjects.find((o) => o.id === "warriors-den")!;
const wdDoorX = warriorsDen.x + (warriorsDen.doorAt?.dx ?? 0) * 32;
const wdDoorY = warriorsDen.y + warriorsDen.h / 2 + (warriorsDen.doorAt?.dy ?? 0) * 32;
// walk the player to just outside the den's collision (south face)
const wdApproach = { x: wdDoorX, y: wdDoorY + 26 };
check(!!isSolidPoint(warriorsDen.x, warriorsDen.y), "warriors-den is solid (can't walk through it)");
check(!isSolidPoint(wdApproach.x, wdApproach.y), "den approach point (south face) is walkable");
step(120); // let the previous exit's door cooldown (~1.2s) elapse
eng.px = wdApproach.x;
eng.py = wdApproach.y;
step(6);
check(g2.interiorId === "tc-warriors-den", "walking up to the den AUTO-ENTERS it");
g.exitInterior();
step(120); // cooldown elapses
eng.px = wdApproach.x;
eng.py = wdApproach.y;
step(220); // re-arm window elapses while standing at the den
check(g2.interiorId === "tc-warriors-den", "den re-enters after re-arm window (walk-in + E both work)");
g.exitInterior();
step(2);

// ---------- TEST 4: every interior enter/exit survives (no crash) ----------
let allOk = true;
for (const id of Object.keys(interiors)) {
  try {
    g.enterInterior(id);
    step(3);
    g.exitInterior();
    step(1);
  } catch (e) {
    allOk = false;
    console.log("   ✗", id, e instanceof Error ? e.message : e);
  }
}
check(allOk, "all interiors cycle enter/exit without exceptions");

console.log(failures === 0 ? "\nALL BEHAVIOR TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
