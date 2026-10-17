// §STORY-ONE-BOX behavioural test — the reported bug:
//
//   "When I press E to talk to Graypaw, the narrator dialogue, Graypaw's
//    dialogue, and the animated dialogue appear in separate, overlapping boxes."
//
// Three surfaces used to be live at once in Story Mode: the cinematic caption,
// the generic `dialogue` panel (narrator / step-completion lines, which never
// auto-cleared) and the NPC conversation panel. This test drives the REAL
// production pieces and asserts the fix:
//
//   • `composeStoryTalk` produces ONE script where the narrator and the cat
//     take turns (narrator → Graypaw → resolution), with real hold times;
//   • the REAL `StoryCutscenePlayer` (which owns the animated box) renders at
//     most ONE dialogue box at any instant, updates its speaker IN PLACE as the
//     turns advance, keeps choices inside that same box, and closes cleanly;
//   • pressing E advances the box instead of opening anything new;
//   • Game.tsx routes Story Mode talk + narration through that one box and
//     never lets the conversation/generic panels onto the screen with it;
//   • Online World keeps its own conversation panel untouched.
//
// Run: bun scripts/check-story-dialogue.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://game.test/play" });
// React 19 only flushes act() quietly in a known test environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { composeStoryTalk } from "../src/game/storyCinematics";
import { storySteps } from "../src/game/story";
import { buildDialogue } from "../src/game/dialogue";
import { StoryDialogueBox, storyLineKey } from "../src/pages/StoryDialogueBox";
import { StoryCutscenePlayer } from "../src/pages/StoryCutscenePlayer";
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

