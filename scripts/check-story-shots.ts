// §CINEMATIC story direction — behavioural test against the REAL player.
//
// The reported problem: "the cutscenes feel too static". This drives the
// production `StoryCutscenePlayer` (React, framer-motion, the shared dialogue
// box) against a recording engine and asserts what the game actually receives:
//
//   • every authored line composes a shot around the right cats — wide to
//     establish, close-ups for speakers/reactions, two-shots for interaction;
//   • the camera is directed ONCE per line (pressing E repeatedly, or a React
//     re-render, can never replay a camera move or an acting sequence);
//   • acting cues reach the engine: NPC steps/turns/head/tail/ears, and the
//     player's own cat turns and reacts;
//   • there is still exactly ONE dialogue box, choices stay inside it, and the
//     scene ends by restoring gameplay framing and player control exactly once.
//
// Run: bun scripts/check-story-shots.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://game.test/play" });
// React 19 only flushes act() quietly in a known test environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { StoryCutscenePlayer } from "../src/pages/StoryCutscenePlayer";
import { STORY_BEATS, STORY_INTRO } from "../src/game/storyCinematics";
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
async function waitFor(pred: () => boolean, label: string, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await act(async () => {
      await sleep(20);
    });
  }
  if (!pred()) console.error(`  (timed out waiting for: ${label})`);
}
function boxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-story-dialogue]"));
}

// ---------------------------------------------------------------------------
// The recording engine: exactly the surface the player uses, nothing more.
// ---------------------------------------------------------------------------
interface FocusCall {
  shot: string;
  actors: string[];
  durMs?: number;
  points?: { x: number; y: number }[];
}
interface BeatCall {
  npcId: string;
  stepTo?: { x: number; y: number };
  face?: { x: number; y: number };
  pose?: string;
  head?: string;
  tail?: boolean;
  alert?: boolean;
  talking?: boolean;
}
interface PlayerActCall {
  face?: { x: number; y: number };
  pose?: string;
  head?: string;
  tail?: boolean;
  alert?: boolean;
  talking?: boolean;
}

function makeEngine() {
  const log = {
    focus: [] as FocusCall[],
    npcBeats: [] as BeatCall[],
    playerActs: [] as PlayerActCall[],
    control: [] as boolean[],
    clears: 0,
    clearedNpcs: [] as string[],
    playCinematic: 0,
  };
  const positions: Record<string, { x: number; y: number }> = {
    player: { x: 3000, y: 3600 },
    graypaw: { x: 3140, y: 3620 },
    bluestar: { x: 2880, y: 2760 },
  };
  const game = {
    focusCamera: (o: FocusCall) => log.focus.push({ ...o }),
    setNpcStoryBeat: (npcId: string, b: Omit<BeatCall, "npcId">) => log.npcBeats.push({ npcId, ...b }),
    clearNpcStoryBeat: (id: string) => log.clearedNpcs.push(id),
    setPlayerStoryAct: (a: PlayerActCall) => log.playerActs.push({ ...a }),
    setPlayerControlEnabled: (on: boolean) => log.control.push(on),
    clearCinematic: () => {
      log.clears++;
    },
    playCinematic: () => {
      log.playCinematic++;
    },
    engineState: () => ({ x: positions.player.x, y: positions.player.y, facing: 1, moving: false, movementState: "idle", animationState: "sit" }),
    getNpcWorldPos: (id: string) => positions[id] ?? null,
  };
  return { game: game as unknown as GameCanvas, log };
}

async function mount(beat: Parameters<typeof StoryCutscenePlayer>[0]["beat"], engine: GameCanvas) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let done = 0;
  await act(async () => {
    root.render(createElement(StoryCutscenePlayer, { beat, game: engine, onDone: () => { done += 1; } }));
  });
  return {
    host,
    root,
    done: () => done,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function pressE(times = 1) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
      await sleep(35);
    });
  }
}

