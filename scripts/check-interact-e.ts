// §CHAT-FOCUS: the E key in the REAL engine.
//
// The chat overlay pauses the world (typing must never cost a cat its life on
// the Thunderpath), but that pause used to swallow E as well — so once the chat
// panel was up over a conversation, E could no longer advance the dialogue.
//
// The interaction layer now marks a CHAT-ONLY pause, which still lets the ONE
// existing E handler start/advance an interaction (the interaction then
// collapses chat). Every other pause — ESC menu, settings, map, friends, codex,
// or a dialogue window — keeps swallowing E exactly as before, and typing "e"
// into the chat input never triggers an interaction.
//
// Run: bun scripts/check-interact-e.ts

type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };
function makeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      return () => undefined;
    },
    set() {
      return true;
    },
  });
}
const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0,
  height: 0,
  style: {},
};

// a window that RECORDS the engine's key listeners so real keydowns can be fired
const listeners: Record<string, AnyFn[]> = {};
(globalThis as Record<string, unknown>).window = {
  addEventListener: (t: string, fn: AnyFn) => {
    (listeners[t] ??= []).push(fn);
  },
  removeEventListener: (t: string, fn: AnyFn) => {
    listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn);
  },
  setTimeout,
  clearTimeout,
};
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;
(globalThis as Record<string, unknown>).performance = { now: () => simNow };
function pump(ms: number) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    simNow += 16;
    rafCb?.(simNow);
  }
}

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

const { GameCanvas } = await import("../src/game/engine");

const NEARBY = { kind: "npc", label: "Talk — Graypaw", npcId: "graypaw" };
let interacted: unknown[] = [];
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 78 * 32, y: 146 * 32 }, {
  onAreaChange: () => undefined,
  onNearby: () => undefined,
  onMove: () => undefined,
  onInteract: (t: unknown) => interacted.push(t),
  onPreyCaught: () => undefined,
  onClock: () => undefined,
  onWeatherChange: () => undefined,
  onInteriorChange: () => undefined,
  onNpcIdle: () => undefined,
} as never);
pump(80);

const eng = g as unknown as { lastNearby: unknown; paused: boolean; interactWhilePaused: boolean };
eng.lastNearby = NEARBY; // standing right next to Graypaw

const KEY: Record<string, unknown[]> = {
  keydown: listeners.keydown ?? [],
  keyup: listeners.keyup ?? [],
};
check(KEY.keydown.length > 0, "the engine registered its keydown listener");

/** fire a real keydown at the engine (target = where the key was typed) */
function press(key: string, target: unknown = null) {
  const ev = { key, target, preventDefault: () => undefined, repeat: false };
  for (const fn of KEY.keydown) fn(ev as never);
}

console.log("--- unpaused: E interacts as always ---");
interacted = [];
press("e");
check(interacted.length === 1, "E with nothing open starts the interaction");
check(interacted[0] === NEARBY, "…with the real nearby target (Graypaw)");

console.log("--- E with nothing nearby changes nothing (chat must not collapse just because E was pressed) ---");
eng.lastNearby = null;
interacted = [];
press("e");
press("Enter");
check(interacted.length === 0, "no nearby target → no interaction is started (chat is left alone)");
eng.lastNearby = NEARBY;

console.log("--- every normal pause still swallows E (menus, dialogue, map…) ---");
g.setPaused(true);
interacted = [];
press("e");
press("Enter");
check(interacted.length === 0, "a menu/dialogue/map pause still blocks E and Enter");
check(eng.interactWhilePaused === false, "a plain pause never arms interaction");

console.log("--- a CHAT-ONLY pause still lets E start the interaction (the fix) ---");
g.setPaused(true, true);
interacted = [];
press("e");
check(interacted.length === 1, "E works while the chat overlay is the only thing open");
check(interacted[0] === NEARBY, "…and targets the same cat");
interacted = [];
press("Enter");
check(interacted.length === 1, "Enter behaves like E (one interaction, no duplicate handler)");

console.log("--- typing in the chat input never triggers an interaction ---");
const input = { tagName: "INPUT", isContentEditable: false };
interacted = [];
press("e", input);
press("Enter", input);
check(interacted.length === 0, "E/Enter typed into the chat box are ignored by the engine");

console.log("--- the permission is not sticky ---");
g.setPaused(true);
interacted = [];
press("e");
check(interacted.length === 0, "re-pausing plainly (no chat flag) blocks E again");
check(eng.interactWhilePaused === false, "the chat-interaction flag is cleared by the next setPaused");
g.setPaused(false, true);
interacted = [];
press("e");
check(interacted.length === 1, "unpaused works");
check(eng.interactWhilePaused === false, "an unpaused world never keeps a stale permission");

g.destroy();
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