/** Poll until the predicate holds, letting React + framer-motion flush. */
async function waitFor(pred: () => boolean, label: string, ms = 4000): Promise<void> {
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
// 1) The script: narrator and Graypaw alternate, in one sequence
// ---------------------------------------------------------------------------
console.log("— one script, alternating speakers —");
const talk = composeStoryTalk({
  npc: { id: "graypaw", name: "Graypaw" },
  opening: "Hey — get off our territory!",
  brief: "A gray shape leaps from the undergrowth!",
  completion: [
    { speaker: "Graypaw", text: "Come on, Bluestar's waiting." },
    { speaker: "Narrator", text: "The forest closed behind you." },
  ],
});
check(talk.lines.length === 4, `one script carries every turn (got ${talk.lines.length})`);
check(
  talk.lines.map((l) => l.speaker).join(" → ") === "Narrator → Graypaw → Graypaw → Narrator",
  "narrator and Graypaw take turns in a single ordered script",
  talk.lines.map((l) => l.speaker).join(" → "),
);
check(
  talk.lines.every((l) => l.speakerId === "narrator" || l.speakerId === "graypaw"),
  "every turn resolves to a speaker identity (narrator vs the cat)",
);
check(
  talk.lines.every((l) => (l.holdMs ?? 0) >= 2000),
  "every line has a readable hold time",
);
check(
  talk.lines[1].text === "Hey — get off our territory!" && talk.lines[0].text.includes("gray shape"),
  "the narrator's text and Graypaw's dialogue are BOTH preserved",
);

const bystander = composeStoryTalk({ npc: { id: "sandpaw", name: "Sandpaw" }, opening: "Hm." });
check(
  bystander.lines.length === 1 && bystander.lines[0].speaker === "Sandpaw",
  "talking to a bystander does not replay another cat's mission narration",
);

// The real Graypaw step, with the real authored data and the real dialogue
// engine opening — this is the conversation the bug report describes.
const graypawStep = storySteps.find((s) => s.objective.kind === "talk" && s.objective.targetNpc === "graypaw")!;
const graypawOpening = buildDialogue("graypaw", {
  mode: "story",
  storyStep: storySteps.findIndex((s) => s.id === graypawStep.id),
  hour: 9,
  weather: "clear",
  player: { name: "Rusty", clan: "thunderclan", rank: "apprentice" },
  discovered: {},
  learned: {},
  bonds: {},
  talked: {},
  facts: [],
}).opening;
const realTalk = composeStoryTalk({
  npc: { id: "graypaw", name: "Graypaw" },
  opening: graypawOpening,
  brief: graypawStep.brief,
  completion: graypawStep.onComplete ?? [],
});
check(
  realTalk.lines.length >= 3 &&
    realTalk.lines[0].speaker === "Narrator" &&
    realTalk.lines[1].speaker === "Graypaw" &&
    realTalk.lines[1].text === graypawOpening,
  "the real Graypaw step opens as Narrator → Graypaw in one script",
  realTalk.lines.map((l) => l.speaker).join(" → "),
);
check(
  realTalk.lines[realTalk.lines.length - 1].text === graypawStep.onComplete![0].text,
  "the step's authored resolution is the last turn of the same script",
);
check(
  realTalk.lines.every((l) => l.text.trim().length > 0),
  "no turn is empty (narrator text and Graypaw's dialogue are both kept)",
);

// ---------------------------------------------------------------------------
// 2) The box itself: one node, updated in place
// ---------------------------------------------------------------------------
console.log("— the shared box —");
const host = document.createElement("div");
document.body.appendChild(host);
const root: Root = createRoot(host);

await act(async () => {
  root.render(
    createElement(StoryDialogueBox, {
      line: { speaker: "Narrator", speakerId: "narrator", text: "The forest is calling." },
      lineKey: storyLineKey({ speaker: "Narrator", speakerId: "narrator", text: "The forest is calling." }, 0),
    }),
  );
});
await waitFor(() => boxes().length === 1, "first line renders");
check(boxes().length === 1, "one box for the narrator line");
check(boxes()[0].textContent?.includes("Narrator") === true, "the speaker name is shown");
check(boxes()[0].textContent?.includes("The forest is calling.") === true, "the narrator text is shown");

await act(async () => {
  root.render(
    createElement(StoryDialogueBox, {
      line: { speaker: "Graypaw", speakerId: "graypaw", text: "Get off our territory!" },
      lineKey: storyLineKey({ speaker: "Graypaw", speakerId: "graypaw", text: "Get off our territory!" }, 1),
    }),
  );
});
await waitFor(() => (boxes()[0]?.getAttribute("data-speaker") ?? "") === "Graypaw", "speaker swaps in place");
check(boxes().length === 1, "still exactly one box after the speaker changes", `${boxes().length} boxes`);
check(boxes()[0].getAttribute("data-speaker") === "Graypaw", "the SAME box now says Graypaw");
check(boxes()[0].textContent?.includes("Get off our territory!") === true, "Graypaw's line replaced the narrator's text");
check(!document.body.textContent?.includes("The forest is calling."), "the previous turn is gone (no stacked copy)");

await act(async () => {
  root.render(createElement(StoryDialogueBox, { line: null }));
});
await waitFor(() => boxes().length === 0, "box closes");
check(boxes().length === 0, "closing the line removes the box");
await act(async () => root.unmount());
host.remove();

// ---------------------------------------------------------------------------
// 3) The real story player: at most one box, ever, through a whole exchange
// ---------------------------------------------------------------------------
console.log("— the real Story Mode player —");
const stubGame = {
  setNpcStoryBeat: () => undefined,
  clearNpcStoryBeat: () => undefined,
  playCinematic: () => undefined,
  clearCinematic: () => undefined,
  setPlayerControlEnabled: () => undefined,
  engineState: () => ({ x: 0, y: 0 }),
  getNpcWorldPos: () => null,
} as unknown as GameCanvas;

const playerHost = document.createElement("div");
document.body.appendChild(playerHost);
const playerRoot = createRoot(playerHost);
let done = 0;

const playerBeat = {
  id: "talk:graypaw:3:1",
  lines: [
    { speaker: "Narrator", speakerId: "narrator", text: "A gray shape leaps from the undergrowth!", holdMs: 900 },
    { speaker: "Graypaw", speakerId: "graypaw", text: "Hey — get off our territory!", holdMs: 900 },
    { speaker: "Narrator", speakerId: "narrator", text: "The forest closed behind you.", holdMs: 900 },
  ],
};

// observe the DOM continuously: never more than one dialogue box at a time
let maxBoxes = 0;
const seen: string[] = [];
const observer = setInterval(() => {
  const n = boxes().length;
  if (n > maxBoxes) maxBoxes = n;
  const speaker = boxes()[0]?.getAttribute("data-speaker");
  if (speaker && seen[seen.length - 1] !== speaker) seen.push(speaker);
}, 10);

await act(async () => {
  playerRoot.render(
    createElement(StoryCutscenePlayer, {
      beat: playerBeat,
      game: stubGame,
      onDone: () => {
        done += 1;
      },
    }),
  );
});

await waitFor(() => boxes().length === 1, "the player opens the box");
check(boxes().length === 1, "pressing E starts ONE dialogue box");

// E advances the current line (the game's dialogue key)
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
  await sleep(60);
});
await waitFor(() => boxes()[0]?.getAttribute("data-speaker") === "Graypaw", "E advances to Graypaw");
check(boxes()[0]?.getAttribute("data-speaker") === "Graypaw", "E advanced the SAME box to Graypaw");
check(boxes().length === 1, "E did not spawn a second box", `${boxes().length} boxes`);