// ---------------------------------------------------------------------------
// 1) The real Graypaw encounter: establish → close-ups → two-shot
// ---------------------------------------------------------------------------
console.log("— the forest encounter —");
{
  const { game, log } = makeEngine();
  const beat = STORY_BEATS["s3-graypaw"];
  const view = await mount(beat, game);
  await waitFor(() => boxes().length === 1, "the box opens");

  check(log.focus.length === 1, "the first line composes exactly one shot", `${log.focus.length}`);
  check(log.focus[0]?.shot === "wide", "the scene OPENS on a wide establishing shot", log.focus[0]?.shot ?? "none");
  check(
    log.focus[0]?.actors.includes("player"),
    "the establishing shot frames the trail the kittypet is walking",
    JSON.stringify(log.focus[0]?.actors),
  );
  check(log.control[0] === false, "the player's control is held for the scene");

  // advance through the scripted lines one by one
  const lineCount = beat.lines.length;
  const shots: string[] = [];
  let maxBoxes = boxes().length;
  const observer = setInterval(() => {
    maxBoxes = Math.max(maxBoxes, boxes().length);
  }, 10);
  for (let i = 0; i < lineCount; i++) {
    shots.push(log.focus[log.focus.length - 1]?.shot ?? "?");
    await pressE();
  }
  // the scripted lines end on the choice (the book's "show me everything"
  await waitFor(() => (boxes()[0]?.querySelectorAll("button").length ?? 0) === 1, "the encounter offers its choice");
  check(shots[0] === "wide" && shots.includes("close") && shots.includes("two"), "the encounter cuts between wide, close and two shots", shots.join(" → "));
  check(log.focus.length === lineCount + 1, "each line composed exactly one shot (plus the two-shot for the choice)", `${log.focus.length} for ${lineCount} lines`);
  check(maxBoxes === 1, "never more than one dialogue box during the scene", `${maxBoxes}`);
  check(log.focus[log.focus.length - 1]?.shot === "two", "the choice holds a two-shot");

  const beforeChoice = log.focus.length;
  await act(async () => {
    boxes()[0]?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(40);
  });
  await waitFor(() => view.done() > 0, "the encounter finishes", 8000);
  clearInterval(observer);
  check(log.focus.length === beforeChoice + 2, "the player echo and Graypaw's reply each get one shot", `${log.focus.length - beforeChoice} after choosing`);

  // acting actually reached the engine
  check(log.npcBeats.some((c) => c.npcId === "graypaw" && c.stepTo), "Graypaw walks toward the kittypet (a real step)");
  check(log.npcBeats.some((c) => c.npcId === "graypaw" && c.alert), "Graypaw's ears react during the encounter");
  check(log.npcBeats.some((c) => c.npcId === "graypaw" && c.talking), "Graypaw's mouth moves while he speaks");
  check(log.npcBeats.some((c) => c.npcId === "graypaw" && c.face), "Graypaw turns toward the player");
  check(log.playerActs.some((a) => a.face), "the player's cat turns toward the speaker");
  check(log.playerActs.some((a) => a.talking), "the player's cat moves its mouth on its own line");

  // finish: exactly one hand-back, gameplay framing restored
  await waitFor(() => boxes().length === 0, "the box closes");
  check(view.done() === 1, "the scene ends exactly once", `${view.done()}`);
  check(log.clears === 1, "the cinematic camera is cleared exactly once", `${log.clears}`);
  check(log.control.filter((v) => v === true).length >= 1, "player control is restored at the end");
  check(log.control[log.control.length - 1] === true, "the LAST control state is 'enabled'");
  check(boxes().length === 0, "no dialogue is left on screen");
  await view.unmount();
}

// ---------------------------------------------------------------------------
// 2) No duplicate animation sequences when the player advances fast
// ---------------------------------------------------------------------------
console.log("— fast advancing —");
{
  const { game, log } = makeEngine();
  const beat = {
    id: "fast-beat",
    pair: ["player", "graypaw"] as [string, string],
    lines: [
      { speaker: "Graypaw", speakerId: "graypaw", text: "One.", holdMs: 4000, shot: "close" as const, cues: [{ who: "graypaw", step: { toward: "player", gap: 60, maxPx: 30 }, alert: true }] },
      { speaker: "You", speakerId: "player", text: "Two.", holdMs: 4000, shot: "close" as const },
      { speaker: "Graypaw", speakerId: "graypaw", text: "Three.", holdMs: 4000, shot: "two" as const },
      { speaker: "Narrator", speakerId: "narrator", text: "Four.", holdMs: 4000, shot: "wide" as const },
    ],
  };
  const view = await mount(beat, game);
  await waitFor(() => boxes().length === 1, "first line");
  await pressE(2);
  await waitFor(() => (boxes()[0]?.textContent ?? "").includes("Three."), "third line");
  // the stale timer of line one and two must never re-fire a camera move
  const focusAfterThree = log.focus.length;
  check(focusAfterThree === 3, "three lines = three shots, even after skipping two", `${focusAfterThree}`);
  check(log.npcBeats.filter((b) => b.npcId === "graypaw" && b.stepTo).length === 1, "the step cue ran exactly once");
  await act(async () => {
    await sleep(120);
  });
  check(log.focus.length === focusAfterThree, "waiting on a line does not replay its camera move");
  await view.unmount();
}

