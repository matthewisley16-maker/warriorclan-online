// §CHAT-FOCUS behavioural test — the reported bug:
//
//   "When I press E near a cat, the narrator/character dialogue appears, but the
//    open-world chat overlaps it and makes the text hard to read."
//
// The fix lives in the interaction layer: `useInteractionChatFocus` (the REAL
// production hook Game.tsx uses) collapses the open-world chat panel while an
// interaction owns the screen and restores it afterwards ONLY if it was open
// before. This test mounts the REAL hook together with the REAL ChatPanel — the
// panel the player actually sees — and drives the exact flow from the request:
//
//   open chat → talk to Graypaw → advance the dialogue → close the conversation
//
// It asserts the chat panel (messages AND input) is gone while talking, that it
// keeps receiving messages in the background (nothing discarded), and that it
// comes back exactly when, and only when, it should. It also asserts the world
// is not left paused under a hidden chat layer, because a chat-only pause is
// what silently swallowed E mid-conversation.
//
// Run: bun scripts/check-chat-focus.ts

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
// React 19 only flushes act() quietly when it knows it is in a test environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatPanel } from "../src/pages/gameUi";
import { useInteractionChatFocus } from "../src/game/chatFocus";
import { readFileSync } from "node:fs";

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

/** Poll until the predicate holds (exit/enter animations are async in the DOM). */
async function waitFor(pred: () => boolean, label: string, ms = 1500): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await act(async () => {
      await sleep(25);
    });
  }
  if (!pred()) console.error(`  (timed out waiting for: ${label})`);
}

// ---------------------------------------------------------------------------
// Harness — mirrors Game.tsx's wiring one-to-one:
//   activeUI stack ("gameplay" | "chat"), dialogue, npcConvo, cineBeat,
//   and the chat render gate `{chatVisible && <ChatPanel …/>}`.
// ---------------------------------------------------------------------------
type Layer = "gameplay" | "chat";
interface Msg {
  id: string;
  fromName: string;
  text: string;
  mine?: boolean;
  channel: string;
}

function Harness({ startOpen }: { startOpen: boolean }) {
  const [activeUI, setActiveUI] = useState<Layer>(startOpen ? "chat" : "gameplay");
  const [dialogue, setDialogue] = useState<{ name: string; text: string } | null>(null);
  const [convo, setConvo] = useState<{ name: string; line: string } | null>(null);
  const [feed, setFeed] = useState<Msg[]>([
    { id: "m1", fromName: "Bluestar", text: "patrol at dawn", channel: "global" },
    { id: "m2", fromName: "Lionheart", text: "the river is high", channel: "global" },
    { id: "m3", fromName: "Rusty", text: "on my way", mine: true, channel: "global" },
  ]);

  const { talking, chatVisible, toggleChat } = useInteractionChatFocus<Layer>({
    dialogueOpen: dialogue !== null,
    conversationOpen: convo !== null,
    cinematicOpen: false,
    activeUI,
    setActiveUI,
    chatLayer: "chat",
    playLayer: "gameplay",
  });

  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "talking" }, talking ? "talking" : "idle"),
    createElement("span", { "data-testid": "layer" }, activeUI),
    createElement("span", { "data-testid": "feed" }, String(feed.length)),
    // the interaction UI that must stay readable (narrator / speaker / line)
    dialogue
      ? createElement(
          "div",
          { "data-testid": "dialogue" },
          createElement("span", { "data-testid": "dialogue-name" }, dialogue.name),
          createElement("p", { "data-testid": "dialogue-text" }, dialogue.text),
          createElement("button", { id: "continue-dialogue", onClick: () => setDialogue(null) }, "E continue"),
        )
      : null,
    convo
      ? createElement(
          "div",
          { "data-testid": "conversation" },
          createElement("span", { "data-testid": "conversation-name" }, convo.name),
          createElement("p", { "data-testid": "conversation-text" }, convo.line),
          createElement("button", { id: "advance-convo", onClick: () => setConvo({ ...convo, line: convo.line + " …and more" }) }, "E advance"),
          createElement("button", { id: "leave-convo", onClick: () => setConvo(null) }, "leave"),
        )
      : null,
    // "print" (E / touch prompt / story trigger / walk-in interaction)
    createElement("button", { id: "start-convo", onClick: () => setConvo({ name: "Graypaw", line: "You're new here, aren't you?" }) }, "talk"),
    createElement("button", { id: "start-dialogue", onClick: () => setDialogue({ name: "The forest", text: "Leaves rustle." }) }, "narrate"),
    createElement("button", { id: "new-dialogue", onClick: () => setDialogue({ name: "Graypaw", text: "ThunderClan cats aren't afraid of anything." }) }, "narrate2"),
    createElement("button", { id: "toggle-chat", onClick: toggleChat }, "Chat"),
    // a message arrives from the live chat subscription while the panel is hidden
    createElement(
      "button",
      { id: "incoming", onClick: () => setFeed((f) => [...f, { id: `m${f.length + 1}`, fromName: "Tigerclaw", text: "hold the line", channel: "global" }]) },
      "incoming",
    ),
    chatVisible
      ? createElement(
          "div",
          { "data-testid": "chat" },
          createElement(ChatPanel, {
            onClose: () => setActiveUI("gameplay"),
            channel: "global",
            setChannel: () => undefined,
            myClan: "thunderclan",
            onSend: () => undefined,
            messages: feed,
          }),
        )
      : null,
  );
}