await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
  await sleep(60);
});
await waitFor(() => boxes()[0]?.getAttribute("data-speaker") === "Narrator", "E advances to the narrator again");
check(boxes()[0]?.getAttribute("data-speaker") === "Narrator", "narrator takes the next turn in the same box");

await waitFor(() => done > 0, "the exchange finishes", 6000);
clearInterval(observer);
check(done === 1, "the conversation ends exactly once");
check(maxBoxes <= 1, `never more than one dialogue box at any instant (max ${maxBoxes})`);
check(
  seen.join(" → ").startsWith("Narrator → Graypaw → Narrator"),
  "narrator and Graypaw alternated in one box",
  seen.join(" → "),
);

await waitFor(() => boxes().length === 0, "the box closes at the end");
check(boxes().length === 0, "the shared box closes when the conversation ends");
check(!document.body.textContent?.includes("get off our territory"), "no dialogue text is left behind");

await act(async () => playerRoot.unmount());
playerHost.remove();

// ---------------------------------------------------------------------------
// 4) Choices live inside the same box (no second panel)
// ---------------------------------------------------------------------------
console.log("— choices stay inside the box —");
const choiceHost = document.createElement("div");
document.body.appendChild(choiceHost);
const choiceRoot = createRoot(choiceHost);
let picked = "";

await act(async () => {
  choiceRoot.render(
    createElement(StoryCutscenePlayer, {
      beat: {
        id: "choice-beat",
        lines: [{ speaker: "Graypaw", speakerId: "graypaw", text: "Want to see where we live?", holdMs: 40 }],
        choices: [
          {
            label: "Show me everything.",
            playerLine: "Show me everything.",
            reply: { speaker: "Graypaw", speakerId: "graypaw", text: "Follow me!", holdMs: 40 },
          },
        ],
      },
      game: stubGame,
      onDone: () => undefined,
    }),
  );
});

await waitFor(() => boxes().length === 1 && (boxes()[0].querySelectorAll("button").length ?? 0) === 1, "choices render");
check(boxes().length === 1, "the choices render inside the ONE box");
check(
  (boxes()[0].textContent ?? "").includes("Want to see where we live?") &&
    (boxes()[0].textContent ?? "").includes("Show me everything."),
  "the line and its answers share one container",
);

const choiceBtn = boxes()[0]?.querySelector("button");
await act(async () => {
  choiceBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(60);
});
picked = boxes()[0]?.getAttribute("data-speaker") ?? "";
check(picked === "You" || picked === "Graypaw", "answering keeps the same box (player echo / reply)", picked);
check(boxes().length === 1, "answering did not open another box");

await act(async () => choiceRoot.unmount());
choiceHost.remove();

// ---------------------------------------------------------------------------
// 4b) Manual advance never swallows the next turn
// ---------------------------------------------------------------------------
// The read-time timer of the line being advanced past used to keep running and
// fire later, skipping a whole turn. E/click must cancel it.
console.log("— advancing does not skip a line —");
const skipHost = document.createElement("div");
document.body.appendChild(skipHost);
const skipRoot = createRoot(skipHost);

