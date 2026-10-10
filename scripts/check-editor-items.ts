// Item-editor (CatCustomizer) render test.
//
// Renders the REAL editor component with react-dom/server and asserts the real
// catalog is on screen — the panel is not allowed to be empty, and every
// category the nav offers must actually contain items:
//
//   - the catalog itself is present and populated (never an empty panel)
//   - every nav entry maps to a NON-EMPTY item list (same function the UI
//     renders from), i.e. "switch through every category" is verifiable
//   - the default view renders the real item cards by name, with a thumbnail
//     canvas per card, the search box and the panel header/count
//   - selecting an item applies it to the skin and reads back as selected
//     (the same apply/isOn pair the click handler uses)
//   - morphs + WARRIORS presets are populated and searchable
//   - the failure states exist: a bad view shows an error + Retry, an absent
//     catalog says so, a no-match search says so (never a blank panel)
//   - regressions: no hook after the `if (!open) return null` early return
//     (that mismatch tears the editor down), and the grid keeps a height
//     floor + scroll so it can never be crushed to a blank strip
//
// Run with: bun scripts/check-editor-items.ts

import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CatCustomizer,
  customizerNav,
  itemsForView,
  isItemGridCategory,
  characterListFor,
} from "../src/pages/CatCustomizer";
import { CAT_ITEMS, type CustomSkin } from "../src/game/catItems";
import { CAT_MORPHS, CHARACTER_PRESETS } from "../src/game/presets";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const BASE: CustomSkin = { fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e" };
const opts = { query: "", category: "fur", favorites: [] as string[], accSlot: "all" as const, accTheme: undefined };

// ---------------------------------------------------------------------------
// 1. the catalog the editor reads from
// ---------------------------------------------------------------------------

check("item catalog is populated", CAT_ITEMS.length >= 100, `items=${CAT_ITEMS.length}`);
const catCounts = new Map<string, number>();
for (const i of CAT_ITEMS) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1);
check(
  "every item category has items",
  [...catCounts.values()].every((n) => n > 0) && catCounts.size >= 14,
  `categories=${catCounts.size} ${[...catCounts.entries()].map(([k, v]) => `${k}:${v}`).join(" ")}`,
);

// ---------------------------------------------------------------------------
// 2. every nav entry the editor offers shows real items (no empty category)
// ---------------------------------------------------------------------------

const nav = customizerNav(0);
check("nav offers the full catalog view", nav.some((n) => n.id === "all" && n.count === CAT_ITEMS.length));

const emptyViews: string[] = [];
for (const entry of nav) {
  if (entry.id === "favorites") {
    check("favorites view is empty only because nothing is favorited", entry.count === 0 && itemsForView({ ...opts, category: "favorites" }).length === 0);
    continue;
  }
  if (entry.id === "morphs") {
    check(`morphs view has ${CAT_MORPHS.length} morphs`, CAT_MORPHS.length > 0);
    continue;
  }
  if (entry.id === "warriors") {
    check(`warriors view has ${CHARACTER_PRESETS.length} presets`, CHARACTER_PRESETS.length > 0);
    continue;
  }
  if (!isItemGridCategory(entry.id)) continue;
  const items = itemsForView({ ...opts, category: entry.id });
  if (items.length === 0) emptyViews.push(entry.id);
  if (items.length !== entry.count) emptyViews.push(`${entry.id}(count ${entry.count}≠${items.length})`);
}
check("every item category renders a non-empty grid", emptyViews.length === 0, `empty=[${emptyViews.join(",")}]`);
check(
  "nothing empty is advertised: nav omits categories with no items",
  nav.filter((n) => isItemGridCategory(n.id)).every((n) => n.id === "favorites" || n.count > 0),
);
check("accessories umbrella covers every slot", itemsForView({ ...opts, category: "accessories" }).length >= 40, `${itemsForView({ ...opts, category: "accessories" }).length}`);
check("collars category is populated", itemsForView({ ...opts, category: "collars" }).length >= 18, `${itemsForView({ ...opts, category: "collars" }).length}`);
check("search across the whole catalog works", itemsForView({ ...opts, query: "collar" }).length > 5);
check(
  "character search filters the preset library",
  characterListFor("Firestar", "all").some((p) => p.displayName.toLowerCase().includes("firestar")) &&
    characterListFor("", "all").length === CHARACTER_PRESETS.length,
);

// ---------------------------------------------------------------------------
// 3. the REAL editor renders those items
// ---------------------------------------------------------------------------

function renderEditor(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(CatCustomizer, {
      open: true,
      playerName: "Checker",
      initialSkin: BASE,
      savedSkin: BASE,
      favorites: [],
      presets: [],
      onClose: () => undefined,
      onSave: () => undefined,
      onPersist: () => undefined,
      ...props,
    } as never),
  );
}

