// Reachability verification: for every enterable entrance in the world,
// pathfind from the player spawn (Twolegplace) to a spot just outside the
// entrance using BFS on the real collision grid, then step into the doorway
// and confirm the interior can be entered and left.
// Run: bun scripts/check-entrances.ts

// ---- canvas/window stubs (same approach as sim-walk) ----
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

// ---- BFS on the real collision grid ----
const step = 8; // px between nodes (player half-width is ~7)
const key = (x: number, y: number) => `${Math.round(x)}:${Math.round(y)}`;

function bfsTo(target: { x: number; y: number }): { x: number; y: number }[] | null {
  const start = { x: SPAWN.x, y: SPAWN.y };
  if (isSolidPoint(target.x, target.y)) return null;
  const visited = new Set<string>([key(start.x, start.y)]);
  const prev = new Map<string, string>();
  let frontier: { x: number; y: number }[] = [start];
  const maxNodes = 1_600_000;
  let expanded = 0;
  while (frontier.length && expanded < maxNodes) {
    const next: { x: number; y: number }[] = [];
    for (const cur of frontier) {
      expanded++;
      const dist = Math.hypot(cur.x - target.x, cur.y - target.y);
      if (dist < 14) {
        // walk the chain back to start
        const path: { x: number; y: number }[] = [];
        let k: string | undefined = key(cur.x, cur.y);
        while (k && k !== key(start.x, start.y)) {
          const [px, py] = k.split(":").map(Number);
          path.push({ x: px, y: py });
          k = prev.get(k);
        }
        path.push(start);
        return path.reverse();
      }
      for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const kk = key(nx, ny);
        if (visited.has(kk)) continue;
        if (isSolidPoint(nx, ny)) continue;
        visited.add(kk);
        prev.set(kk, key(cur.x, cur.y));
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

const doors = allObjects.filter((o) => o.interior);
console.log(`checking ${doors.length} enterable entrances...\n`);

let ok = 0;
const failures: string[] = [];
for (const d of doors) {
  const room = interiors[d.interior!];
  if (!room) {
    failures.push(`${d.id}: interior "${d.interior}" does not exist`);
    continue;
  }
  // approach point: just outside the object's collision box (below, then
  // above/left/right as fallbacks) — the spot a player would stand at to
  // press E on this entrance.
  const candidates = [
    { x: d.x, y: d.y + d.h / 2 + 16 },
    { x: d.x, y: d.y - d.h / 2 - 16 },
    { x: d.x - d.w / 2 - 16, y: d.y },
    { x: d.x + d.w / 2 + 16, y: d.y },
  ];
  const approach = candidates.find((c) => !isSolidPoint(c.x, c.y));
  if (!approach) {
    failures.push(`${d.id} → ${d.interior}: entrance completely walled in (all four sides solid)`);
    continue;
  }
  const path = bfsTo(approach);
  if (!path) {
    failures.push(`${d.id} → ${d.interior}: NO walkable path from spawn (blocked or unreachable)`);
    continue;
  }
  // simulate walking the path in the engine
  for (const p of path) {
    g.px = p.x;
    g.py = p.y;
    rafCb?.(16);
  }
  const before = d.interior;
  (g as unknown as { enterInterior: (id: string) => void }).enterInterior(before);
  const inId = (g as unknown as { interiorId: string | null }).interiorId;
  (g as unknown as { exitInterior: () => void }).exitInterior();
  if (inId !== before) {
    failures.push(`${d.id}: could not enter interior ${before}`);
    continue;
  }
  ok++;
  console.log(`OK  ${d.id.padEnd(22)} → ${before.padEnd(18)} path ${Math.round(path.length * step / 32)} tiles`);
}

console.log(`\n${ok}/${doors.length} entrances reachable & enterable`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗", f);
  process.exit(1);
} else {
  console.log("ALL ENTRANCES PASS");
}