await act(async () => {
  skipRoot.render(
    createElement(StoryCutscenePlayer, {
      beat: {
        id: "skip-beat",
        lines: [
          { speaker: "Narrator", speakerId: "narrator", text: "Scene one.", holdMs: 800 },
          { speaker: "Graypaw", speakerId: "graypaw", text: "Hello, kittypet.", holdMs: 8000 },
          { speaker: "Narrator", speakerId: "narrator", text: "Scene two.", holdMs: 8000 },
          { speaker: "Graypaw", speakerId: "graypaw", text: "Last word.", holdMs: 8000 },
        ],
      },
      game: stubGame,
      onDone: () => undefined,
    }),
  );
});

await waitFor(() => boxes().length === 1, "first line of the skip beat");
// advance twice, fast: the first line's read timer must not fire later and
// yank the box BACK to the line we already passed.
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
  await sleep(20);
});
await waitFor(() => boxes()[0]?.getAttribute("data-speaker") === "Graypaw", "second line");
await act(async () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
  await sleep(20);
});
await waitFor(() => (boxes()[0]?.textContent ?? "").includes("Scene two."), "third line");
// past the first line's 800ms hold: a stale timer would jump back to Graypaw
await act(async () => {
  await sleep(1000);
});
check(
  (boxes()[0]?.textContent ?? "").includes("Scene two.") &&
    boxes()[0]?.getAttribute("data-speaker") === "Narrator",
  "the advanced-past line's timer cannot rewind the conversation",
  boxes()[0]?.textContent ?? "(closed)",
);
check(boxes().length === 1, "and it stayed one box", `${boxes().length} boxes`);

await act(async () => skipRoot.unmount());
skipHost.remove();

// ---------------------------------------------------------------------------
// 5) Wiring: Story Mode has exactly one dialogue surface
// ---------------------------------------------------------------------------
console.log("— wiring —");
const game = readFileSync("src/pages/Game.tsx", "utf8");
const player = readFileSync("src/pages/StoryCutscenePlayer.tsx", "utf8");

check(
  player.includes("return () => window.clearTimeout(t);"),
  "a manual advance cancels the current line's read timer",
);

check(game.includes("startStoryTalkRef.current(npcId)") || game.includes("startStoryTalkRef.current(target.npcId)"), "Story Mode talk goes through the shared-talk opener");
check(
  game.includes("if (cineBeatRef.current) return;"),
  "E is ignored while the story box owns the screen (it can never open a second dialogue)",
);
check(
  game.includes("composeStoryTalk({"),
  "the talk script is composed as one narrator→cat→resolution sequence",
);
check(
  /const completion = isObjective \? completeStoryStep\(\) : \[\];/.test(game),
  "the step resolves into the SAME box (no separate completion panel)",
);
check(
  /mode === "story"[\s\S]{0,400}setCineBeat\(\{/.test(game),
  "Story Mode narration plays in the shared box",
);
check(
  game.includes('{npcConvo && mode !== "story" && ('),
  "the online conversation panel is excluded from Story Mode",
);
check(
  game.includes("{dialogue && !(mode === \"story\" && cineBeat) && ("),
  "the generic dialogue panel cannot stack over the story box",
);
check(
  game.includes("canStartBeat({") && game.includes("actorArrived: (id) => g?.getNpcStoryInfo(id)?.arrived ?? true"),
  "step beats still start only after their cast arrives",
);
check(
  game.includes("const ready = canStartBeat({") && game.includes("player: posRef.current"),
  "step beats start only where the scene really happens",
);
check(
  player.includes("StoryDialogueBox") && (player.match(/<StoryDialogueBox/g) ?? []).length === 1,
  "the player renders exactly one dialogue box component",
);

// Online World untouched: the conversation panel still exists for mode "open".
const onlinePanel = game.includes("<NpcPortrait npcId={npcConvo.npcId}") && game.includes("Say something to");
check(onlinePanel, "the online NPC conversation panel is still present and unchanged");

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
