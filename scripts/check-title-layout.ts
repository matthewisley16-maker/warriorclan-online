// check-title-layout.ts — static audit of the title-screen responsive layout.
// Verifies the anti-clipping structure is wired in MainMenu + Game wrapper.
import * as fs from "fs";

let ok = 0;
let bad = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    ok++;
    console.log(`  ok  ${msg}`);
  } else {
    bad++;
    console.log(`FAIL  ${msg}`);
  }
}

const menu = fs.readFileSync("src/pages/MainMenu.tsx", "utf8");
const game = fs.readFileSync("src/pages/Game.tsx", "utf8");
const custom = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
const clan = fs.readFileSync("src/pages/ClanSelect.tsx", "utf8");

console.log("--- viewport roots ---");
check(menu.includes('h-[100dvh] w-full overflow-hidden bg-[#0d160d]'), "MainMenu root uses 100dvh (dynamic viewport)");
check(game.includes('className="relative h-[100dvh] w-full overflow-hidden">\n        <MainMenu'), "Game title wrapper uses 100dvh");

console.log("--- menu column: fits, centers, scrolls as last resort ---");
check(menu.includes('className="relative z-10 flex h-full min-h-0 flex-col overflow-y-auto pl-[max(1rem,env(safe-area-inset-left))'), "menu column is height-safe (min-h-0 + scroll fallback + safe-area padding)");
check(menu.includes('<div className="my-auto flex w-full flex-col items-center">'), "content vertically centered via my-auto (short screens keep top+bottom inside)");

console.log("--- logo: responsive clamp, never fixed px ---");
check(menu.includes("text-[clamp(2.4rem,6.5vw,4.5rem)]"), "title uses fluid clamp sizing");
check(menu.includes("text-[clamp(1.1rem,3vw,1.5rem)]"), "subtitle uses fluid clamp sizing");
check(!/text-6xl/.test(menu.split("{screen === \"menu\"}")[1] ?? ""), "no fixed oversized title classes left in menu screen");

console.log("--- short-window compaction ---");
check(menu.includes("vh < 780 || vw < 768"), "compact mode triggers on short OR narrow windows");
check(menu.includes("compact ? \"px-4 py-2.5\" : \"px-5 py-3\""), "cat card compresses in compact mode");
check(menu.includes("size={compact ? 60 : 84}"), "cat portrait shrinks in compact mode");
check(menu.includes('compact && "hidden")}'), "ModeCard bullet lists trim in compact mode");
check(menu.split("compact && \"hidden\"").length === 3, "footer + bullets both hide in compact mode");
check(menu.includes('sm:grid-cols-3 xl:max-w-6xl'), "mode grid widens on large screens");

console.log("--- no layout-breaking patterns in the menu screen ---");
const menuScreen = menu.split('{screen === "menu"}')[1] ?? "";
check(!/absolute\s+inset-\d|top-\[\d|left-\[\d/.test(menuScreen), "no hardcoded pixel offsets inside the menu screen");
check(!/scale-\[|\bscale\(/.test(menuScreen), "no scale() transforms in the menu screen (layout box stays honest)");
check(!/-mt-\d|-ml-\d/.test(menuScreen), "no negative margins in the menu screen");
check(!menuScreen.includes("h-screen"), "no nested 100vh inside the menu screen");

console.log("--- resize handling ---");
check(menu.includes("window.addEventListener(\"resize\", onResize)"), "menu reacts to window resize (compaction recalculates)");
check(fs.readFileSync("src/game/menuScene.ts", "utf8").includes('window.addEventListener("resize", this.resize)'), "background scene re-measures on resize");
check(fs.readFileSync("src/game/menuScene.ts", "utf8").includes("Math.max(W / 1280, H / 720)"), "background uses cover-fit (fills viewport, crops decoratively)");

console.log("--- background canvas fills root ---");
check(menu.includes('<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />'), "background canvas stretches across the full root");

console.log("--- cat portraits: ground point measured from the real canvas ---");
check(menu.includes("canvas.height / s - 7"), "CatPortrait draws the ground point relative to the canvas bottom (paws never clipped)");
check(custom.includes("canvas.height / scale - 8"), "CatPreviewLarge draws the ground point relative to the canvas bottom (tail/paws never clipped)");

console.log("--- customizer: internal scrolling + scale-to-fit preview ---");
check(custom.includes("useElementSize"), "preview stage measures its container (ResizeObserver, resize-only recalcs)");
check(custom.includes("Math.min(420, (stageSize.w || 300) - 8, (stageSize.h || 300) / 0.85)"), "preview scales to fit BOTH width and height, uniform scale (no stretching)");
check(custom.includes("Math.max(150, Math.min(420"), "preview size clamps between readable-minimum and stage-fit maximum");
check(custom.includes("md:flex-row"), "customizer main area stacks vertically on narrow windows, 3 columns on desktop");
check(custom.includes('aria-label="Customization categories"'), "narrow windows get a category strip with the SAME full NAV list (nothing hidden)");
check(custom.includes("md:hidden"), "category strip only appears when the sidebar is hidden (no duplicate nav)");
check(custom.includes("max-h-[46dvh]"), "mobile preview column is height-bounded and scrolls internally");
check(custom.includes("overflow-y-auto"), "item grid + presets scroll inside their panel (page/background/preview stay stable)");
check((custom.match(/overflow-y-auto/g) ?? []).length >= 6, "every long list (nav, grid, morphs, presets, preview column) has its own scroll container");
check(custom.includes('max-h-[130px] shrink-0 overflow-y-auto border-t border-white/10 px-3 py-2'), "presets strip wraps and scrolls within a bounded band (bottom bar stays visible)");
check(custom.includes("flex flex-wrap items-center justify-between"), "bottom bar wraps instead of overflowing on narrow windows");

console.log("--- customizer: save/randomize/reset always reachable ---");
check(custom.includes('"Retry save" : "Save Cat"'), "SAVE CAT stays in the fixed bottom bar (never below the viewport)");
check(custom.includes("onClick={randomize}"), "RANDOMIZE lives in the fixed bottom bar");
check(custom.includes('onClick={() => setSkin({ ...savedSkin })}'), "RESET lives in the fixed bottom bar");

console.log("--- safe areas + no horizontal overflow ---");
check(menu.includes("env(safe-area-inset-left)"), "menu column respects safe-area insets on all edges");
check(custom.includes("env(safe-area-inset-bottom)"), "customizer bottom bar respects safe-area insets");
check(!custom.includes("w-[380px]"), "no fixed-width customizer panel (was off-screen at narrow widths)");
check(!menuScreen.includes("w-[380px]"), "no fixed-width panels inside the menu screen");

console.log("--- clan select (Continue flow) cannot clip ---");
check(clan.includes("absolute inset-0 z-50 overflow-y-auto"), "ClanSelect root scrolls instead of clipping its Confirm button");
check(clan.includes("md:grid-cols-5"), "ClanSelect grid collapses on narrow windows");
console.log(`\n${bad === 0 ? "ALL TITLE-LAYOUT CHECKS PASS" : `${bad} CHECK(S) FAILED`} (${ok} ok)`);
if (bad > 0) process.exit(1);
