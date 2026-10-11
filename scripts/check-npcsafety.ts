// §25/§26/§27/§28 AI layer verification: the generated-reply filter and the
// request lifecycle that wraps it.
//
//  1. SAFETY/QUALITY FILTER (§26): out-of-character assistant talk, meta /
//     developer references, leaked transcript turns, markup, human/AI identity
//     claims and future-book spoilers are all REJECTED — the caller then keeps
//     the safe deterministic local line, so a bad generation can only ever
//     make a reply plainer, never break character.
//  2. SHAPE (§25): wrapping quotes and list markers are stripped, whitespace
//     normalised, and responses are capped to 1–4 short bubbles (≤240 chars).
//  3. FALLBACK (§27): a failed generation has an in-world line per voice.
//  4. LIFECYCLE (§28): one in-flight request at a time, monotonic request ids
//     (a stale response can never land), a response timeout, at most one
//     retry, a send cooldown, a per-conversation cap, and cancellation when
//     the conversation closes.
//
// Run: bun scripts/check-npcsafety.ts

import {
  NPC_REPLY_MAX_CHARS,
  NPC_REPLY_MAX_SENTENCES,
  createChatGate,
  npcAiTroubleLine,
  validateNpcReply,
} from "../src/game/npcChat";
import { profileFor } from "../src/game/characters";

let failures = 0;
let count = 0;
function check(cond: boolean, label: string) {
  count++;
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

const graypaw = profileFor("graypaw");
const bluestar = profileFor("bluestar");

console.log("— §26: character / safety filter —");
{
  const rejected: [string, string][] = [
    ["As an AI, I can't help with that.", "ooc"],
    ["I understand your concern — how can I assist you today?", "ooc"],
    ["Assistant: Sure! Here's a reply.", "role-leak"],
    ["```json\n{\"reply\": \"hi\"}\n```", "markup"],
    ["I am a human writer pretending to be a cat.", "identity"],
    ["The game's developers set my personality in the system prompt.", "meta"],
    ["In chapter 3 of the novel, Bluestar dies.", "spoiler"],
    ["Bluestar will die at the end of the story.", "spoiler"],
    ["   ", "empty"],
  ];
  let allRejected = true;
  for (const [text, expected] of rejected) {
    const v = validateNpcReply(text, graypaw);
    if (v.ok) {
      allRejected = false;
      console.log(`      leaked: ${JSON.stringify(text)} -> ${JSON.stringify(v.text)}`);
    } else if (expected && v.reason !== expected) {
      // the specific reason matters less than the rejection; log the mismatch
      console.log(`      (reason ${v.reason} for ${JSON.stringify(text.slice(0, 30))})`);
    }
  }
  check(allRejected, `${rejected.length} breaking/unsafe replies are all rejected`);

  const good = validateNpcReply("  \"Race you to the Tallrock — loser eats dust!\"  ", graypaw);
  check(good.ok && good.text === "Race you to the Tallrock — loser eats dust!", `an in-character line is accepted and cleaned (${good.text})`);
  const flavour = validateNpcReply("*tail flick* I caught a mouse this big.", graypaw);
  check(flavour.ok, "brief cat body language is allowed");
  const noCaps = validateNpcReply("The Clan holds. That's the whole victory. ".repeat(6), bluestar);
  check(noCaps.ok && noCaps.text.length <= NPC_REPLY_MAX_CHARS, `long generations are capped to a readable line (${noCaps.text.length} chars)`);
  const sentences = (noCaps.text.match(/[^.!?]+[.!?]*/g) ?? []).length;
  check(sentences <= NPC_REPLY_MAX_SENTENCES, `responses stay within ${NPC_REPLY_MAX_SENTENCES} short bubbles (${sentences})`);
}

console.log("— §27: in-world fallback —");
{
  const stances = ["warm", "curious", "wary", "hostile", "gruff"];
  const lines = stances.map((s) => npcAiTroubleLine({ ...graypaw, voice: { ...graypaw.voice, stance: s } } as typeof graypaw));
  check(lines.every((l) => l.length > 4), "every voice has a non-empty fallback line");
  check(new Set(lines).size >= 4, `fallback lines differ by voice (${new Set(lines).size} distinct)`);
  check(!lines.some((l) => /\b(ai|assistant|error|failed|failure)\b/i.test(l)), "the fallback never mentions the machinery");
}

console.log("— §28: request lifecycle —");
{
  const gate = createChatGate({ timeoutMs: 1000, cooldownMs: 500, maxPerConversation: 3, retryLimit: 1 });
  const a = gate.begin(0);
  check(!!a && gate.inFlight, "a request starts");
  const b = gate.begin(10);
  check(b === null, "a second request cannot start while one is in flight (no duplicates)");
  check(gate.isCurrent(a!.id), "the in-flight request is current");
  check(!gate.timedOut(a!.id, 500) && gate.timedOut(a!.id, 1001), "the response timeout fires at the deadline");
  gate.settle(a!.id, true, 1001);
  check(!gate.inFlight && !gate.isCurrent(a!.id), "settling clears the slot");
  check(gate.begin(1100) === null, "the send cooldown blocks an immediate follow-up");
  const c = gate.begin(1600);
  check(!!c, "the cooldown releases the next request");
  check(!gate.isCurrent(a!.id), "an OLD request id is never current again (stale responses cannot land)");
  gate.cancel();
  check(!gate.inFlight && !gate.isCurrent(c!.id), "cancel drops the in-flight request (closed conversation)");

  const g2 = createChatGate({ cooldownMs: 0, maxPerConversation: 2, retryLimit: 1 });
  const r1 = g2.begin(0)!;
  g2.settle(r1.id, false, 0);
  check(g2.retryAllowed(), "one failed generation may be retried once (and only once)");
  const r2 = g2.begin(1)!;
  g2.settle(r2.id, false, 1);
  check(!g2.retryAllowed(), "after the retry the layer stops trying (no automatic loops)");
  check(g2.begin(2) === null && g2.exhausted, "the per-conversation cap stops further calls (rate limiting)");
  g2.reset();
  check(!g2.exhausted && g2.begin(3) !== null, "a new conversation gets a fresh budget");
}

console.log("— §20: the conversation UI keeps its identity —");
{
  // the compact chat panel renders the cat's own sprite (never a stock icon),
  // its name, and the player input + send/close controls
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { NpcPortrait } = await import("../src/pages/gameUi");
  const html = renderToStaticMarkup(createElement(NpcPortrait, { npcId: "bluestar", size: 26 }));
  check(html.includes("<canvas") && html.includes("Bluestar portrait"), "the NPC conversation header shows a real cat portrait (§20)");
  const unknown = renderToStaticMarkup(createElement(NpcPortrait, { npcId: "not-a-cat", size: 26 }));
  check(!unknown.includes("<canvas"), "an unknown cat falls back to the paw badge instead of a blank frame");
}

console.log(failures === 0 ? `\nOK  npc ai safety verification passed (${count} checks)` : `\n${failures} FAILURE(S) of ${count}`);
process.exit(failures === 0 ? 0 : 1);