function mount(node: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { root, container };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel);
const text = (c: HTMLElement, sel: string) => c.querySelector(sel)?.textContent?.trim() ?? "";
async function click(c: HTMLElement, id: string) {
  const el = c.querySelector<HTMLButtonElement>(`#${id}`);
  if (!el) throw new Error(`no button #${id}`);
  await act(async () => {
    el.click();
    await Promise.resolve();
  });
}
/** the chat panel is truly gone: wrapper, messages and the input field */
const chatGone = (c: HTMLElement) =>
  !q(c, "[data-testid=chat]") &&
  !q(c, "input[placeholder='Speak as a cat…']") &&
  !/patrol at dawn/.test(c.textContent ?? "");

async function main() {
  console.log("--- chat open → talk to Graypaw → advance → close (request §1,§2,§4,§10) ---");
  {
    const { root, container } = mount(createElement(Harness, { startOpen: true }));
    check(text(container, "[data-testid=layer]") === "chat", "chat starts open");
    check(!!q(container, "input[placeholder='Speak as a cat…']"), "chat panel shows its input field");
    check(/patrol at dawn/.test(container.textContent ?? ""), "chat panel shows its messages");
    check(text(container, "[data-testid=talking]") === "idle", "no interaction yet → chat is normal open-world chat");

    // E near Graypaw: the interaction starts
    await click(container, "start-convo");
    await waitFor(() => chatGone(container), "chat panel to collapse");
    check(chatGone(container), "chat panel (messages AND input) is gone while the conversation is up");
    check(text(container, "[data-testid=conversation-name]") === "Graypaw", "speaker name stays visible (Graypaw)");
    check(/You're new here/.test(text(container, "[data-testid=conversation-text]")), "the NPC line stays visible");
    check(text(container, "[data-testid=talking]") === "talking", "the interaction state is active");
    check(text(container, "[data-testid=layer]") === "gameplay", "hidden chat layer is cleared → the world is not left paused (E keeps working)");

    // a message arrives while the panel is hidden (multiplayer chat stays live)
    await click(container, "incoming");
    check(text(container, "[data-testid=feed]") === "4", "chat keeps receiving in the background (feed grew behind the hidden panel)");

    // E advances the dialogue
    await click(container, "advance-convo");
    check(/…and more/.test(text(container, "[data-testid=conversation-text]")), "E advanced the dialogue (new line shown)");
    check(chatGone(container), "advancing dialogue does not reopen chat (request §6)");
    check(text(container, "[data-testid=talking]") === "talking", "still the same single interaction (no second one)");

    // the conversation ends
    await click(container, "leave-convo");
    await waitFor(() => !!q(container, "[data-testid=chat]"), "chat panel to come back");
    check(!!q(container, "[data-testid=chat]"), "chat panel is restored when the conversation ends");
    check(text(container, "[data-testid=layer]") === "chat", "restored to its previous state (chat open)");
    const after = container.textContent ?? "";
    check(
      /patrol at dawn/.test(after) && /the river is high/.test(after) && /on my way/.test(after),
      "no earlier message was discarded",
    );
    check(/hold the line/.test(after), "the message received while hidden is there too");
    check(!!q(container, "input[placeholder='Speak as a cat…']"), "the input field is usable again");
    check(text(container, "[data-testid=talking]") === "idle", "interaction closed");
    act(() => root.unmount());
  }

  console.log("--- chat closed → narrator line → close: chat is never reopened (request §5,§6,§7) ---");
  {
    const { root, container } = mount(createElement(Harness, { startOpen: false }));
    check(!q(container, "[data-testid=chat]"), "chat starts closed");
    await click(container, "start-dialogue");
    await waitFor(() => text(container, "[data-testid=talking]") === "talking", "interaction to start");
    check(chatGone(container), "narrator line does not bring chat up over it");
    check(text(container, "[data-testid=dialogue-name]") === "The forest", "narrator/speaker name stays visible");
    check(/Leaves rustle/.test(text(container, "[data-testid=dialogue-text]")), "narrator text stays readable");
    // clicking Chat during the interaction must do nothing at all
    await click(container, "toggle-chat");
    check(chatGone(container), "the chat toggle cannot reopen chat over the dialogue");
    check(text(container, "[data-testid=layer]") === "gameplay", "the toggle left the UI stack alone");
    // E replaces the line (still the same interaction)
    await click(container, "new-dialogue");
    check(chatGone(container), "replacing the dialogue line does not reopen chat");
    check(/ThunderClan cats/.test(text(container, "[data-testid=dialogue-text]")), "the new line is shown");
    // E closes it
    await click(container, "continue-dialogue");
    const gone = text(container, "[data-testid=talking]") === "idle";
    check(gone, "the interaction ended");
    check(!q(container, "[data-testid=chat]"), "chat was already closed → it stays closed (never reopened)");
    act(() => root.unmount());
  }

  console.log("--- normal open-world chat is untouched when nobody is talking (request: Important) ---");
  {
    const { root, container } = mount(createElement(Harness, { startOpen: false }));
    await click(container, "toggle-chat");
    await waitFor(() => !!q(container, "[data-testid=chat]"), "chat to open");
    check(!!q(container, "[data-testid=chat]"), "the Chat button still opens chat normally");
    check(!!q(container, "input[placeholder='Speak as a cat…']"), "its input field works");
    await click(container, "toggle-chat");
    await waitFor(() => chatGone(container), "chat to close");
    check(chatGone(container), "the Chat button still closes it normally");
    act(() => root.unmount());
  }

  // -------------------------------------------------------------------------
  // Wiring: Game.tsx must use THIS policy for the ONE interaction layer (no
  // second E handler, no duplicate dialogue window) and render the open-world
  // chat panel only through it.
  // -------------------------------------------------------------------------
  console.log("--- production wiring in Game.tsx ---");
  const game = readFileSync(new URL("../src/pages/Game.tsx", import.meta.url), "utf8");
  check(/useInteractionChatFocus<ActiveUi>\(\{/.test(game), "Game.tsx uses the interaction/chat focus policy");
  check(/dialogueOpen: dialogue !== null/.test(game), "…driven by the existing dialogue state");
  check(/conversationOpen: npcConvo !== null/.test(game), "…and the existing NPC conversation state");
  check(/cinematicOpen: cineBeat !== null/.test(game), "…and the existing story-beat state");
  const chatRenders = game.match(/\{[^}]*\bchatOpen\b[^}]*&&\s*\(\s*<ChatPanel/g) ?? [];
  check(game.split("<ChatPanel").length - 1 === 1, "exactly ONE open-world ChatPanel render (no duplicate window)");
  check(chatRenders.length === 1 && /chatOpen/.test(chatRenders[0]), "the open-world chat panel renders only under `chatOpen` (policy-gated)");
  check(/const \{ chatVisible: chatOpen, toggleChat \}/.test(game), "the HUD Chat toggle is the policy's toggleChat");

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) {
    console.error(`${failures} FAILED`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
