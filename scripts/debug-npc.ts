// temp debug: live den walk-in + stuck detection internals
type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern") return () => gradient;
      if (prop === "canvas") return canvas;
      return () => undefined;
    },
    set() { return true; },
  });
}
const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0, height: 0, style: {},
};
(globalThis as Record<string, unknown>).window = { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout };
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => { rafCb = cb; return 1; };
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simNow };
function pump(ms: number) {
  for (let i = 0; i < Math.max(1, Math.round(ms / 16)); i++) { simNow += 16; rafCb?.(simNow); }
}

const { GameCanvas } = await import("../src/game/engine");
const { allObjects } = await import("../src/game/world");

const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
  onAreaChange: () => undefined, onNearby: () => undefined, onMove: () => undefined, onInteract: () => undefined,
  onPreyCaught: () => undefined, onClock: () => undefined, onWeatherChange: () => undefined,
  onInteriorChange: () => undefined, onNpcIdle: () => undefined,
} as never);
pump(80);
const eng = g as unknown as {
  npcStates: Record<string, unknown>[]; time: number; dayTime: number;
} & { npcStates: { def: { id: string }; x: number; y: number; ai: string; pose: string; activity: string; waitUntil: number; aiThinkAt: number; stuckSince: unknown; stuckCooldown: number; sidestepPt: unknown; sidestepUntil: number; lastStuckX: number; lastStuckY: number; denId: unknown }[] };

// --- den scenario ---
const denObj = allObjects.find((o) => o.id === "elders-den")!;
const cat = eng.npcStates.find((n) => n.def.id === "halftail")!;
eng.dayTime = (8 / 24) * 600;
cat.ai = "idle"; cat.pose = "sit"; cat.waitUntil = 0; cat.aiThinkAt = 0;
cat.x = denObj.x + 60; cat.y = denObj.y + denObj.h / 2 + 46;
eng.dayTime = (0.5 / 24) * 600;
let last = "";
for (let i = 0; i < 2400; i++) {
  pump(100);
  const key = `${cat.ai}|${Math.round(cat.x)},${Math.round(cat.y)}`;
  if (key !== last) { console.log(`t=${eng.time.toFixed(1)} ai=${cat.ai} pos=${Math.round(cat.x)},${Math.round(cat.y)} den=${cat.denId}`); last = key; }
  if (cat.ai === "in_den") { console.log("REACHED in_den at", Math.round(cat.x), Math.round(cat.y)); break; }
}
console.log("den obj:", Math.round(denObj.x), Math.round(denObj.y), "w", Math.round(denObj.w), "h", Math.round(denObj.h));
const { isSolidPoint } = await import("../src/game/world");
console.log("seat(0) solid?", isSolidPoint(denObj.x - (denObj.w / 2 - 12), denObj.y - denObj.h / 4));

// --- stuck scenario ---
const s = eng.npcStates.find((n) => n.def.id === "dustpaw")!;
eng.dayTime = (10 / 24) * 600;
s.ai = "wander"; s.pose = "walk"; s.waitUntil = 1e9; s.aiThinkAt = 1e9;
s.x = 3 * 32 + 8; s.y = 80 * 32; s.tx = -200; s.ty = 80 * 32;
console.log("stuck start: x", s.x, "lastStuck", s.lastStuckX, s.lastStuckY, "cooldown", s.stuckCooldown);
for (let i = 0; i < 90; i++) {
  pump(100);
  if (i % 15 === 0 || s.stuckSince !== null || s.sidestepPt) {
    console.log(`i=${i} x=${Math.round(s.x)} ai=${s.ai} stuckSince=${String(s.stuckSince)} sidestep=${JSON.stringify(s.sidestepPt)} sidestepUntil=${s.sidestepUntil} time=${eng.time.toFixed(1)} lastStuck=${Math.round(s.lastStuckX)}`);
  }
  if (s.ai !== "wander") { console.log("ai changed:", s.ai); break; }
}
