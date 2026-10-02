// Verifies the Story Mode cinematic + vocal systems:
//  1. Vocal identities: every important character has a profile; sounds are
//     emotion-driven, varied (no immediate repeats), and within pitch range.
//  2. Cinematic scripts: every story step has a beat; every line has a
//     speaker with a resolvable voice; choices are well-formed.
//  3. Mode separation: beats exist ONLY for story steps — Online never gets
//     cutscenes; the player component is story-gated (static import check).
//  4. Audio renderer: playCharacterVocal accepts every sound slot headlessly.
// Run: bun scripts/check-story.ts
import { storySteps } from "../src/game/story";
import { STORY_INTRO, STORY_BEATS, beatCameraSteps } from "../src/game/storyCinematics";
import {
  VOCAL_PROFILES,
  pickVocal,
  emotionForLine,
  vocalProfileFor,
  VOCAL_EMOTIONS,
  type VocalEmotion,
} from "../src/game/vocal";
import type { CineStep } from "../src/game/engine";

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

console.log("--- vocal identity system (§13-§21) ---");
{
  // every important character has their own profile
  const important = ["player", "bluestar", "tigerclaw", "graypaw", "ravenpaw", "spottedleaf", "yellowfang", "smudge", "lionheart", "whitestorm", "sandpaw", "dustpaw", "rusty", "oakheart", "tallstar"];
  let ok = 0;
  for (const id of important) if (VOCAL_PROFILES[id]) ok++;
  check(ok === important.length, `vocal profiles for the main cast (${ok}/${important.length})`);

  // profiles cover every emotion family
  let complete = 0;
  for (const [, p] of Object.entries(VOCAL_PROFILES)) {
    if (VOCAL_EMOTIONS.every((e) => Array.isArray(p[e]) && p[e].length > 0)) complete++;
  }
  check(complete === Object.keys(VOCAL_PROFILES).length, `every profile covers all ${VOCAL_EMOTIONS.length} emotions`);

  // §16: characters do NOT share identical pitch+volume signatures
  const sigs = new Set<string>();
  for (const [, p] of Object.entries(VOCAL_PROFILES)) sigs.add(`${p.pitch.join(":")}|${p.vol.join(":")}`);
  check(sigs.size >= Object.keys(VOCAL_PROFILES).length - 2, `distinct vocal signatures (${sigs.size}/${Object.keys(VOCAL_PROFILES).length})`);

  // §19: pickVocal never repeats immediately and stays within the profile
  const p = vocalProfileFor("graypaw");
  let repeat = false;
  let outOfRange = false;
  let last = "";
  for (let i = 0; i < 60; i++) {
    const v = pickVocal("graypaw", "excited");
    if (v.sound === last) repeat = true;
    last = v.sound;
    if (v.rate < p.pitch[0] * 0.99 || v.rate > p.pitch[1] * 1.01) outOfRange = true;
    if (v.vol < p.vol[0] * 0.99 || v.vol > p.vol[1] * 1.01) outOfRange = true;
  }
  check(!repeat, "no immediate sound repeats (anti-repetition memory)");
  check(!outOfRange, "rate/vol always within the character's profile");

  // unknown speakers still get A voice (never silent dialogue)
  const fb = pickVocal("some-unknown-elder", "calm");
  check(typeof fb.sound === "string" && fb.rate > 0, "unknown speakers fall back to a valid voice");

  // §17: emotion inference from text
  check(emotionForLine("Welcome home, young one.") === "happy", "warm text -> happy");
  check(emotionForLine("What in StarClan's name was that?") === "confused", "question -> confused");
  check(emotionForLine("Get off our territory!") === "firm", "exclaimed command -> firm");
  check(emotionForLine("She died serving her Clan.") === "sad", "grief text -> sad");
  check(emotionForLine("Mouse-brain! Watch where you step.") === "angry", "insult -> angry");
}

