// Verifies the camp gorse-tunnel entrances are walkable on the REAL collision
// grid (wall ring + trees + objects): BFS from outside the camp to inside and
// back, through the south gap where the gorse tunnel sits.
// Run: bun scripts/check-tc-entrance.ts
import { isSolidPoint, CAMP_CENTER, CAMP_RADIUS } from "../src/game/world";

const ccs = { x: CAMP_CENTER.x, y: CAMP_CENTER.y };
const insidePt = { x: ccs.x, y: ccs.y };
// outside: well south of the entrance object
const outsidePt = { x: ccs.x, y: ccs.y + CAMP_RADIUS + 220 };

function walkable(x: number, y: number) {
  return !isSolidPoint(x, y);
}

/** BFS on a coarse grid through walkable space between two points. */
function reachable(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const cell = 12; // a cat is smaller than this
  const key = (x: number, y: number) => `${Math.round(x / cell)},${Math.round(y / cell)}`;
  const start = { x: a.x, y: a.y };
  const goal = key(b.x, b.y);
  const seen = new Set([key(a.x, a.y)]);
  const queue = [start];
  let iter = 0;
  while (queue.length > 0 && iter++ < 400000) {
    const cur = queue.shift()!;
    if (key(cur.x, cur.y) === goal) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx * cell;
      const ny = cur.y + dy * cell;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!walkable(nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

const out = reachable(outsidePt, insidePt);
const back = reachable(insidePt, outsidePt);
console.log(`TC entrance outside→inside: ${out ? "PASS" : "FAIL"}`);
console.log(`TC entrance inside→outside: ${back ? "PASS" : "FAIL"}`);
const wide = reachable({ x: outsidePt.x - 30, y: outsidePt.y }, { x: insidePt.x - 30, y: insidePt.y });
console.log(`TC entrance second lane (multi-cat width): ${wide ? "PASS" : "FAIL"}`);
if (!out || !back || !wide) process.exit(1);