const html = renderEditor();
const furItems = CAT_ITEMS.filter((i) => i.category === "fur");
const missingNames = furItems.filter((i) => !html.includes(i.name)).map((i) => i.name);
check(
  `default view shows all ${furItems.length} fur items by name`,
  missingNames.length === 0,
  `missing=[${missingNames.join(",")}]`,
);
const cards = html.split('class="group relative rounded-xl border p-1.5').length - 1;
check("default view renders one card per item", cards === furItems.length, `cards=${cards} items=${furItems.length}`);
check("item thumbnails are canvases", (html.split("<canvas").length - 1) >= furItems.length, `canvases=${html.split("<canvas").length - 1}`);
check("panel header shows the category and its count", html.includes("Fur") && html.includes(">8<"));
check("search box is present", html.includes("Search all items"));
check("category nav lists every category", ["Fur", "Colors", "Patterns", "Ears", "Collars", "Accessories", "Morphs", "Warriors Presets", "All Items"].every((n) => html.includes(n)));
check("save/cancel controls are present", html.includes("Save Cat") || html.includes("Saving") || html.includes("Retry save"));
check("no failure state is rendered with a healthy catalog", !html.includes("could not be built") && !html.includes("No items are available"));

// a favorites view must resolve to the favorited items, not an empty panel
// (the view is driven by state, which SSR cannot click — so it is asserted
// through the same function the grid renders from, plus the nav count)
{
  const favItem = CAT_ITEMS.find((i) => i.category === "eyes")!;
  const favList = itemsForView({ ...opts, category: "favorites", favorites: [favItem.id] });
  check("favorited items appear in the favorites view", favList.length === 1 && favList[0].id === favItem.id, `n=${favList.length}`);
  check("the nav badge counts favorites", customizerNav(3).find((n) => n.id === "favorites")?.count === 3);
}

// ---------------------------------------------------------------------------
// 4. selecting items really customizes the cat
// ---------------------------------------------------------------------------

const clickable = CAT_ITEMS.filter((i) => ["fur", "colors", "patterns", "ears", "tail", "head", "collars", "markings", "scars", "eyes", "face"].includes(i.category));
let notApplied: string[] = [];
let notSelected: string[] = [];
for (const item of clickable) {
  const next: CustomSkin = { ...BASE, markings: [], scars: [], acc: {} };
  const wasOn = item.isOn(next); // already equipped (e.g. the default eye color)
  const before = JSON.stringify(next);
  item.apply(next);
  // an item that was NOT selected must visibly change the cat when selected
  if (!wasOn && JSON.stringify(next) === before) notApplied.push(item.id);
  if (!item.isOn(next)) notSelected.push(item.id);
}
check("clicking an unselected item changes the cat", notApplied.length === 0, `no-op=[${notApplied.join(",")}]`);
check("applied items read back as selected", notSelected.length === 0, `unselected=[${notSelected.join(",")}]`);

// accessory selection is exclusive per slot and toggles off on re-click
let accOk = 0;
for (const slot of ["head", "ear", "neck", "body", "paw", "tail"] as const) {
  const first = CAT_ITEMS.find((i) => i.category === (slot === "tail" ? "tailAcc" : slot === "neck" ? "collars" : slot));
  if (!first) continue;
  const s: CustomSkin = { ...BASE, acc: {} };
  first.apply(s);
  if (!first.isOn(s)) continue;
  first.apply(s); // re-click = unequip
  if (first.isOn(s)) continue;
  accOk++;
}
check("accessories equip per slot and toggle off", accOk >= 5, `slots=${accOk}`);

// ---------------------------------------------------------------------------
// 5. failure states exist (never a silently blank panel)
// ---------------------------------------------------------------------------

const src = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
check(
  "a view that fails to build shows an error message + Retry",
  /The item list could not be built\./.test(src) && /Retry/.test(src) && /console\.error\("\[customizer\] failed to build the item list"/.test(src),
);
check(
  "an empty catalog is distinguishable from an empty search",
  /No items are available\./.test(src) && /No items match/.test(src) && /The customization catalog loaded empty/.test(src),
);
check("the morphs grid has its own empty state", /No morphs are available\./.test(src));
check(
  "a failed thumbnail falls back to an icon and is logged",
  /\[customizer\] item thumbnail failed to render/.test(src) && /drawFailed/.test(src),
);

// ---------------------------------------------------------------------------
// 6. regression guards for the editor's structure
// ---------------------------------------------------------------------------

const earlyReturn = src.indexOf("if (!open) return null;");
const lastMemo = src.lastIndexOf("useMemo(");
check(
  "no hook is called after the `!open` early return (stable hook order)",
  earlyReturn > -1 && lastMemo > -1 && lastMemo < earlyReturn,
  `earlyReturn@${earlyReturn} lastMemo@${lastMemo}`,
);
check("the panel uses the shared view function (single source of truth)", /itemsForView\(\{ query, category, favorites, accSlot, accTheme \}\)/.test(src));
check(
  "the item column keeps a height floor and the middle section scrolls",
  /min-h-\[260px\] w-full flex-1 flex-col/.test(src) && /md:min-h-0 md:w-\[360px\]/.test(src) && /overflow-y-auto md:flex-row md:overflow-hidden/.test(src),
);
check(
  "the item grid can scroll inside its column",
  /grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto/.test(src),
);

console.log(failures === 0 ? "\nALL ITEM-EDITOR TESTS PASSED" : `\n${failures} ITEM-EDITOR TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
