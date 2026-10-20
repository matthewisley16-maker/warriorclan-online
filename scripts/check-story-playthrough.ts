// §CINEMATIC end-to-end playthrough — REAL story player + REAL game engine.
//
// This is the closest thing to playing the cutscenes on this host (there is no
// browser automation): the production `StoryCutscenePlayer` drives the actual
// `GameCanvas` — real world, real camera, real cat animation, real input
// pipeline — and the scene is played line by line with E.
//
// It checks what a player would notice:
//   • the camera opens wide, moves into close-ups and back to two-shots;
//   • the cats act (someone walks, turns, reacts) while lines change;
//   • pressing E advances WITHOUT restarting the scene or stacking boxes;
//   • movement input does nothing during the scene, and works again after it;
//   • the camera returns to gameplay framing and the player can walk away.
//
// Run: bun scripts/check-story-playthrough.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://game.test/play" });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- deterministic frame loop + clock (the engine must not free-run) -------
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {
  rafCb = null;
};
// Keep the user-timing API React's dev build expects; only the clock is ours.
const realPerf = globalThis.performance;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: {
    now: () => simNow,
    timeOrigin: realPerf.timeOrigin,
    mark: (name: string) => ({ name }),
    measure: (name: string) => ({ name, duration: 0 }),
    getEntries: () => [],
    getEntriesByName: () => [],
    clearMarks: () => undefined,
    clearMeasures: () => undefined,
  },
});

// --- a 2D context that accepts every drawing call --------------------------
type AnyFn = (...a: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };
function fakeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return fakeCanvasEl();
      return () => undefined;
    },
    set() {
      return true;
    },
  });
}
function fakeCanvasEl() {
  return {
    width: 1280,
    height: 720,
    style: {},
    getContext: () => fakeCtx(),
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  };
}
const mainCanvas = fakeCanvasEl();
const docAny = document as unknown as { createElement: (tag: string, o?: unknown) => HTMLElement };
const realCreate = docAny.createElement.bind(document);
docAny.createElement = ((tag: string, o?: unknown) =>
  tag === "canvas" ? (fakeCanvasEl() as unknown as HTMLElement) : realCreate(tag, o)) as typeof docAny.createElement;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StoryCutscenePlayer } from "../src/pages/StoryCutscenePlayer";
import { STORY_BEATS } from "../src/game/storyCinematics";
import { STAGED_STEPS, escortForStep } from "../src/game/storyStaging";
import type { GameCanvas } from "../src/game/engine";

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function frame(n = 1) {
  for (let i = 0; i < n; i++) {
    simNow += 16.7;
    const cb = rafCb;
    rafCb = null;
    cb?.(simNow);
  }
}
function boxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-story-dialogue]"));
}
async function waitFor(pred: () => boolean, label: string, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await act(async () => {
      frame(6);
      await sleep(12);
    });
  }
  if (!pred()) console.error(`  (timed out waiting for: ${label})`);
}

const { GameCanvas } = await import("../src/game/engine");
const noop = () => undefined;
const g = new GameCanvas(mainCanvas as unknown as HTMLCanvasElement, { x: 89 * 32, y: 86 * 32 }, {
  onAreaChange: noop,
  onNearby: noop,
  onMove: noop,
  onInteract: noop,
  onPreyCaught: noop,
  onClock: noop,
  onWeatherChange: noop,
  onInteriorChange: noop,
  onConvoEnd: noop,
  onRemoteAnim: noop,
  onRemoteVocal: noop,
  onWaypoint: noop,
  onStoryWaypoint: noop,
  onDeath: noop,
  onEmfx: noop,
} as never);
g.setStoryContext("story", 3);

// stage the camp arrival exactly as the story layer does
const staged = STAGED_STEPS["s4-the-camp"];
const guide = escortForStep("s4-the-camp")?.npcId;
g.teleport(staged.scene!.x, staged.scene!.y + 40);
for (const role of staged.npcs) {
  if (role.npcId === "player" || !g.getNpcWorldPos(role.npcId)) continue;
  if (role.npcId === guide) {
    g.placeNpcForStory(role.npcId, staged.scene!.x + 46, staged.scene!.y + 92, "player", "sit");
  } else {
    g.placeNpcForStory(role.npcId, role.x, role.y, role.face, role.pose === "crouch" ? "crouch" : "sit");
  }
}
frame(5);

const host = document.createElement("div");
document.body.appendChild(host);
const root: Root = createRoot(host);
let done = 0;
await act(async () => {
  root.render(
    createElement(StoryCutscenePlayer, {
      beat: STORY_BEATS["s4-the-camp"],
      game: g as unknown as GameCanvas,
      onDone: () => {
        done += 1;
      },
    }),
  );
});

console.log("— camp arrival, played end to end —");
await waitFor(() => boxes().length === 1, "the shared box opens");
frame(20);

const startPos = g.engineState();
const shots: { zoom: number; x: number; y: number }[] = [];
let maxBoxes = boxes().length;
const observer = setInterval(() => {
  maxBoxes = Math.max(maxBoxes, boxes().length);
}, 8);

// movement must be dead while the scene plays
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
  frame(25);
  await sleep(10);
});
window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
const afterHold = g.engineState();
check(Math.hypot(afterHold.x - startPos.x, afterHold.y - startPos.y) < 2, "the player cannot walk during the scene");

// walk the whole script with E, letting the engine run between lines
const beat = STORY_BEATS["s4-the-camp"];
for (let i = 0; i < beat.lines.length; i++) {
  await act(async () => {
    frame(55);
    await sleep(8);
  });
  const cam = g.cinematicCamera();
  shots.push({ zoom: cam.zoom, x: cam.x, y: cam.y });
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    frame(4);
    await sleep(12);
  });
}
clearInterval(observer);

