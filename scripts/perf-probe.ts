// temp diagnostic probe (not a suite): where does a frame's time go?
type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };

const counts: Record<string, number> = {};
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      const key = String(prop);
      return () => {
        counts[key] = (counts[key] ?? 0) + 1;
        return undefined;
      };
    },
    set() {
      return true;
    },
  });
}

const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1600, height: 900, left: 0, top: 0, right: 1600, bottom: 900 }),
  width: 0,
  height: 0,
  style: {},
};

(globalThis as Record<string, unknown>).document = {
  createElement: (tag: string) => {
    if (tag !== "canvas") return {};
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
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simNow };

function stepFrame(dtMs = 16.7) {
  simNow += dtMs;
  rafCb?.(simNow);
}

const { GameCanvas } = await import("../src/game/engine");
const { SPAWN, CAMP_CENTER, npcs, trees, flora, allObjects, groundMap } = await import("../src/game/world");

console.log(`roster: ${npcs.length} npcs, ${trees.length} trees, ${flora.length} flora, ${allObjects.length} objects, ${groundMap.length} ground cells`);

const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: SPAWN.x, y: SPAWN.y }, {
  onMove: () => undefined,
  onNearby: () => undefined,
  onAreaChange: () => undefined,
  onInteract: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onSfx: () => undefined,
  onInteriorChange: () => undefined,
  onConvoEnd: () => undefined,
  onRemoteAnim: () => undefined,
  onRemoteVocal: () => undefined,
  onWaypoint: () => undefined,
  onStoryWaypoint: () => undefined,
  onDeath: () => undefined,
  onPreyCaught: () => undefined,
  onEmoteFx: () => undefined,
});

const targets = [
  "drawFlora", "drawGroundDeco", "drawMotes", "renderWeather", "drawTree", "drawGround",
  "drawWetGround", "drawWaterAnimation", "drawFallingLeaves", "drawDepthBand", "drawCloudShadows",
  "tickCatAnim", "update", "drawRemoteCat",
] as const;
const perSection: Record<string, { ops: number; frames: number }> = {};
for (const name of targets) {
  const fn = (g as unknown as Record<string, AnyFn>)[name];
  if (typeof fn !== "function") continue;
  perSection[name] = { ops: 0, frames: 0 };
  const detail: Record<string, number> = {};
  (perSection[name] as unknown as { detail: Record<string, number> }).detail = detail;
  (g as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
    const rec = perSection[name];
    const before = { ...counts };
    const out = fn.apply(this, args);
    for (const k of new Set([...Object.keys(before), ...Object.keys(counts)])) {
      const d = (counts[k] ?? 0) - (before[k] ?? 0);
      if (d) detail[k] = (detail[k] ?? 0) + d;
    }
    return out;
  };
}
// drawCat is called from many places: attribute its ops under "cats"
const { drawCat } = await import("../src/game/draw");

const spots: [string, { x: number; y: number }][] = [
  ["twolegplace (spawn)", { x: SPAWN.x, y: SPAWN.y }],
  ["camp clearing", { x: CAMP_CENTER.x, y: CAMP_CENTER.y }],
  ["deep forest", { x: 70 * 32, y: 70 * 32 }],
  ["moor", { x: 10 * 32, y: 110 * 32 }],
  ["river", { x: 150 * 32, y: 100 * 32 }],
];

const N = 60;
for (const [label, pos] of spots) {
  g.teleport(pos.x, pos.y);
  for (let i = 0; i < 25; i++) stepFrame();
  for (const k of Object.keys(counts)) delete counts[k];
  for (const s of Object.values(perSection)) { s.ops = 0; s.frames = 0; }
  const t0 = Date.now();
  for (let i = 0; i < N; i++) stepFrame();
  const ms = (Date.now() - t0) / N;
  const total = Object.values(counts).reduce((a, b) => a + b, 0) / N;
  console.log(`\n=== ${label} — ${ms.toFixed(2)} ms/frame JS, ${total.toFixed(0)} canvas ops/frame, npcs awake=${(g as unknown as { npcStates: unknown[] }).npcStates.length}`);
  for (const [name, r] of Object.entries(perSection).sort((a, b) => b[1].ops - a[1].ops).slice(0, 8)) {
    const detail = (r as unknown as { detail: Record<string, number> }).detail ?? {};
    const top = Object.entries(detail).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `${k}=${(v / N).toFixed(0)}`).join(" ");
    console.log(`    ${name.padEnd(20)} ${(r.ops / N).toFixed(0)} ops  [${top}]`);
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log("    ops: " + top.map(([k, v]) => `${k}=${(v / N).toFixed(0)}`).join(" "));
}
void drawCat;
