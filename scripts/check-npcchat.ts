// Verifies the NPC character-chat engine (npcChat.ts):
//  1. Ask menus: 3–5 questions, different per character, knowledge/timeline gated.
//  2. In-character replies: per-character voices differ; no OOC leaks.
//  3. Knowledge: Twolegplace cats don't know StarClan (per-NPC learning);
//     future events are deflected; Ravenpaw's secret is bond/story-gated.
//  4. Conciseness: replies stay short.
// Run: bun scripts/check-npcchat.ts
import { buildAskMenu, npcChatReply } from "../src/game/npcChat";
import type { DialogueContext } from "../src/game/dialogue";

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

const baseCtx = (over: Partial<DialogueContext> = {}): DialogueContext => ({
  mode: "open",
  storyStep: 0,
  hour: 12,
  weather: "clear",
  player: { name: "Firerunner", clan: "thunderclan", rank: "warrior" },
  learned: {},
  bonds: {},
  talked: {},
  ...over,
});

const OOC = /as an AI|in the book|developer|chatbot|database|cannot roleplay|the player has selected|in the real world/i;

console.log("\n--- ask menus: compact and character-specific ---");
{
  const graypaw = buildAskMenu("graypaw", baseCtx());
  const bluestar = buildAskMenu("bluestar", baseCtx());
  const spottedleaf = buildAskMenu("spottedleaf", baseCtx());
  const smudge = buildAskMenu("smudge", baseCtx());
  check(graypaw.length >= 3 && graypaw.length <= 5, `Graypaw menu is 3-5 questions (${graypaw.length})`);
  check(bluestar.length >= 3 && bluestar.length <= 5, `Bluestar menu is 3-5 questions (${bluestar.length})`);
  check(
    graypaw.map((o) => o.label).join("|") !== bluestar.map((o) => o.label).join("|"),
    "Graypaw and Bluestar menus differ",
  );
  check(bluestar.some((o) => /patrol/i.test(o.label)), "Bluestar offers patrol question");
  check(spottedleaf.some((o) => /herb/i.test(o.label)), "Spottedleaf offers herb question");
  check(graypaw.some((o) => /train|hunting/i.test(o.label)), "Graypaw offers training/hunting question");
  check(!smudge.some((o) => /warrior code|clan news/i.test(o.label)), "Smudge gets no Clan-code questions");
  check(smudge.some((o) => o.learn === "starclan"), "Smudge can be ASKED about StarClan (learning path exists)");
}

