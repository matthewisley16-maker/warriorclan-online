// Same BFS walkability check for the WindClan camp entrance.
// Run: bun scripts/check-wc-entrance.ts
import { isSolidPoint } from "../src/game/world";

const wc = { x: 20 * 32, y: 84 * 32 };
const R = 22 * 32;
// free spot south of the wc-apprentices den (the exact camp center is solid)
const insidePt = { x: wc.x, y: 86.6 * 32 };
const outsidePt = { x: wc.x, y: wc.y + R + 220 };

function reachable(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const cell = 12;
  const key = (x: number, y: number) => `${Math.round(x / cell)},${Math.round(y / cell)}`;
  const goal = key(b.x, b.y);
  const seen = new Set([key(a.x, a.y)]);
  const queue = [a];
  let iter = 0;
  while (queue.length > 0 && iter++ < 400000) {
    const cur = queue.shift()!;
    if (key(cur.x, cur.y) === goal) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx * cell;
      const ny = cur.y + dy * cell;
      const k = key(nx, ny);
      if (seen.has(k) || isSolidPoint(nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

const out = reachable(outsidePt, insidePt);
const back = reachable(insidePt, outsidePt);
console.log(`WC entrance outside→inside: ${out ? "PASS" : "FAIL"}`);
console.log(`WC entrance inside→outside: ${back ? "PASS" : "FAIL"}`);
if (!out || !back) process.exit(1);
