// Verifies the dialogue + knowledge + availability systems:
//  1. Twolegplace cats do NOT know StarClan: asking yields starUnknown and a
//     "learn" flag; once learned, the same cat gives an informed answer.
//  2. Clan cats answer StarClan questions from the start (no learning).
//  3. Availability: story windows (Redtail gone after step 1, Yellowfang from
//     step 11, Rusty never in story) vs online roster.
//  4. Dialogue variety: openings/choices rotate with talked counts and hour.
//  5. pickNpcChatLines returns 3 relation-aware lines from each cat's voice.
// Run: bun scripts/check-dialogue.ts
import { buildDialogue, isAvailable, pickNpcChatLines } from "../src/game/dialogue";
import { profileFor } from "../src/game/characters";
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

console.log("\n--- knowledge: Twolegplace cats start WITHOUT StarClan ---");
for (const id of ["smudge", "princess", "henry", "rusty", "marmalade"]) {
  const p = profileFor(id);
  const ctx = baseCtx();
  const tree = buildDialogue(id, ctx);
  const star = tree.choices.find((c) => c.learn === "starclan");
  check(star !== undefined, `${id}: asking about StarClan yields a learn:starclan choice`);
  check(
    star !== undefined && !/Silverpelt|nine lives|ancestors watch|speak to medicine/i.test(star.reply),
    `${id}: reply is a confused kittypet answer ("${star?.reply.slice(0, 60)}...")`,
  );
  // after learning, the SAME cat answers informed
  const ctx2 = baseCtx({ learned: { [id]: ["starclan"] } });
  const tree2 = buildDialogue(id, ctx2);
  const star2 = tree2.choices.find((c) => c.label.includes("StarClan"));
  check(star2 !== undefined && star2.learn === undefined, `${id}: after learning, reply no longer teaches`);
  check(
    star2 !== undefined && /Silverpelt|silver pelt|stars|ancestor|spirit|Clan|sky/i.test(star2.reply),
    `${id}: informed answer references StarClan ("${star2?.reply.slice(0, 60)}...")`,
  );
}

console.log("\n--- knowledge: Clan cats know StarClan from the start ---");
for (const id of ["bluestar", "spottedleaf", "graypaw", "lionheart", "oakheart", "tallstar"]) {
  const tree = buildDialogue(id, baseCtx());
  const star = tree.choices.find((c) => c.label.includes("StarClan"));
  check(star !== undefined && star.learn === undefined, `${id}: no learn needed`);
  check(star !== undefined && star.reply.length > 20, `${id}: informed reply present`);
}

console.log("\n--- knowledge is PER-NPC, never global ---");
{
  const ctx = baseCtx({ learned: { smudge: ["starclan"] } });
  const princess = buildDialogue("princess", ctx).choices.find((c) => c.learn === "starclan");
  check(princess !== undefined, "teaching Smudge does not teach Princess");
}

console.log("\n--- availability: story windows ---");
{
  const redtail = profileFor("redtail");
  check(isAvailable(redtail, "story", 0), "Redtail present at story step 0");
  check(!isAvailable(redtail, "story", 1), "Redtail GONE at story step 1");
  check(!isAvailable(redtail, "story", 16), "Redtail gone at epilogue");
  check(isAvailable(redtail, "open", 0), "Redtail alive in Online world");

  const yellowfang = profileFor("yellowfang");
  check(!isAvailable(yellowfang, "story", 5), "Yellowfang absent before step 11");
  check(isAvailable(yellowfang, "story", 11), "Yellowfang present at step 11");
  check(isAvailable(yellowfang, "open", 3), "Yellowfang online-world resident");

  const rusty = profileFor("rusty");
  check(!isAvailable(rusty, "story", 0), "Rusty never spawns in story mode");
  check(isAvailable(rusty, "open", 0), "Rusty lives in the Online world");

  const graypaw = profileFor("graypaw");
  for (let s = 0; s <= 16; s++) check(isAvailable(graypaw, "story", s), `Graypaw present at step ${s}`);
}

console.log("\n--- dialogue variety: talked counts rotate openings ---");
{
  const openings = new Set<string>();
  for (let t = 0; t < 6; t++) {
    openings.add(buildDialogue("graypaw", baseCtx({ talked: { graypaw: t } })).opening);
  }
  check(openings.size >= 3, `Graypaw opening variety across talks (${openings.size}/6 unique)`);
  const hours = new Set<string>();
  for (const h of [2, 7, 12, 19, 23]) {
    hours.add(buildDialogue("whitestorm", baseCtx({ hour: h })).opening);
  }
  check(hours.size >= 3, `Whitestorm opening varies by time band (${hours.size}/5 unique)`);
}

console.log("\n--- bonds change tone ---");
{
  const cold = buildDialogue("dustpaw", baseCtx({ bonds: { dustpaw: -3 } }));
  const warm = buildDialogue("dustpaw", baseCtx({ bonds: { dustpaw: 3 } }));
  check(cold.choices.some((c) => /Good to see you/.test(c.label)) === false, "dustpaw hostile: no warm greeting label");
  check(warm.choices.some((c) => /Good to see you/.test(c.label)) === true, "dustpaw friendly: warm greeting label");
}

console.log("\n--- pickNpcChatLines: 3 relation-aware lines ---");
{
  const pairs: [string, string, string][] = [
    ["tigerclaw", "ravenpaw", "mentor-apprentice"],
    ["dustpaw", "sandpaw", "apprentice-peers"],
    ["frostfur", "brindleface", "queens"],
    ["one-eye", "smallear", "elders"],
    ["bluestar", "lionheart", "leader-deputy"],
    ["spottedleaf", "yellowfang", "medicine"],
    ["smudge", "henry", "kittypets"],
    ["bluestar", "tallstar", "cross-clan"],
  ];
  for (const [a, b, rel] of pairs) {
    const lines = pickNpcChatLines(a, b, 7);
    check(lines.length === 3 && lines.every((l) => l.length > 0), `${a}+${b} (${rel}): 3 lines`);
    const rotated = pickNpcChatLines(a, b, 8);
    check(rotated.some((l, i) => l !== lines[i]) || lines.length <= 1, `${a}+${b}: salt rotates lines`);
  }
}

console.log("\n--- story beats: hand-authored openings at their steps ---");
{
  const beats: [string, number][] = [
    ["smudge", 0], ["graypaw", 2], ["bluestar", 4], ["lionheart", 5],
    ["spottedleaf", 6], ["oakheart", 10], ["yellowfang", 11], ["tallstar", 12],
  ];
  for (const [id, step] of beats) {
    const tree = buildDialogue(id, baseCtx({ mode: "story", storyStep: step }));
    check(tree.opening.length > 30, `${id}@step${step}: authored story opening`);
  }
}

console.log("\n--- every roster NPC builds a dialogue tree ---");
import { npcs } from "../src/game/world";
{
  let bad = 0;
  for (const n of npcs) {
    try {
      const tree = buildDialogue(n.id, baseCtx());
      if (!tree.opening || tree.choices.length < 5) bad++;
    } catch {
      bad++;
      console.error(`      buildDialogue threw for ${n.id}`);
    }
  }
  check(bad === 0, `all ${npcs.length} NPCs build full trees (${bad} bad)`);
}

console.log(failures === 0 ? "\nALL DIALOGUE CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
