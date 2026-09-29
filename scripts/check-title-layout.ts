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

console.log("--- viewport roots ---");
check(menu.includes('h-[100dvh] w-full overflow-hidden bg-[#0d160d]'), "MainMenu root uses 100dvh (dynamic viewport)");
check(game.includes('className="relative h-[100dvh] w-full overflow-hidden">\n        <MainMenu'), "Game title wrapper uses 100dvh");

console.log("--- menu column: fits, centers, scrolls as last resort ---");
check(menu.includes('className="relative z-10 flex h-full min-h-0 flex-col overflow-y-auto px-4 py-4 sm:py-6"'), "menu column is height-safe (min-h-0 + scroll fallback)");
check(menu.includes('<div className="my-auto flex w-full flex-col items-center">'), "content vertically centered via my-auto (short screens keep top+bottom inside)");

console.log("--- logo: responsive clamp, never fixed px ---");
check(menu.includes("text-[clamp(2.4rem,6.5vw,4.5rem)]"), "title uses fluid clamp sizing");
check(menu.includes("text-[clamp(1.1rem,3vw,1.5rem)]"), "subtitle uses fluid clamp sizing");
check(!/text-6xl/.test(menu.split("{screen === \"menu\"}")[1] ?? ""), "no fixed oversized title classes left in menu screen");

console.log("--- short-window compaction ---");
check(menu.includes("useViewportHeight() < 780"), "compact mode triggers below 780px height");
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

console.log(`\n${bad === 0 ? "ALL TITLE-LAYOUT CHECKS PASS" : `${bad} CHECK(S) FAILED`} (${ok} ok)`);
if (bad > 0) process.exit(1);