// ---------------------------------------------------------------------------
// 3) Choices: two-shot, one box, then the player's own reaction
// ---------------------------------------------------------------------------
console.log("— choices —");
{
  const { game, log } = makeEngine();
  const beat = {
    id: "choice-beat",
    pair: ["player", "graypaw"] as [string, string],
    lines: [{ speaker: "Graypaw", speakerId: "graypaw", text: "Want to see camp?", holdMs: 40, shot: "close" as const }],
    choices: [
      { label: "Show me.", playerLine: "Show me.", reply: { speaker: "Graypaw", speakerId: "graypaw", text: "Follow me!", holdMs: 40, shot: "two" as const } },
    ],
  };
  const view = await mount(beat, game);
  await waitFor(() => (boxes()[0]?.querySelectorAll("button").length ?? 0) === 1, "choices render");
  const lastFocus = log.focus[log.focus.length - 1];
  check(lastFocus?.shot === "two", "the choice is offered on a two-shot (both faces stay readable)", lastFocus?.shot ?? "none");
  check(lastFocus?.actors.includes("player") && lastFocus?.actors.includes("graypaw"), "the choice shot frames the player and the cat");

  await act(async () => {
    boxes()[0]?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(40);
  });
  await waitFor(() => boxes()[0]?.getAttribute("data-speaker") === "You", "player echo");
  check(log.playerActs.some((a) => a.talking), "the player's answer is acted (mouth + turn)");
  check(boxes().length === 1, "the answer stays in the SAME box");

  await waitFor(() => (boxes()[0]?.textContent ?? "").includes("Follow me!"), "reply");
  check(log.focus[log.focus.length - 1]?.shot === "two", "the NPC's reply returns to the two-shot");
  await waitFor(() => view.done() > 0, "the choice scene ends", 5000);
  check(view.done() === 1 && log.control[log.control.length - 1] === true, "control returns after the choice");
  await view.unmount();
}

// ---------------------------------------------------------------------------
// 4) Interrupting a beat restores the camera and control
// ---------------------------------------------------------------------------
console.log("— interruption —");
{
  const { game, log } = makeEngine();
  const view = await mount(STORY_INTRO, game);
  await waitFor(() => boxes().length === 1, "intro line");
  check(log.control[0] === false, "the intro holds control");
  await view.unmount();
  check(log.control[log.control.length - 1] === true, "leaving mid-beat re-enables control");
  check(log.clears >= 1, "leaving mid-beat clears the cinematic camera");
}

// ---------------------------------------------------------------------------
// 5) Wiring: the scene layer and the engine are actually connected
// ---------------------------------------------------------------------------
console.log("— wiring —");
{
  const player = readFileSync("src/pages/StoryCutscenePlayer.tsx", "utf8");
  const cinematic = readFileSync("src/game/storyCinematics.ts", "utf8");
  const engine = readFileSync("src/game/engine.ts", "utf8");
  const game = readFileSync("src/pages/Game.tsx", "utf8");

  check(player.includes("game.focusCamera?.({"), "the scene director drives the real cinematic camera");
  check(player.includes("actingForLine(line, beat)"), "the scene director performs the authored acting");
  check(player.includes("game.setPlayerStoryAct?.("), "the player's cat is acted, not left standing");
  check(player.includes("if (lastDirected.current !== key)"), "camera + acting are guarded against re-running per line");
  check((player.match(/<StoryDialogueBox/g) ?? []).length === 1, "still exactly one shared dialogue box");
  check(engine.includes("focusCamera(opts: {"), "the engine exposes the shot API");
  check(engine.includes("head: n.headFxUntil > this.time && n.headKind ? n.headKind : undefined"), "NPC head acting reaches the renderer");
  check(engine.includes("setPlayerStoryAct(act: {"), "the engine exposes player acting for cutscenes");
  check(
    engine.includes("private stepCineMove(n: NPCState, dt: number): boolean") &&
      engine.includes("if (this.stepCineMove(n, dt)) continue;"),
    "cutscene steps are walked in the NPC loop (they work for the guide too)",
  );
  check(cinematic.includes("export function lineCameraShot"), "the shot planner is a single shared rule set");
  check(cinematic.includes("export function actingForLine"), "the acting planner is a single shared rule set");
  check(game.includes("frameAt={cineFrame}") && game.includes("mode === \"story\" &&"), "the cutscene player is Story-Mode only and framed at the real scene");

  // book fidelity: the encounter and the camp arrival are the book's scenes
  const s3 = cinematic.slice(cinematic.indexOf("\"s3-graypaw\""), cinematic.indexOf("\"s4-the-camp\""));
  check(s3.includes("pine trail") || s3.includes("pines"), "the encounter happens in the pines (not at the camp gate)");
  check(s3.includes("Graypaw") && s3.includes("Bluestar"), "Graypaw invites the kittypet to meet Bluestar");
  const s4 = cinematic.slice(cinematic.indexOf("\"s4-the-camp\""), cinematic.indexOf("\"s5-bluestar\""));
  check(/gorse/i.test(s4) && /Redtail/.test(s4) && /Tallrock/.test(s4), "the camp arrival keeps the gorse tunnel, Redtail's death and the Tallrock");
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
