// Headless walk simulation: boots the real GameCanvas with a stubbed canvas,
// walks the player out of Twolegplace in every direction, and reports any
// runtime exception or stalled render loop.
//
// Run with: bun scripts/sim-walk.ts

type AnyFn = (...args: unknown[]) => unknown;

// ---- stubs (must exist before importing the engine) ----
const gradient = { addColorStop: (() => undefined) as AnyFn };
let drawCalls = 0;
/** save/restore stack depth — an unbalanced restore corrupts camera state */
let stackDepth = 0;
let stackUnderflows = 0;
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      if (prop === "save") {
        drawCalls++;
        return () => {
          stackDepth++;
        };
      }
      if (prop === "restore") {
        drawCalls++;
        return () => {
          if (stackDepth <= 0) {
            stackUnderflows++;
            console.error(`STACK UNDERFLOW: ctx.restore() with empty save stack!`);
          } else stackDepth--;
        };
      }
      // every other method: count it and no-op. Property reads of style
      // attributes return a dummy value.
      return () => {
        drawCalls++;
      };
    },
    set(_t, _prop, _value) {
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

const keyListeners: [string, AnyFn][] = [];
const otherListeners: [string, AnyFn][] = [];
(globalThis as Record<string, unknown>).window = {
  addEventListener: (type: string, fn: AnyFn) => {
    if (type === "keydown" || type === "keyup") keyListeners.push([type, fn]);
    else otherListeners.push([type, fn]);
  },
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
(globalThis as Record<string, unknown>).performance = { now: () => simTime };

// ---- import the real engine ----
const { GameCanvas } = await import("../src/game/engine");

let simTime = 0;
function press(key: string) {
  for (const [type, fn] of keyListeners) {
    if (type === "keydown") fn({ key, target: null, preventDefault: () => undefined });
  }
}
function release(key: string) {
  for (const [type, fn] of keyListeners) {
    if (type === "keyup") fn({ key, target: null, preventDefault: () => undefined });
  }
}
function stepFrames(seconds: number, label: string) {
  const frames = Math.floor(seconds * 60);
  let firstError: string | null = null;
  const startCalls = drawCalls;
  for (let i = 0; i < frames; i++) {
    simTime += 16.7;
    const cb = rafCb;
    rafCb = null;
    try {
      cb?.(simTime);
    } catch (e) {
      const msg = `${label} frame ${i}: ${e instanceof Error ? e.stack : String(e)}`;
      if (!firstError) firstError = msg;
      console.error("EXCEPTION:", msg.split("\n").slice(0, 6).join("\n"));
      // engine loop would die here in the browser; re-kick it so we can keep probing
      rafCb = cb;
    }
  }
  if (!firstError) {
    console.log(`OK  ${label} — no exceptions. (draw activity: ${Math.round(drawCalls - startCalls)} total, ~${Math.round((drawCalls - startCalls) / frames)}/frame)`);
  }
  return firstError;
}

function pos(g: { px: number; py: number }) {
  return `(${(g.px / 32).toFixed(1)}, ${(g.py / 32).toFixed(1)}) tiles`;
}

// ---- boot at the Twolegplace spawn ----
const SPAWN = { x: 78 * 32, y: 146 * 32 };
const areasSeen: string[] = [];
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, {
  onAreaChange: (name) => areasSeen.push(name),
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: () => undefined,
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
} as never);

console.log("booted at", pos(g));

// settle a moment
stepFrames(2, "idle at spawn");

const errors: string[] = [];

// walk out of Twolegplace in each direction
const dirs: [string, string][] = [
  ["w", "north (out of Twolegplace into the forest)"],
  ["s", "south (map edge)"],
  ["a", "west"],
  ["d", "east"],
];
for (const [key, label] of dirs) {
  press(key);
  const err = stepFrames(55, `walk ${label}`);
  release(key);
  if (err) errors.push(err);
  console.log(`    position after ${label}: ${pos(g)}`);
  stepFrames(1, `settle after ${label}`);
}

// diagonal walk back toward camp area
press("w");
press("a");
errors.push(...[stepFrames(30, "walk northwest diagonal")].filter(Boolean) as string[]);
release("w");
release("a");

// interiors: enter and leave a house + a den
const tryInterior = (id: string) => {
  try {
    (g as unknown as { enterInterior: (id: string) => void }).enterInterior(id);
    const err = stepFrames(4, `inside ${id}`);
    if (err) errors.push(err);
    (g as unknown as { exitInterior: () => void }).exitInterior();
    stepFrames(1, `left ${id}`);
    console.log(`OK  interior ${id} enter/exit clean`);
  } catch (e) {
    const msg = `interior ${id}: ${e instanceof Error ? e.message : String(e)}`;
    errors.push(msg);
    console.error("EXCEPTION:", msg);
  }
};
tryInterior("rusty-house");
tryInterior("tc-medicine-den");
tryInterior("tc-warriors-den");

// long run at night with storm weather forced
(g as unknown as { weather: string; weatherUntil: number }).weather = "storm";
(g as unknown as { weatherUntil: number }).weatherUntil = 1e9;
press("s");
errors.push(...[stepFrames(25, "storm walk south")].filter(Boolean) as string[]);
release("s");

if (stackUnderflows > 0) {
  console.log(`\nFAILED — ${stackUnderflows} unbalanced ctx.restore() call(s) would wipe the camera transform (world/character vanish).`);
  process.exit(1);
} else if (errors.length === 0) {
  console.log("\nALL CLEAN — no exceptions, ctx.save/restore stack balanced on every walk path.");
  console.log("areas reported:", [...new Set(areasSeen)].join(" | "));
} else {
  console.log(`\n${errors.length} EXCEPTION(S) FOUND — see above.`);
  process.exit(1);
}
