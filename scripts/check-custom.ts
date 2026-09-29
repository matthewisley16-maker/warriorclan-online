// Verifies the customization system:
//  1. Catalog integrity: unique ids, valid categories, apply/isOn round-trip.
//  2. Every extended field survives fullSkin (multiplayer sync path).
//  3. drawCat accepts every produced skin without throwing (all poses).
// Run: bun scripts/check-custom.ts
import { CAT_ITEMS, ACCESSORY_SLOTS, searchItems, itemById, COAT_COLORS, type CustomSkin } from "../src/game/catItems";
import { drawCat, type CatPose } from "../src/game/draw";

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

const POSES: CatPose[] = ["walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake"];

console.log("\n--- catalog integrity ---");
{
  const ids = new Set<string>();
  let dupes = 0;
  for (const i of CAT_ITEMS) {
    if (ids.has(i.id)) dupes++;
    ids.add(i.id);
  }
  check(dupes === 0, `all ${CAT_ITEMS.length} item ids unique`);
  check(COAT_COLORS.length >= 20, `natural color palette (${COAT_COLORS.length} colors)`);
  const cats = new Set(CAT_ITEMS.map((i) => i.category));
  for (const want of ["fur", "colors", "patterns", "markings", "eyes", "ears", "tail", "scars", "head", "ear", "neck", "body", "paw"]) {
    check(cats.has(want as never), `category "${want}" populated`);
  }
  check(ACCESSORY_SLOTS.length === 6, "6 accessory slots");
  check(CAT_ITEMS.filter((i) => i.category === "neck").length >= 8, `collar collection (${CAT_ITEMS.filter((i) => i.category === "neck").length} neck items)`);
}

console.log("\n--- apply/isOn correctness ---");
{
  const base: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e" };
  // Exclusive items (fur length, colors, patterns, tails, ears, eyes) apply ON
  // and stay on — they are selections, not toggles. Multi-select items
  // (markings, scars, accessories) toggle OFF on second apply.
  const exclusiveCats = ["fur", "colors", "patterns", "eyes", "ears", "tail"];
  let exOk = 0;
  let exN = 0;
  let togOk = 0;
  let togN = 0;
  for (const item of CAT_ITEMS) {
    const s = { ...base };
    item.apply(s);
    const on = item.isOn(s);
    item.apply(s);
    const off = item.isOn(s);
    if (exclusiveCats.includes(item.category)) {
      exN++;
      if (on && off) exOk++; // apply on, re-apply still on (selection)
    } else {
      togN++;
      if (on && !off) togOk++; // apply on, re-apply toggles off
    }
  }
  check(exOk === exN, `exclusive selections stay selected (${exOk}/${exN})`);
  check(togOk === togN, `toggles flip cleanly (${togOk}/${togN})`);
}

console.log("\n--- search ---");
{
  check(searchItems("flower", "all").every((i) => /flower/i.test(i.name + i.desc + (i.tags ?? []).join())) && searchItems("flower", "all").length >= 4, "search 'flower' works across categories");
  check(searchItems("collar", "all").length >= 6, "search 'collar' finds collars");
  check(searchItems("fluffy", "all").length >= 2, "search 'fluffy' finds fluffy items");
  check(searchItems("tail", "tail").every((i) => i.category === "tail"), "category-scoped search filters");
}

console.log("\n--- fullSkin persistence path (multiplayer sync) ---");
{
  const { fullSkin } = await import("../src/pages/gameUi");
  const rich: CustomSkin = {
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#d9a83a", eye2: "#9cc2ea",
    pattern: "mackerel", patternIntensity: 0.8, furLength: 1.3, tail: "fluffy", ears: "tufted",
    markings: ["chest", "paws", "blaze"], scars: ["cheek", "ear"],
    acc: { neck: "collar-red", head: "flower", tail: "band" }, accColor: "#5b8fd6", size: 1.05, scar: false,
  };
  const round = fullSkin(rich as never);
  check(round.eye2 === "#9cc2ea", "heterochromia survives fullSkin");
  check(round.pattern === "mackerel", "extended pattern survives fullSkin");
  check((round.markings ?? []).length === 3, "markings survive fullSkin");
  check((round.scars ?? []).length === 2, "scars survive fullSkin");
  check(round.acc?.neck === "collar-red", "accessories survive fullSkin");
  check(round.accColor === "#5b8fd6", "accessory color survives fullSkin");
  // old save shape still loads
  const old = fullSkin({ fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e", pattern: "solid", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false } as never);
  check(!old.acc && !old.markings && old.pattern === "solid", "old saves load unchanged");
}

console.log("\n--- drawCat renders every item in every pose ---");
{
  // headless canvas stub: drawCat only calls 2D context methods
  const calls = { count: 0 };
  const noop = () => { calls.count++; };
  const ctx = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "canvas") return { width: 100, height: 100 };
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;

  let bad = 0;
  const base: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e" };
  const skins: CustomSkin[] = [{ ...base }];
  for (const item of CAT_ITEMS) {
    const s = { ...base, markings: [], scars: [], acc: {} };
    item.apply(s);
    skins.push(s);
  }
  // one fully-loaded cat
  skins.push({
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#d9a83a", eye2: "#9cc2ea", pattern: "calico",
    markings: ["muzzle", "chest", "paws", "tailtip", "blaze", "socks", "ears", "belly", "chin", "nose"],
    scars: ["cheek", "brow", "nose", "ear", "shoulder", "side"],
    acc: { neck: "bell", head: "flowercrown", ear: "feather", body: "herbs", paw: "wrap", tail: "ribbon" },
    accColor: "#d9a83a", furLength: 1.6, tail: "fluffy", ears: "tufted",
  });
  for (const s of skins) {
    for (const pose of POSES) {
      try {
        calls.count = 0;
        drawCat(ctx, s as never, 50, 50, 1, pose, 1.23, 0);
        if (calls.count === 0) bad++;
      } catch (e) {
        bad++;
        console.error(`      drawCat threw: ${pose} / ${(s as { pattern?: string }).pattern ?? "base"}:`, (e as Error).message);
      }
    }
  }
  check(bad === 0, `all ${skins.length} skins × ${POSES.length} poses render without throwing (${bad} bad)`);
}

console.log(failures === 0 ? "\nALL CUSTOMIZATION CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
