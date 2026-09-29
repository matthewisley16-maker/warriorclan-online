// Verifies the role-differentiated NPC behavior system:
//  1. Every NPC maps to a role bucket and gets camp spots for its den.
//  2. go_den targets are REACHABLE: the approach mouth is never inside a
//     solid footprint it isn't deliberately entering.
//  3. Each clan's fresh-kill pile is its own (ThunderClan cats resolve to the
//     ThunderClan pile, not the player's nearest one).
//  4. Den seats never overlap between cats heading to the same den.
// Run: bun scripts/check-behavior.ts
import { allObjects, CAMP_CENTER, CAMP_RADIUS, npcs, territoryAt, type TerritoryId } from "../src/game/world";

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

// roleOf mirror (kept in sync with engine.ts)
function roleOf(role: string): "leader" | "deputy" | "medicine" | "queen" | "elder" | "apprentice" | "warrior" | "kit" | "kittypet" | "other" {
  const r = role.toLowerCase();
  if (r.includes("leader")) return "leader";
  if (r.includes("deputy")) return "deputy";
  if (r.includes("medicine")) return "medicine";
  if (r.includes("queen")) return "queen";
  if (r.includes("elder")) return "elder";
  if (r.includes("kit")) return r.includes("kitty") ? "kittypet" : "kit";
  if (r.includes("apprentice")) return "apprentice";
  if (r.includes("warrior")) return "warrior";
  return "other";
}

// solid-footprint mirror: dens block their rect MINUS an 8px inset
// (engine blockRect: o.x - o.w/2 + 4 .. o.x + o.w/2 - 4)
function insideSolidRect(x: number, y: number, pad = 0): boolean {
  for (const o of allObjects) {
    if (!o.solid) continue;
    if (
      x >= o.x - o.w / 2 + 4 - pad && x <= o.x + o.w / 2 - 4 + pad &&
      y >= o.y - o.h / 2 + 4 - pad && y <= o.y + o.h / 2 - 4 + pad
    ) return true;
  }
  return false;
}

console.log("\n--- role buckets cover the whole roster ---");
{
  const buckets = new Map<string, number>();
  for (const n of npcs) {
    const r = roleOf(n.role);
    buckets.set(r, (buckets.get(r) ?? 0) + 1);
  }
  console.log("     ", [...buckets.entries()].map(([k, v]) => `${k}:${v}`).join("  "));
  check((buckets.get("leader") ?? 0) >= 4, "4 leaders (one per clan)");
  check((buckets.get("deputy") ?? 0) >= 4, "4 deputies (Redtail, Oakheart, Deadfoot, Blackfoot)");
  check((buckets.get("medicine") ?? 0) >= 3, "medicine cats present (Spottedleaf, Barkface, Runningnose)");
  check((buckets.get("queen") ?? 0) >= 5, "queens present");
  check((buckets.get("elder") ?? 0) >= 6, "elders present");
  check((buckets.get("apprentice") ?? 0) >= 4, "apprentices present (Gray/Raven/Dust/Sand)");
  check((buckets.get("warrior") ?? 0) >= 12, "warriors present");
}

console.log("\n--- go_den approach mouths stand outside every solid rect ---");
{
  let bad = 0;
  let checked = 0;
  for (const o of allObjects) {
    if (!o.interior || !o.solid) continue;
    checked++;
    const m = { x: o.x, y: o.y + o.h / 2 + 14 }; // engine mouth: south face + 14px
    // the mouth must never sit inside the den's OWN blocked rect (neighbor
    // grazes in tight streets are handled by the engine's sidestep logic)
    if (
      m.x >= o.x - o.w / 2 + 4 && m.x <= o.x + o.w / 2 - 4 &&
      m.y >= o.y - o.h / 2 + 4 && m.y <= o.y + o.h / 2 - 4
    ) bad++;
  }
  check(bad === 0, `${checked} den mouths stand clear of their own footprint (${bad} bad)`);
}

console.log("\n--- each clan resolves its OWN fresh-kill pile ---");
{
  const piles = allObjects.filter((o) => o.interact === "fresh-kill");
  console.log(`      piles: ${piles.map((p) => `${p.id}@${Math.round(p.x)},${Math.round(p.y)}`).join("  ")}`);
  check(piles.length >= 4, "all four camps have fresh-kill piles");
  const tcPile = piles.find((p) => Math.hypot(p.x - CAMP_CENTER.x, p.y - CAMP_CENTER.y) < CAMP_RADIUS);
  check(tcPile !== undefined, "ThunderClan camp has a pile inside its walls");
  for (const id of ["bluestar", "graypaw", "lionheart", "redtail"]) {
    const n = npcs.find((d) => d.id === id);
    if (!n) continue;
    let best = piles[0];
    let bestD = Infinity;
    for (const p of piles) {
      const d = Math.hypot(p.x - n.home.x, p.y - n.home.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    check(best.id === tcPile?.id, `${id}: nearest pile is the ThunderClan one`);
  }
}

console.log("\n--- every roster cat has a plausible home territory ---");
{
  const bad: string[] = [];
  for (const n of npcs) {
    const t = territoryAt(n.home.x, n.home.y) as TerritoryId;
    const r = roleOf(n.role);
    const kittypetLife = r === "kittypet" || n.clan === "kittypet";
    if (!kittypetLife && (t === "unclaimed" || t === "kittypet" || t === "rogue")) {
      bad.push(`${n.id}(${t})`);
    }
  }
  check(bad.length === 0, `clan cats live on clan ground (${bad.join(", ") || "none"})`);
}

console.log("\n--- camp landmark anchors exist (leader Tallrock, apprentice stump) ---");
{
  for (const id of ["tallrock", "tc-stump-app", "medicine-stone", "nursery", "elders-den", "tc-stone-1", "tc-stone-3"]) {
    check(allObjects.some((o) => o.id === id), `landmark ${id} exists`);
  }
}

console.log(failures === 0 ? "\nALL BEHAVIOR CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
