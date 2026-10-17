// §CHUNK-RECOVERY behavioural test — the reported failure:
//
//   Failed to fetch dynamically imported module:
//   https://warriorcatsclanrpggame260.freebuff.app/assets/Game-Kcm-Sqw6.js
//
// That is what a tab sees when it was booted from an older shell: the deploy
// replaced the hashed chunks, so `import("./pages/Game.tsx")` asks for a file
// that no longer exists. This test drives the REAL production helpers
// (`recoverableImport` / `reloadForFreshBuild`) in a REAL DOM and asserts:
//
//   • the exact browser message is recognised (both Chrome and Firefox/Safari
//     wordings), and ordinary app errors are NOT treated as stale chunks;
//   • a stale chunk starts exactly one shell reload, cache-busted, and leaves
//     the route pending so Suspense keeps its fallback instead of crashing;
//   • a second failure inside the window does NOT reload again (no loop) and
//     surfaces the error so the player gets the "reload" card;
//   • the cache-bust marker is stripped once the fresh shell boots;
//   • main.tsx actually uses these helpers for every lazy route.
//
// Run: bun scripts/check-chunk-recovery.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
// A real origin matters here: recovery rewrites location, so the harness must
// not start from about:blank.
GlobalRegistrator.register({ url: "https://game.test/play" });