check(shots[0].zoom < 1.2, "the arrival opens on an establishing (wide) shot", `zoom ${shots[0].zoom.toFixed(2)}`);
check(Math.max(...shots.map((s) => s.zoom)) > 1.6, "the scene moves into close framing", `max zoom ${Math.max(...shots.map((s) => s.zoom)).toFixed(2)}`);
check(new Set(shots.map((s) => s.zoom.toFixed(2))).size >= 3, "the camera changes shot several times", shots.map((s) => s.zoom.toFixed(2)).join(" → "));
check(Math.hypot(shots[shots.length - 1].x - shots[0].x, shots[shots.length - 1].y - shots[0].y) > 30, "the camera pans between subjects");
check(maxBoxes === 1, "never a second dialogue box (no stacked cutscene UI)", `${maxBoxes}`);

await waitFor(() => done > 0, "the scene finishes");
await waitFor(() => boxes().length === 0, "the box closes");
check(done === 1, "the scene ends exactly once", `${done}`);

// gameplay comes back: camera returns AND the cat can walk again
await act(async () => {
  frame(120);
  await sleep(10);
});
const back = g.cinematicCamera();
check(Math.abs(back.zoom - 1) < 0.08, "the camera returns to gameplay zoom", `zoom ${back.zoom.toFixed(2)}`);
const beforeWalk = g.engineState();
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
  frame(40);
  await sleep(10);
});
window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
const afterWalk = g.engineState();
check(Math.abs(afterWalk.x - beforeWalk.x) > 3, "player control works again after the cutscene", `${Math.abs(afterWalk.x - beforeWalk.x).toFixed(1)}px`);

// Graypaw really crossed the clearing during the scene (no teleport)
const gp = g.getNpcWorldPos("graypaw");
check(Boolean(gp), "Graypaw is still in the world after the scene");

await act(async () => root.unmount());
host.remove();

// ---------------------------------------------------------------------------
// The opening forest encounter: Graypaw bursts out and the cats act it out.
// ---------------------------------------------------------------------------
console.log("— forest encounter, played end to end —");
g.clearCinematic();
g.setStoryContext("story", 2);
const s3 = STAGED_STEPS["s3-graypaw"];
const gpRole = s3.npcs.find((n) => n.npcId === "graypaw")!;
g.teleport(s3.scene!.x, s3.scene!.y + 40);
g.placeNpcForStory("graypaw", gpRole.x, gpRole.y, gpRole.face, "sit");
frame(20);
const gpStart = g.getNpcWorldPos("graypaw")!;

const host2 = document.createElement("div");
document.body.appendChild(host2);
const root2: Root = createRoot(host2);
let done2 = 0;
await act(async () => {
  root2.render(
    createElement(StoryCutscenePlayer, {
      beat: STORY_BEATS["s3-graypaw"],
      game: g as unknown as GameCanvas,
      onDone: () => {
        done2 += 1;
      },
    }),
  );
});
await waitFor(() => boxes().length === 1, "the encounter box opens");

const encBeat = STORY_BEATS["s3-graypaw"];
const encZooms: number[] = [];
const gpSeen: { x: number; y: number }[] = [];
let encMaxBoxes = boxes().length;
const ob2 = setInterval(() => {
  encMaxBoxes = Math.max(encMaxBoxes, boxes().length);
}, 8);
for (let i = 0; i < encBeat.lines.length; i++) {
  await act(async () => {
    frame(50);
    await sleep(8);
  });
  encZooms.push(g.cinematicCamera().zoom);
  const gp = g.getNpcWorldPos("graypaw");
  if (gp) gpSeen.push(gp);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    frame(4);
    await sleep(10);
  });
}
// the encounter ends on the book's choice: answer it
await waitFor(() => (boxes()[0]?.querySelectorAll("button").length ?? 0) > 0, "the encounter offers its choice");
await act(async () => {
  boxes()[0]?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  frame(10);
  await sleep(20);
});
await waitFor(() => done2 > 0, "the encounter finishes", 8000);
clearInterval(ob2);
await waitFor(() => boxes().length === 0, "the encounter box closes");

const gpEnd = g.getNpcWorldPos("graypaw")!;
check(encZooms[0] < 1.2, "the encounter opens on the forest (wide)", `zoom ${encZooms[0].toFixed(2)}`);
check(Math.max(...encZooms) > 1.6, "the encounter uses real close-ups", `max ${Math.max(...encZooms).toFixed(2)}`);
check(Math.hypot(gpEnd.x - gpStart.x, gpEnd.y - gpStart.y) > 15, "Graypaw physically advances during the encounter", `${Math.hypot(gpEnd.x - gpStart.x, gpEnd.y - gpStart.y).toFixed(0)}px`);
check(new Set(gpSeen.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`)).size > 2, "he moves while the lines are playing (not after the scene)");
check(encMaxBoxes === 1, "the encounter never stacks a second box", `${encMaxBoxes}`);
check(done2 === 1, "the encounter ends once");

await act(async () => {
  frame(120);
  await sleep(10);
});
check(Math.abs(g.cinematicCamera().zoom - 1) < 0.08, "gameplay framing returns after the encounter", `zoom ${g.cinematicCamera().zoom.toFixed(2)}`);
const p1 = g.engineState();
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
  frame(40);
  await sleep(10);
});
window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
const p2 = g.engineState();
check(Math.abs(p2.x - p1.x) > 3, "the player walks again after the encounter", `${Math.abs(p2.x - p1.x).toFixed(1)}px`);

await act(async () => root2.unmount());
host2.remove();

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
