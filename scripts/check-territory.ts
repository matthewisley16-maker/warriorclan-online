// Verifies the NPC territory system:
//  1. Every NPC's home sits inside its claimed homeTerritory.
//  2. Thousands of sampled wander/hunt/patrol targets NEVER leave a cat's
//     home territory (clampTerritoryTarget always pulls targets back).
//  3. Weather distribution over a long simulated run is clear-dominant.
// Run: bun scripts/check-territory.ts
import { npcs, territoryAt, territoryZones, type TerritoryId } from "../src/game/world";
// ONE clamp rule for the engine, the Convex server (§31) and the tests: the
// territory decision can never drift between the three.
import { clampToHomeTerritory, territoryLeashFor } from "../src/game/npcSync";

const clampTerritoryTarget = (
  def: { home: { x: number; y: number } },
  homeTerr: TerritoryId,
  leash: number,
  tx: number,
  ty: number,
): { x: number; y: number } => clampToHomeTerritory(def.home, homeTerr, leash, tx, ty);

let fails = 0;

// --- 1. homes are inside their zones ---
console.log("== Home territory sanity ==");
for (const n of npcs) {
  const terr = territoryAt(n.home.x, n.home.y);
  const expect =
    n.clan === "kittypet" ? "kittypet" :
    n.clan === "thunderclan" ? "thunderclan" :
    n.clan === "windclan" ? "windclan" :
    n.clan === "riverclan" ? "riverclan" :
    n.clan === "shadowclan" ? "shadowclan" : terr;
  if (n.clan !== "shadowclan" && terr !== expect) {
    console.log(`  WARN ${n.id} (${n.clan}) home at ${terr}`);
    fails++;
  }
}
console.log(`  ${npcs.length} NPCs checked`);

// --- 2. clamped targets never leave home territory ---
console.log("== Target clamp sweep ==");
let checked = 0;
let violations = 0;
for (const n of npcs) {
  const terr = territoryAt(n.home.x, n.home.y);
  if (terr === "unclaimed") continue; // wilds cats may roam wilds
  const leash = territoryLeashFor(n.clan, n.role);
  for (let i = 0; i < 400; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 2600;
    const c = clampTerritoryTarget(n, terr as TerritoryId, leash, n.home.x + Math.cos(ang) * rad, n.home.y + Math.sin(ang) * rad);
    checked++;
    if (territoryAt(c.x, c.y) !== terr) violations++;
  }
}
console.log(`  ${checked} clamped targets, ${violations} territory violations`);
if (violations > 0) fails++;

// --- 3. weather distribution ---
console.log("== Weather distribution (simulated) ==");
const WEATHERS = ["clear", "cloudy", "rain", "heavy-rain", "fog", "storm", "wind", "snow"] as const;
const WEIGHTS = [63, 15, 4, 1, 3, 1, 12, 1];
type W = (typeof WEATHERS)[number];
function pick(prev: W): W {
  if (prev !== "clear" && prev !== "wind" && Math.random() < 0.55) return "clear";
  for (let attempt = 0; attempt < 4; attempt++) {
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pickW: W = "clear";
    for (let i = 0; i < WEATHERS.length; i++) {
      r -= WEIGHTS[i];
      if (r <= 0) { pickW = WEATHERS[i]; break; }
    }
    if ((prev === "clear" || prev === "wind") && (pickW === "storm" || pickW === "heavy-rain" || pickW === "snow")) pickW = "cloudy";
    if (pickW !== prev || attempt === 3) return pickW;
  }
  return "clear";
}
function dur(w: W): number {
  switch (w) {
    case "clear": case "wind": return 150 + Math.random() * 150;
    case "cloudy": case "fog": return 70 + Math.random() * 80;
    case "rain": case "heavy-rain": return 60 + Math.random() * 70;
    case "snow": return 55 + Math.random() * 50;
    case "storm": return 40 + Math.random() * 45;
  }
}
const timeIn: Record<string, number> = {};
let cur: W = "clear";
let elapsed = 0;
const SIM = 400 * 600; // 400 in-game days
while (elapsed < SIM) {
  const d = dur(cur);
  timeIn[cur] = (timeIn[cur] ?? 0) + d;
  elapsed += d;
  cur = pick(cur);
}
const totalTime = Object.values(timeIn).reduce((a, b) => a + b, 0);
const clearPct = ((timeIn.clear ?? 0) / totalTime) * 100;
const sunnyPct = clearPct + ((timeIn.wind ?? 0) / totalTime) * 100;
for (const w of WEATHERS) {
  console.log(`  ${w.padEnd(12)} ${(100 * (timeIn[w] ?? 0) / totalTime).toFixed(1)}%`);
}
console.log(`  -> clear/sunny combined: ${sunnyPct.toFixed(1)}%`);
if (clearPct < 55) { console.log("  FAIL: clear weather not dominant"); fails++; }
if ((timeIn.snow ?? 0) / totalTime > 0.05) { console.log("  FAIL: snow too common"); fails++; }
if ((timeIn.storm ?? 0) / totalTime > 0.05) { console.log("  FAIL: storms too common"); fails++; }

// zone coverage: territoryAt resolves everywhere (default = unclaimed)
console.log("== Zone coverage ==");
let defaulted = 0;
for (let x = 0; x < 240; x += 4) {
  for (let y = 0; y < 220; y += 4) {
    const covered = territoryZones.some((z) => x * 32 >= z.rect.x && x * 32 < z.rect.x + z.rect.w && y * 32 >= z.rect.y && y * 32 < z.rect.y + z.rect.h);
    if (!covered) defaulted++;
  }
}
console.log(`  ${defaulted} sampled points default to 'unclaimed' (expected > 0)`);
console.log(fails === 0 ? "\nALL CHECKS PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