import { readFileSync } from "node:fs";
import {
  forceFreshReload,
  initChunkRecovery,
  isChunkLoadError,
  recoverableImport,
  reloadForFreshBuild,
} from "../src/lib/chunkRecovery";

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail = "") {
  checks++;
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const RETRY_KEY = "wcrpg:chunk-recovery:at";
const slate = () => window.sessionStorage.clear();
const marked = () => Number(window.sessionStorage.getItem(RETRY_KEY) ?? 0) > 0;

/** Capture location.replace() without letting happy-dom navigate away. */
const replacements: string[] = [];
let replaceStubbed = false;
try {
  Object.defineProperty(window.location, "replace", {
    configurable: true,
    writable: true,
    value: (url: string) => {
      replacements.push(String(url));
    },
  });
  replaceStubbed = typeof window.location.replace === "function";
} catch {
  replaceStubbed = false;
}

const chunkError = (href: string) =>
  new TypeError(`Failed to fetch dynamically imported module: ${href}`);

// ---------------------------------------------------------------------------
// 1) Classification — the exact report, other engines, and non-chunk errors
// ---------------------------------------------------------------------------
console.log("— error classification —");
check(
  isChunkLoadError(chunkError("https://warriorcatsclanrpggame260.freebuff.app/assets/Game-Kcm-Sqw6.js")),
  "recognises the exact reported failure (Chrome wording + absolute URL)",
);
check(
  isChunkLoadError(new TypeError("Importing a module script failed.")),
  "recognises the Safari wording",
);
check(
  isChunkLoadError(new Error('error loading dynamically imported module: /assets/Game-abc.js')),
  "recognises the Firefox wording",
);
check(
  isChunkLoadError({ message: "Failed to fetch dynamically imported module: /assets/x.js" }),
  "recognises a non-Error rejection carrying the message",
);
check(!isChunkLoadError(new Error("Cannot read properties of null (reading 'useMemo')")), "does NOT treat a hook crash as a stale chunk");
check(!isChunkLoadError(new TypeError("Failed to fetch")), "does NOT treat a plain network failure as a stale chunk");
check(!isChunkLoadError(undefined) && !isChunkLoadError(""), "handles empty/absent errors without throwing");

// ---------------------------------------------------------------------------
// 2) A stale chunk reloads the shell exactly once, cache-busted
// ---------------------------------------------------------------------------
console.log("— recovery on a stale chunk —");
check(replaceStubbed, "location.replace is capturable in this DOM (harness sane)");
slate();
replacements.length = 0;

let settled = false;
const pending = recoverableImport(() => Promise.reject(chunkError("/assets/Game-OLD.js"))).then(
  () => {
    settled = true;
    return "resolved";
  },
  () => {
    settled = true;
    return "rejected";
  },
);
await new Promise((r) => setTimeout(r, 60));
check(!settled, "route import stays pending while the fresh shell is fetched (no error boundary, no blank screen)");
check(marked(), "recovery is recorded so a broken deploy cannot loop");
check(replacements.length === 1, `exactly one navigation was started (got ${replacements.length})`);
check(
  replacements[0]?.includes("__v="),
  "the navigation is cache-busted, so the shell cannot come from a stale cache",
  replacements[0] ?? "no url",
);
const reloaded = new URL(replacements[0] ?? "https://invalid.test/");
check(
  reloaded.origin === "https://game.test" && reloaded.pathname === "/play",
  "it reloads the same page the player is on (not the assets path)",
  reloaded.pathname,
);

// Existing query params on the page must survive the cache-bust.
slate();
replacements.length = 0;
window.history.replaceState(null, "", "/play?mpdebug=1");
reloadForFreshBuild();
const kept = new URL(replacements[0] ?? "https://invalid.test/");
check(kept.searchParams.get("mpdebug") === "1" && kept.searchParams.has("__v"), "the cache-bust keeps the page's own query params", kept.search);
window.history.replaceState(null, "", "/play");

// ---------------------------------------------------------------------------
// 3) Second failure inside the window must not reload again
// ---------------------------------------------------------------------------
console.log("— loop guard —");
const again = reloadForFreshBuild();
check(again === false, "a second recovery inside the window is refused");
check(replacements.length === 1, "no second navigation was started");
let rejected = false;
await recoverableImport(() => Promise.reject(chunkError("/assets/Game-OLD.js"))).catch(() => {
  rejected = true;
});
check(rejected, "when recovery is exhausted the error surfaces (player gets the reload card)");

// Outside the window, recovery is allowed again (a later deploy in the same tab).
window.sessionStorage.setItem(RETRY_KEY, "1");
replacements.length = 0;
check(reloadForFreshBuild() === true, "an old attempt no longer blocks a later deploy's recovery");
check(replacements.length === 1, "that later recovery navigates once");

// ---------------------------------------------------------------------------
// 4) Ordinary errors pass straight through
// ---------------------------------------------------------------------------
console.log("— non-chunk failures are untouched —");
slate();
replacements.length = 0;
let passthrough = false;
const boom = new Error("save failed");
await recoverableImport(() => Promise.reject(boom)).catch((e) => {
  passthrough = e === boom;
});
check(passthrough, "a normal import error is rethrown unchanged");
check(replacements.length === 0, "no reload for a normal import error");

slate();
const okValue = await recoverableImport(() => Promise.resolve(42));
check(okValue === 42, "successful imports resolve untouched");

// ---------------------------------------------------------------------------
// 5) Boot hygiene — marker stripped, preload hook installed, player reload
// ---------------------------------------------------------------------------
console.log("— boot path —");
window.history.replaceState(null, "", "/play?__v=123&mpdebug=1#top");
slate();
initChunkRecovery();
const bootUrl = window.location.pathname + window.location.search + window.location.hash;
check(!bootUrl.includes("__v="), "the cache-bust marker is stripped from the address bar", bootUrl);
check(bootUrl.includes("mpdebug=1"), "other query params survive the strip", bootUrl);
check(bootUrl.endsWith("#top"), "the hash survives the strip", bootUrl);

// initChunkRecovery must have registered the Vite preload hook (it is a no-op
// in dev builds, so assert the listener exists by firing the event).
slate();
replacements.length = 0;
window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
check(
  window.sessionStorage.getItem(RETRY_KEY) === null,
  "dev builds do not reload on a preload error (no reload loop in the preview)",
);

slate();
replacements.length = 0;
initChunkRecovery({ prod: true });
window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
check(marked(), "a production preload failure triggers recovery");
check(replacements.length === 1, "and navigates exactly once", String(replacements[0] ?? "not captured"));

// Player-initiated reload always bypasses the guard.
window.sessionStorage.setItem(RETRY_KEY, String(Date.now()));
replacements.length = 0;
forceFreshReload();
check(replacements.length === 1, "the reload card's action always navigates, even inside the guard window");

// ---------------------------------------------------------------------------
// 6) main.tsx really wires it for every lazy route
// ---------------------------------------------------------------------------
console.log("— wiring —");
const main = readFileSync("src/main.tsx", "utf8");
const lazyImports = [...main.matchAll(/lazy\(\(\) => (.*?)\)\);/g)].map((m) => m[1]);
check(lazyImports.length === 5, `all five route imports were found (got ${lazyImports.length})`);
check(
  lazyImports.every((expr) => expr.includes("recoverableImport(")),
  "every lazy route goes through recoverableImport",
  lazyImports.join(" | "),
);
check(main.includes("initChunkRecovery();"), "the global preload hook is installed before render");
check(
  /isChunkLoadError\(this\.state\.message\)/.test(main),
  "the error boundary shows the reload card for a stale chunk instead of a stack trace",
);
check(main.includes("forceFreshReload()"), "that card's Reload button uses the guarded force-reload");

// ---------------------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
