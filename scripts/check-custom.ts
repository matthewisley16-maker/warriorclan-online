// Verifies the customization system:
//  1. Catalog integrity: unique ids, valid categories, apply/isOn round-trip.
//  2. Every extended field survives fullSkin (multiplayer sync path).
//  3. drawCat accepts every produced skin without throwing (all poses).
// Run: bun scripts/check-custom.ts
import {
  CAT_ITEMS,
  ACCESSORY_SLOTS,
  ACCESSORY_COLORS,
  ACC_SLOT_CATS,
  accessoriesFor,
  randomSkin,
  searchItems,
  itemById,
  COAT_COLORS,
  EYE_COLORS,
  type CustomSkin,
} from "../src/game/catItems";
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
  for (const want of ["fur", "colors", "patterns", "markings", "eyes", "face", "ears", "tail", "scars", "head", "ear", "neck", "body", "paw", "tailAcc"]) {
    check(cats.has(want as never), `category "${want}" populated`);
  }
  check(ACCESSORY_SLOTS.length === 6, "6 accessory slots");
  // every accessory slot maps to a real, populated catalog category
  let slotsOk = 0;
  for (const s of ACCESSORY_SLOTS) {
    const cat = ACC_SLOT_CATS[s.id];
    if (CAT_ITEMS.some((i) => i.category === cat)) slotsOk++;
  }
  check(slotsOk === 6, `every slot maps to a populated category (${slotsOk}/6)`);
  check(accessoriesFor("all").length >= 40, `unified accessories view (${accessoriesFor("all").length} items)`);
  check(accessoriesFor("neck").every((i) => i.category === "neck"), "slot filter narrows correctly");
  check(accessoriesFor("all", "seasonal").length >= 3, "seasonal theme filter has items");
  check(accessoriesFor("all", "fun").length >= 5, "fun theme filter has items");
  check(CAT_ITEMS.filter((i) => i.category === "neck").length >= 8, `collar collection (${CAT_ITEMS.filter((i) => i.category === "neck").length} neck items)`);
}

console.log("\n--- apply/isOn correctness ---");
{
  const base: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e" };
  // Exclusive items (fur length, colors, patterns, tails, ears, eyes) apply ON
  // and stay on — they are selections, not toggles. Multi-select items
  // (markings, scars, accessories) toggle OFF on second apply.
  const exclusiveCats = ["fur", "colors", "patterns", "eyes", "face", "ears", "tail"];
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
  const rich2 = fullSkin({ ...rich, furStyle: "scruffy", nose: "black", face: "forehead-tabby" } as never);
  check(rich2.furStyle === "scruffy", "fur style survives fullSkin");
  check(rich2.nose === "black", "nose color survives fullSkin");
  check(rich2.face === "forehead-tabby", "face marking survives fullSkin");
  check(round.patternIntensity === 0.8, "pattern intensity survives fullSkin");
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

console.log("\n--- every accessory ACTUALLY renders on the cat ---");
{
  // headless canvas stub counting real draw operations + recording fill colors
  let ops = 0;
  let fills: Set<string>;
  const noop = () => {
    ops++;
  };
  const ctx = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "canvas") return { width: 100, height: 100 };
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop: noop });
      return noop;
    },
    set: (_t, prop: string, v) => {
      if (prop === "fillStyle" && typeof v === "string") fills.add(v);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  const ANCHOR_POSES: CatPose[] = ["sit", "walk", "sleep", "swim", "groom", "dance2"];
  const draw = (s: CustomSkin, pose: CatPose) => {
    ops = 0;
    fills = new Set();
    drawCat(ctx, s as never, 50, 50, 1, pose, 1.23, 0);
    return ops;
  };
  const fillHad = (c: string) => fills.has(c);

  const accItems = accessoriesFor("all");
  let renderOk = 0;
  const renderBad: string[] = [];
  for (const item of accItems) {
    const bare: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e", markings: [], scars: [], acc: {} };
    const withItem: CustomSkin = { ...bare };
    item.apply(withItem);
    if (!item.isOn(withItem)) {
      renderBad.push(`${item.id}: apply did not equip`);
      continue;
    }
    let allOk = true;
    for (const pose of ANCHOR_POSES) {
      const baseOps = draw(bare, pose);
      const itemOps = draw(withItem, pose);
      if (itemOps <= baseOps) {
        allOk = false;
        renderBad.push(`${item.id}: no extra draw ops in ${pose} (${itemOps} <= ${baseOps})`);
        break;
      }
    }
    if (allOk) renderOk++;
  }
  check(renderOk === accItems.length, `all ${accItems.length} accessories draw extra ops in all ${ANCHOR_POSES.length} anchor poses (${renderOk}/${accItems.length})${renderBad.length ? " — first: " + renderBad[0] : ""}`);

  // fur styles visibly change the silhouette
  for (const style of ["thick", "scruffy", "tufted"] as const) {
    const bare: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e", furLength: 1 };
    const styled: CustomSkin = { ...bare, furLength: 1.2, furStyle: style };
    let okStyle = true;
    for (const pose of ["sit", "walk"] as CatPose[]) {
      if (draw(styled, pose) <= draw(bare, pose)) okStyle = false;
    }
    check(okStyle, `fur style "${style}" draws extra fur geometry`);
  }

  // face + nose rendering
  const bareFace: CustomSkin = { fur: "#d96b2f", furDark: "#8a4a20", eye: "#4fae6e" };
  const faces = ["forehead-tabby", "forehead-dot", "cheek-ruff", "cheek-patch", "eyeshadow", "brows"];
  let faceOk = 0;
  for (const f of faces) {
    if (draw({ ...bareFace, face: f }, "sit") > draw(bareFace, "sit")) faceOk++;
  }
  check(faceOk === faces.length, `all ${faces.length} face markings render`);
  // nose: color change, not op-count change — assert via recorded fill colors
  draw({ ...bareFace, nose: "liver" }, "sit");
  const liverOn = fillHad("#7a4a3a");
  draw(bareFace, "sit");
  const liverOff = fillHad("#7a4a3a");
  check(liverOn && !liverOff, "nose color renders (liver) and default nose differs");
  check(draw({ ...bareFace, pattern: "mackerel", patternIntensity: 1 }, "sit") > 0, "intensity-driven pattern renders");

  // multi-accessory cat: every slot equipped at once still renders per pose
  const loaded: CustomSkin = {
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#d9a83a", eye2: "#9cc2ea",
    pattern: "calico", furLength: 1.3, furStyle: "tufted", tail: "fluffy", ears: "tufted",
    markings: ["chest", "paws", "tailtip"], scars: ["cheek", "leg"],
    acc: { head: "flowercrown", ear: "berry", neck: "charm", body: "satchel", paw: "bracelet", tail: "bow" },
    accColor: "#b07ad9", nose: "liver", face: "cheek-ruff",
  };
  let loadedOk = true;
  for (const pose of ["walk", "sit", "sleep", "swim", "groom", "stretch", "shake", "dance1", "dance3", "dance4", "stalk", "pounce", "leap", "play", "bow", "challenge", "crouch", "lie", "sniff", "scratch", "yawn"] as CatPose[]) {
    try {
      if (draw(loaded, pose) === 0) loadedOk = false;
    } catch {
      loadedOk = false;
    }
  }
  check(loadedOk, "fully-loaded cat (6 accessories + markings + scars) renders in all 21 poses");
}

