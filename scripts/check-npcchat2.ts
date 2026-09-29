// check-npcchat2.ts — Book-accurate identity chat verification.
import { npcChatReply, buildAskMenu } from "../src/game/npcChat";
import { profileFor } from "../src/game/characters";
import type { DialogueContext } from "../src/game/dialogue";

let ok = 0;
let bad = 0;
function check(cond: boolean, msg: string) {
  if (cond) { ok++; console.log(`  ok  ${msg}`); }
  else { bad++; console.log(`FAIL  ${msg}`); }
}

function ctx(mode: "story" | "open", step = 8, over: Partial<DialogueContext> = {}): DialogueContext {
  return {
    mode, storyStep: step, hour: 12, weather: "clear",
    player: { name: "Firepaw", clan: "thunderclan", rank: "apprentice" },
    learned: {}, bonds: {}, talked: {},
    ...over,
  };
}

console.log("--- identity from real profile data ---");
{
  const c = ctx("story", 8);
  const grayName = npcChatReply("graypaw", "What's your name?", c).text;
  const blueName = npcChatReply("bluestar", "What's your name?", c).text;
  const smudgeName = npcChatReply("smudge", "What's your name?", c).text;
  check(/graypaw/i.test(grayName), `Graypaw says his name (${grayName})`);
  check(/bluestar/i.test(blueName) && /leader|nine lives/i.test(blueName), `Bluestar answers as leader (${blueName})`);
  check(!/clan/i.test(smudgeName) || /no|nest|forest club/i.test(smudgeName), `Smudge gives no Clan title (${smudgeName})`);

  const grayAge = npcChatReply("graypaw", "How old are you?", c).text;
  const blueAge = npcChatReply("bluestar", "How old are you?", c).text;
  check(!/\b\d+\s*moons\b/.test(grayAge), `no invented moon numbers (Graypaw: "${grayAge}")`);
  check(!/\b\d+\s*moons\b/.test(blueAge), `no invented moon numbers (Bluestar: "${blueAge}")`);
  check(/six moons|apprentice/i.test(grayAge), `Graypaw uses his canon "six moons" phrase (${grayAge})`);

  const yellowClan = npcChatReply("yellowfang", "What Clan are you from?", c).text;
  check(yellowClan.length > 0, `Yellowfang answers about her Clan (${yellowClan})`);
  const tigerRank = npcChatReply("tigerclaw", "What's your rank?", c).text;
  check(/warrior/i.test(tigerRank), `Tigerclaw states his rank (${tigerRank})`);
  const lionMentor = npcChatReply("lionheart", "Who do you mentor?", c).text;
  check(/graypaw/i.test(lionMentor), `Lionheart names his real apprentice (${lionMentor})`);
  const grayMentor = npcChatReply("graypaw", "Who's your mentor?", c).text;
  check(/lionheart/i.test(grayMentor), `Graypaw names his real mentor (${grayMentor})`);
  const leader = npcChatReply("whitestorm", "Who is your leader?", c).text;
  check(/bluestar/i.test(leader), `Whitestorm names Bluestar (${leader})`);
  const rcLeader = npcChatReply("oakheart", "Who is your leader?", c).text;
  check(/crookedstar/i.test(rcLeader), `Oakheart names Crookedstar (${rcLeader})`);
}

console.log("--- opinion web (same question, different cats) ---");
{
  const c = ctx("story", 8);
  const answers = new Set<string>();
  for (const id of ["bluestar", "tigerclaw", "graypaw", "ravenpaw", "dustpaw", "sandpaw"]) {
    const r = npcChatReply(id, "What do you think about Firepaw?", c).text;
    answers.add(r);
  }
  check(answers.size >= 5, `six cats give six distinct answers (${answers.size} unique)`);
  check(!/firepaw\? who/i.test([...answers].join(" | ")), "Clan cats know Firepaw exists");
  const smudge = npcChatReply("smudge", "What do you think about Bluestar?", c).text;
  check(/who|never met|should i have/i.test(smudge), `Smudge doesn't know Bluestar (${smudge})`);
  const smudgeRusty = npcChatReply("smudge", "What do you think about Rusty?", c).text;
  check(/friend|dusk|miss|cross|firepaw/i.test(smudgeRusty), `Smudge knows Rusty personally (${smudgeRusty})`);
}

