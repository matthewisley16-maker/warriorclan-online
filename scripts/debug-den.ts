// temp debug: full-precision blocker predicate + step probes per frame
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
const { allObjects, isSolidPoint } = await import("../src/game/world");

const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
  onAreaChange: () => undefined, onNearby: () => undefined, onMove: () => undefined, onInteract: () => undefined,
  onPreyCaught: () => undefined, onClock: () => undefined, onWeatherChange: () => undefined,
  onInteriorChange: () => undefined, onInteriorChange2: () => undefined, onNpcIdle: () => undefined,
} as never);
pump(80);
type NS = { def: { id: string }; x: number; y: number; ai: string; pose: string; activity: string; waitUntil: number; aiThinkAt: number; stuckSince: unknown; stuckCooldown: number; sidestepPt: unknown; sidestepUntil: number; lastStuckX: number; lastStuckY: number; denId: unknown; denSeat: number; preyId: unknown; gone?: boolean; convoActive?: boolean };
const eng = g as unknown as { npcStates: NS[]; time: number; dayTime: number };

const denObj = allObjects.find((o) => o.id === "elders-den")!;
const mouth = { x: denObj.x, y: denObj.y + denObj.h / 2 + 14 };
const cats = eng.npcStates.filter((n) => ["halftail", "smallear", "patchpelt", "one-eye"].includes(n.def.id));
eng.dayTime = (8 / 24) * 600;
for (const c of cats) {
  c.ai = "idle"; c.convoActive = false; c.pose = "sit"; c.waitUntil = 0; c.aiThinkAt = 0; c.gone = false;
  c.x = denObj.x + 40 + cats.indexOf(c) * 22;
  c.y = denObj.y + denObj.h / 2 + 46;
  c.stuckSince = null; c.stuckCooldown = 0; c.sidestepPt = null; c.sidestepUntil = 0;
  c.lastStuckX = c.x; c.lastStuckY = c.y;
}
eng.dayTime = (0.5 / 24) * 600;
const h = cats[0];
let frames = 0;
for (let i = 0; i < 400 && h.ai !== "in_den"; i++) {
  pump(100);
  frames++;
  if (i < 12 || i % 25 === 0) {
    const d = Math.hypot(h.x - mouth.x, h.y - mouth.y);
    const others = eng.npcStates
      .filter((o) => o !== h && o.denId === "elders-den" && o.ai === "go_den")
      .map((o) => {
        const dO = Math.hypot(o.x - mouth.x, o.y - mouth.y);
        const strictly = dO < d - 4;
        const tie = Math.abs(dO - d) <= 4;
        const win = tie && o.def.id < h.def.id;
        return `${o.def.id}(dO=${dO.toFixed(1)},strict=${strictly},tie=${tie},win=${win})`;
      })
      .join(" ");
    console.log(`i=${i} h@(${h.x.toFixed(1)},${h.y.toFixed(1)}) d=${d.toFixed(2)} pose=${h.pose} den=${String(h.denId)} seat=${h.denSeat} ai=${h.ai} | blockers: ${others || "none"}`);
  }
}
console.log(frames < 400 ? `REACHED in_den after ${frames} frames` : "NEVER reached in_den");