console.log("\n--- randomizer validity ---");
{
  const validAccIds = new Map<string, string>(); // slot value -> catalog item id
  for (const i of accessoriesFor("all")) {
    const slot = (Object.entries(ACC_SLOT_CATS) as [string, string][]).find(([, c]) => c === i.category)?.[0];
    if (slot) {
      const prefix = { head: "hd-", ear: "er-", neck: "nk-", body: "bd-", paw: "pw-", tail: "tl-" }[slot]!;
      if (i.id.startsWith(prefix)) validAccIds.set(i.id.slice(prefix.length), i.id);
    }
  }
  const markingIds = new Set(CAT_ITEMS.filter((i) => i.category === "markings").map((i) => i.id.replace("mk-", "")));
  const scarIds = new Set(CAT_ITEMS.filter((i) => i.category === "scars").map((i) => i.id.replace("sc-", "")));
  const patternIds = new Set(CAT_ITEMS.filter((i) => i.category === "patterns").map((i) => i.id.replace("pat-", "")));
  let randOk = 0;
  const N = 80;
  for (let k = 0; k < N; k++) {
    const s = randomSkin();
    const okCat =
      typeof s.fur === "string" && COAT_COLORS.some((c) => c.hex === s.fur) &&
      typeof s.furDark === "string" &&
      typeof s.eye === "string" && EYE_COLORS.some((c) => c.hex === s.eye) &&
      (!s.pattern || patternIds.has(s.pattern)) &&
      (s.markings ?? []).every((m) => markingIds.has(m)) &&
      (s.scars ?? []).every((m) => scarIds.has(m)) &&
      Object.values(s.acc ?? {}).every((v) => validAccIds.has(v)) &&
      (!s.accColor || ACCESSORY_COLORS.includes(s.accColor)) &&
      (s.eye2 === undefined || s.eye2 !== s.eye);
    if (okCat) randOk++;
  }
  check(randOk === N, `randomSkin produces ${N}/${N} valid appearances`);
  // randomized cats render everywhere
  let renderOk = 0;
  const probe = new Proxy({}, {
    get: (_t, prop: string) => (prop === "canvas" ? { width: 10, height: 10 } : () => undefined),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  for (let k = 0; k < 12; k++) {
    try {
      drawCat(probe, randomSkin() as never, 50, 50, 1, "walk", 0.5, 0);
      renderOk++;
    } catch { /* counted below */ }
  }
  check(renderOk === 12, "randomized cats render without throwing (12/12)");
}

console.log(failures === 0 ? "\nALL CUSTOMIZATION CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