console.log("--- knowledge gating unchanged ---");
{
  const smudge = npcChatReply("smudge", "Tell me about StarClan.", ctx("story", 8)).text;
  check(/star|forest|what/i.test(smudge) && !/nine lives|ancestors of|warriors of the sky/i.test(smudge.slice(0, 40)), `Smudge stays confused about StarClan (${smudge})`);
  const learned = ctx("story", 8);
  learned.learned = { smudge: ["starclan"] };
  const smudge2 = npcChatReply("smudge", "Tell me about StarClan.", learned).text;
  check(smudge2 !== smudge, `taught Smudge answers differently (${smudge2})`);
  const henry = npcChatReply("henry", "Tell me about StarClan.", learned).text;
  check(!/silverpelt is where/i.test(henry), `teaching Smudge did NOT teach Henry (${henry})`);
}

console.log("--- relationship tone ---");
{
  const stranger = npcChatReply("ravenpaw", "What do you think about Redtail?", ctx("story", 8)).text;
  const trusted = ctx("story", 15);
  trusted.bonds = { ravenpaw: 3 };
  const truth = npcChatReply("ravenpaw", "What do you think about Redtail?", trusted).text;
  check(/no\.|forget|too much|keep your voice/i.test(stranger), `low-bond Ravenpaw deflects (${stranger})`);
  check(/tigerclaw killed/i.test(truth), `high-bond Ravenpaw at step 15 reveals (${truth})`);
  const hostile = ctx("story", 8);
  hostile.bonds = { tigerclaw: -3 };
  const hostileReply = npcChatReply("tigerclaw", "What's your name?", hostile).text;
  check(/why should i tell/i.test(hostileReply), `hostile Tigerclaw bristles (${hostileReply})`);
}

console.log("--- conversation memory ---");
{
  const c = ctx("open", 8);
  const tell = npcChatReply("bluestar", "I'm training to become a warrior.", c);
  check(tell.fact === "i-am-training" && /training|mentor|code/i.test(tell.text), `fact captured + acknowledged (${tell.text})`);
  const withFacts = ctx("open", 8, { facts: ["bluestar:i-am-training"] });
  const recall = npcChatReply("bluestar", "How is your training going?", withFacts).text;
  check(/training coming|finding your paws|duties|herbs|soft life|wandering|paws out here/i.test(recall), `Bluestar recalls the fact later (${recall})`);
  const noRecall = npcChatReply("graypaw", "How is your training going?", withFacts).text;
  check(!/training coming along, by the way/i.test(noRecall), `memory is per-NPC (Graypaw wasn't told)`);
}

console.log("--- current activity ---");
{
  const busy = ctx("open", 8, { npcActivity: "hunting by the stream" });
  const r = npcChatReply("graypaw", "What were you doing?", busy).text;
  check(/hunting by the stream/i.test(r), `engine activity surfaces in chat (${r})`);
  const idle = npcChatReply("graypaw", "What were you doing?", ctx("open", 8)).text;
  check(idle.length > 0, `idle cat still answers in character (${idle})`);
}

console.log("--- preset ask groups ---");
{
  const asks = buildAskMenu("graypaw", ctx("story", 8));
  check(asks.length >= 3 && asks.length <= 5, `3-5 asks shown (${asks.length})`);
  check(asks.some((a) => /name|old/i.test(a.label)), "About You group present (name/age)");
  check(asks.some((a) => /doing|going/i.test(a.label)), "Current Situation group present");
  const smudgeAsks = buildAskMenu("smudge", ctx("story", 8));
  check(!smudgeAsks.some((a) => /Clan are you in|rank are you|your leader/i.test(a.label)), "kittypet never gets Clan-identity asks");
}

console.log("--- no OOC / no future knowledge ---");
{
  const ooc = /as an ai|npc|database|developer|game|programming|book/i;
  const ids = ["bluestar", "tigerclaw", "graypaw", "ravenpaw", "spottedleaf", "yellowfang", "smudge", "oakheart", "barley"];
  const qs = ["What's your name?", "How old are you?", "What Clan are you in?", "What's your rank?", "Who are your friends?", "What do you think about Firepaw?", "What are you doing?", "What happened recently?", "Who is your leader?"];
  let clean = true;
  for (const id of ids) for (const q of qs) {
    const t = npcChatReply(id, q, ctx("story", 8)).text;
    if (ooc.test(t)) { clean = false; console.log(`   OOC leak: ${id} / ${q} -> ${t}`); }
    if (t.length > 240) { clean = false; console.log(`   too long: ${id} / ${q} (${t.length})`); }
  }
  check(clean, `all ${ids.length * qs.length} answers in-character and concise`);
  // timeline: Redtail's death is unknown before step 2
  const early = npcChatReply("graypaw", "What happened to Redtail?", ctx("story", 0)).text;
  check(!/died|fell|mourn/i.test(early), `pre-death Redtail question deflects (${early})`);
}

console.log(`\n${bad === 0 ? "ALL NPC-AI IDENTITY CHECKS PASS" : `${bad} CHECK(S) FAILED`} (${ok} ok)`);
if (bad > 0) process.exit(1);
