// Debug probe for the stall scenario in check-sync.ts (temporary).
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

const { GameCanvas } = await import("../src/game/engine");
type RemotePlayer = import("../src/game/engine").RemotePlayer;

const SPAWN = { x: 78 * 32, y: 146 * 32 };
const noop = () => undefined;
const makeCb = () =>
  ({
    onAreaChange: noop, onNearby: noop, onInteract: noop, onMove: noop,
    onPreyCaught: noop, onClock: noop, onWeatherChange: noop,
    onInteriorChange: noop, onNpcIdle: noop,
  }) as never;
const a = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, makeCb());
const b = new GameCanvas(canvas as unknown as HTMLCanvasElement, SPAWN, makeCb());
const A = a as unknown as { px: number; py: number };
const B = b as unknown as {
  remotes: Map<string, RemotePlayer>;
  remoteRender: Map<string, { x: number; y: number; pose: string; facing: number; serverTick: number; buffer: unknown[] }>;
};
stepFrames(2);

let tick = 1000;
function deliver() {
  const s = a.engineState();
  B.remotes.set("A", {
    userId: "A", catName: "Alpha", clan: "thunderclan", rank: "apprentice",
    appearance: {
      fur: "#b5713f", furDark: "#8a5528", eye: "#4d9086",
      pattern: "tabby", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false,
    },
    x: s.x, y: s.y, facing: s.facing, moving: s.moving,
    movementState: s.movementState, animationState: s.animationState,
    serverTick: ++tick,
  });
}

const WALK = 165;
const DT = 16.7 / 1000;

// walk with regular delivery like test 1
for (let f = 0; f < 180; f++) {
  A.px += WALK * DT;
  stepFrames(1);
  if (f % 18 === 0) deliver();
}
deliver();
stepFrames(30);

// now the stall: one delivery, then 24 frames with nothing
A.px += WALK * DT;
deliver();
stepFrames(1);
const buf = B.remoteRender.get("A")!;
console.log("right after final delivery:");
console.log("  buffer len:", buf.buffer.length);
for (const s of buf.buffer as { x: number; receivedAt: number }[]) {
  console.log(`    sample x=${s.x.toFixed(1)} receivedAt=${s.receivedAt.toFixed(0)} (now=${(simTime * 1).toFixed(0)})`);
}
console.log("  render x:", buf.x.toFixed(2), "serverTick:", buf.serverTick);
for (let f = 0; f < 24; f++) {
  A.px += WALK * DT;
  stepFrames(1);
  if (f % 6 === 0) {
    const r = B.remoteRender.get("A")!;
    console.log(`  frame ${f}: render=${r.x.toFixed(2)} bufferLen=${r.buffer.length} now=${simTime.toFixed(0)}`);
  }
}