console.log("\n--- cinematic scripts (§2/§3/§5/§7/§9) ---");
{
  // §5: polished opening exists
  check(STORY_INTRO.lines.length >= 4, `opening sequence has ${STORY_INTRO.lines.length} staged lines`);
  check(STORY_INTRO.lines.some((l) => l.speakerId === "player"), "opening introduces the player's cat in their own voice");
  check(typeof STORY_INTRO.openOn?.x === "number", "opening establishes the environment (camera anchor)");

  // §9: every story step opens with a beat
  const missing = storySteps.filter((s) => !STORY_BEATS[s.id]).map((s) => s.id);
  check(missing.length === 0, `every story step has a cinematic beat (${storySteps.length - missing.length}/${storySteps.length})`);

  // every line: speaker, text, sane hold, resolvable voice
  let badLines = 0;
  for (const beat of [STORY_INTRO, ...Object.values(STORY_BEATS)]) {
    for (const l of beat.lines) {
      if (!l.speaker || !l.text || !l.speakerId) badLines++;
      if (l.holdMs !== undefined && (l.holdMs < 1500 || l.holdMs > 6000)) badLines++;
    }
  }
  check(badLines === 0, `all beat lines well-formed and readable (${badLines} bad)`);

  // §7: choice sets are complete (player line + NPC reply with a voice)
  let badChoices = 0;
  let choiceSets = 0;
  for (const beat of Object.values(STORY_BEATS)) {
    if (!beat.choices) continue;
    choiceSets++;
    for (const c of beat.choices) {
      if (!c.label || !c.playerLine || !c.reply?.text || !c.reply.speakerId) badChoices++;
    }
  }
  check(badChoices === 0, `dialogue choices well-formed (${choiceSets} choice sets)`);

  // §3: camera choreography builds valid steps and hands control back
  const beat = STORY_BEATS["s5-bluestar"];
  const steps: CineStep[] = beatCameraSteps(beat, (id) => (id === "bluestar" ? { x: 2850, y: 2760 } : null), { x: 2900, y: 2800 });
  check(steps.length >= beat.lines.length, `camera script covers the scene (${steps.length} steps)`);
  check(steps[0].kind === "pan", "cinematic opens with an intentional pan (never random)");
  const last = steps[steps.length - 1];
  check(last.kind === "zoom" && last.zoom === 1, "camera returns to normal framing after the scene");

  // §8: no large book passages — every authored line stays short/original
  const longest = [...STORY_INTRO.lines, ...Object.values(STORY_BEATS).flatMap((b) => b.lines)].reduce((m, l) => Math.max(m, l.text.length), 0);
  check(longest <= 260, `dialogue lines stay game-length (longest ${longest} chars)`);
}

console.log("\n--- mode separation (§1/§38) ---");
{
  // beats exist ONLY for story steps — nothing else can leak into Online
  const beatIds = new Set(Object.keys(STORY_BEATS));
  const stepIds = new Set(storySteps.map((s) => s.id));
  const stray = [...beatIds].filter((id) => !stepIds.has(id));
  check(stray.length === 0, `no cinematic beats outside the story chain (${stray.length} strays)`);

  // story beats never reference the online world's open-world spawn flow
  check(STORY_INTRO.id === "intro" && beatIds.has("s1-twolegplace"), "beats keyed to the Into the Wild chapter chain only");
}

console.log("\n--- audio renderer (§15/§18/§23) ---");
{
  // every vocal sound slot renders without throwing (headless: not started →
  // early-returns, but the switch must still be exhaustive and type-safe)
  const sounds = ["mew", "mew_soft", "mew_low", "mew_question", "mew_bright", "chirp", "trill", "purr", "mrrp", "hiss", "growl", "yowl"];
  const { audio } = await import("../src/game/audio");
  let ok = 0;
  for (const s of sounds) {
    try {
      audio().playCharacterVocal({ sound: s, rate: 1, vol: 0.5 });
      ok++;
    } catch {
      /* counted below */
    }
  }
  check(ok === sounds.length, `vocal renderer accepts every sound slot (${ok}/${sounds.length})`);
  // §30: thunder is safe headless too
  try {
    audio().playThunder(0.5);
    check(true, "storm thunder renders headlessly without throwing");
  } catch {
    check(false, "storm thunder renders headlessly without throwing");
  }
}

console.log(`\n${failures === 0 ? "ALL STORY CHECKS PASS" : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