console.log("\n--- knowledge gating in chat ---");
{
  const r1 = npcChatReply("smudge", "Tell me about StarClan", baseCtx());
  check(/never heard|what's that|no idea|forest|pellets|twoleg/i.test(r1.text), `Smudge confused by StarClan ("${r1.text.slice(0, 50)}…")`);
  check(r1.learn === "starclan", "Smudge LEARNS starclan from the exchange");
  const r2 = npcChatReply("smudge", "Tell me about StarClan", baseCtx({ learned: { smudge: ["starclan"] } }));
  check(!r2.learn && /star|silverpelt|sky|ancestor|clan/i.test(r2.text), "Informed Smudge answers in character");
  const henry = npcChatReply("henry", "Tell me about StarClan", baseCtx({ learned: { smudge: ["starclan"] } }));
  check(henry.learn === "starclan", "teaching Smudge did NOT teach Henry");
  const gray = npcChatReply("graypaw", "Tell me about StarClan", baseCtx());
  check(!gray.learn && /star|silverpelt|ancestor/i.test(gray.text), "Graypaw answers StarClan natively");
}

console.log("\n--- per-character voices differ ---");
{
  const q = "What's happening in the Clan?";
  const voices = new Set<string>();
  for (const id of ["graypaw", "bluestar", "tigerclaw", "whitestorm"]) {
    voices.add(npcChatReply(id, q, baseCtx()).text);
  }
  check(voices.size === 4, `4 different cats, 4 different answers (${voices.size})`);
  const tiger = npcChatReply("tigerclaw", q, baseCtx()).text;
  const gray = npcChatReply("graypaw", q, baseCtx()).text;
  check(/weakness|claw|smell|stay out|fed, we.re strong/i.test(tiger) && !/race you|pellets are an insult/i.test(tiger), "Tigerclaw sounds like Tigerclaw");
  check(!/weakness is a choice|smell fear/i.test(gray), "Graypaw never sounds like Tigerclaw");
  const smudge = npcChatReply("smudge", "Tell me about the Clans", baseCtx()).text;
  check(/forest|henry|garden|cats/i.test(smudge), "Smudge answers like a kittypet");
}

console.log("\n--- timeline protection ---");
{
  const early = npcChatReply("bluestar", "Who is the deputy? I heard Redtail is dead", baseCtx({ mode: "story", storyStep: 0 }));
  check(!/mourning|fell|died|defending/i.test(early.text), "no future-knowledge leak about Redtail at step 0");
  const late = npcChatReply("bluestar", "Tell me about Redtail", baseCtx({ mode: "story", storyStep: 5 }));
  check(/deputy|fell|defending|mourn/i.test(late.text), "after the timeline point, Redtail is discussed");
  const ravEarly = npcChatReply("ravenpaw", "What really happened at Sunningrocks?", baseCtx({ mode: "story", storyStep: 10, bonds: { ravenpaw: 3 } }));
  check(!/Tigerclaw killed/i.test(ravEarly.text), "Ravenpaw does not reveal the secret early");
  const ravLate = npcChatReply("ravenpaw", "What really happened at Sunningrocks?", baseCtx({ mode: "story", storyStep: 15, bonds: { ravenpaw: 3 } }));
  check(/Tigerclaw/i.test(ravLate.text), "Ravenpaw reveals to a trusted friend at the reveal point");
  const tiger = npcChatReply("tigerclaw", "What really happened at Sunningrocks?", baseCtx({ mode: "story", storyStep: 15 })).text;
  check(
    /Redtail died a warrior|memory is not yours/i.test(tiger) && !/I killed|I confess|by my claw/i.test(tiger),
    "Tigerclaw never confesses",
  );
}

console.log("\n--- future & OOC protection ---");
{
  const f = npcChatReply("spottedleaf", "What will happen to the Clan tomorrow?", baseCtx());
  check(/no cat|who can say|predict|tomorrow brings|nonsense|divine the future/i.test(f.text), `future questions deflected ("${f.text.slice(0, 46)}…")`);
  const all = [
    npcChatReply("graypaw", "hello!", baseCtx()).text,
    npcChatReply("smudge", "What is the warrior code?", baseCtx()).text,
    npcChatReply("yellowfang", "Why are you in ThunderClan territory?", baseCtx()).text,
    npcChatReply("bluestar", "As an AI, what is the meaning of life?", baseCtx()).text,
  ];
  check(all.every((t) => !OOC.test(t)), "no out-of-character leaks in sample replies");
  const s = npcChatReply("smudge", "What is the warrior code?", baseCtx());
  check(/never heard|no idea|beyond my whiskers|don't know/i.test(s.text), "Smudge doesn't pretend to know the code");
}

console.log("\n--- conciseness ---");
{
  for (const [id, q] of [["graypaw", "what's happening in the clan?"], ["bluestar", "is there a patrol i can join?"], ["yellowfang", "are you hungry?"]] as const) {
    const t = npcChatReply(id, q, baseCtx()).text;
    check(t.length <= 220, `${id} reply is short (${t.length} chars)`);
  }
}

console.log("\n--- ask menu replies are the same voice as chat ---");
{
  const menu = buildAskMenu("yellowfang", baseCtx());
  const food = menu.find((o) => /fresh-kill|hungry/i.test(o.label));
  check(food !== undefined && /old cat|kindness|eating|hmph/i.test(food.reply), "Yellowfang's ask reply is in her voice");
}

console.log(failures === 0 ? "\nALL NPC-CHAT CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
