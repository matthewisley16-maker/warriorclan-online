// check-staging.ts — §1-§34: story character staging + story-driven movement.
// Behavioral checks import the dependency-free staging module (plus the real
// world/story data); engine + Game wiring is verified statically.
import * as fs from "fs";
import { beatActorIds, resolveStaging, STAGED_STEPS, STORY_LOCATIONS } from "../src/game/storyStaging";
import { STORY_BEATS, STORY_INTRO } from "../src/game/storyCinematics";
import { storySteps } from "../src/game/story";
import { npcs, WORLD_W, WORLD_H } from "../src/game/world";

let ok = 0;
let bad = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    ok++;
    console.log(`  ok  ${msg}`);
  } else {
    bad++;
    console.log(`FAIL  ${msg}`);
  }
}

const engine = fs.readFileSync("src/game/engine.ts", "utf8");
const game = fs.readFileSync("src/pages/Game.tsx", "utf8");

const worldNpcIds = new Set(npcs.map((n) => n.id));
const clanOf = new Map(npcs.map((n) => [n.id, n.clan]));

console.log("--- staging database: every step, real cats, real places ---");
check(storySteps.length === 17, "17 story steps exist");
check(storySteps.every((s) => STAGED_STEPS[s.id] !== undefined), "EVERY story step has a staging entry");
const allStaged = Object.values(STAGED_STEPS).flatMap((s) => s.npcs);
check(allStaged.every((n) => worldNpcIds.has(n.npcId)), "every staged character is a REAL world NPC (no ghosts, no duplicates by construction)");
check(allStaged.every((n) => STORY_LOCATIONS && typeof n.x === "number" && typeof n.y === "number"), "every staged position is concrete");
check(allStaged.every((n) => n.x > 0 && n.y > 0 && n.x < WORLD_W && n.y < WORLD_H), "every staged position is inside the playable world (no walls/off-map marks)");
check(allStaged.every((n) => ["main", "secondary", "background"].includes(n.priority)), "every staged cat has a defined priority (main/secondary/background)");

console.log("--- no overlap, per scene (§14) ---");
let overlaps = 0;
for (const [stepId, s] of Object.entries(STAGED_STEPS)) {
  for (let i = 0; i < s.npcs.length; i++) {
    for (let j = i + 1; j < s.npcs.length; j++) {
      const a = s.npcs[i];
      const b = s.npcs[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 14) overlaps++;
    }
  }
  void stepId;
}
check(overlaps === 0, "no two staged characters share a position in any scene");

console.log("--- the story script is the source of truth (§24) ---");
for (const step of storySteps) {
  if (step.objective.kind === "talk") {
    const staged = STAGED_STEPS[step.id]?.npcs.find((n) => n.npcId === step.objective.targetNpc && n.npcId !== "smudge" || n.npcId === step.objective.targetNpc);
    check(Boolean(staged && staged.priority === "main"), `${step.id}: objective NPC "${step.objective.targetNpc}" is staged MAIN at the scene`);
  }
}
check(Object.keys(STORY_BEATS).every((id) => {
  const actors = beatActorIds(STORY_BEATS[id]);
  const staged = new Set(STAGED_STEPS[id]?.npcs.map((n) => n.npcId) ?? []);
  return actors.every((a) => staged.has(a));
}), "every beat actor is staged in that step (speakers exist in the scene)");
check(beatActorIds(STORY_INTRO).length === 0 && STAGED_STEPS["s1-twolegplace"].npcs.some((n) => n.npcId === "smudge" && n.priority === "main"), "the intro is narrator-voiced only, and its world actor (Smudge) is staged main in the opening scene");

console.log("--- kittypets never wander into Clan territory (§3) ---");
const kittypets = allStaged.filter((n) => clanOf.get(n.npcId) === "kittypet");
check(kittypets.length > 0 && kittypets.every((n) => n.x > 2200), "kittypets are always staged in Twolegplace (x > 2200), never in the forest camps");

console.log("--- engine: physical travel, no teleport staging (§10/§11/§32) ---");
check(engine.includes("export interface StoryAnchor"), "engine exposes the StoryAnchor contract");
check(engine.includes("setNpcStoryAnchor(") && engine.includes("placeNpcForStory(") && engine.includes("clearNpcStoryAnchor("), "anchor set / init-placement / release APIs exist");
check(engine.includes("clearOtherStoryAnchors(") && engine.includes("setStoryStagingExclusion(") && engine.includes("getNpcStoryInfo(") && engine.includes("waitForStoryArrival("), "step-change release + exclusion zone + debug info + arrival gate exist");
check(engine.includes("private stepNpcStoryAnchor(n: NPCState, dt: number)") && engine.includes("const speed = a.run ? 96 : 60"), "anchored cats TRAVEL per-frame at believable speeds (walk / run)");
check(engine.includes("if (!isSolidPoint(nx, n.y)) n.x = nx;") && engine.includes("if (!isSolidPoint(n.x, ny)) n.y = ny;"), "anchor movement is collision-checked per axis (never through walls)");
check(engine.includes("this.time - a.travelSince > 2.5") && engine.includes("a.sidestepAt = this.time;"), "stuck detection: a stalled traveler tries a sidestep waypoint (throttled)");
check(engine.includes("if (this.time - a.travelSince > 9) {"), "last-resort recovery fires after 9s WITHOUT progress (not reset by sidesteps)");
check(engine.includes("this.nearestFreeNpcSpot(a.x, a.y) ?? { x: a.x, y: a.y }"), "last-resort recovery snaps to the nearest FREE tile by the mark (story never permanently breaks)");
check(!/n\.x = a\.x;\s*\n\s*n\.y = a\.y;/.test(engine), "the anchor loop never teleports straight onto the mark");
check(engine.includes("n.ai === \"idle\" && n.def.wander && !n.storyAnchor"), "story anchors override the normal schedule (§2/§24: story wins)");
check(engine.includes("this.time >= n.aiThinkAt && !n.convoActive && !n.storyAnchor"), "anchored cats are not re-decided by normal AI mid-scene");
check(engine.includes("if (n.storyAnchor) {\n        this.stepNpcStoryAnchor(n, dt);\n        continue;\n      }"), "the NPC loop drives anchored cats through the dedicated staging step");
check(engine.includes("if (this.storyExclusion) this.avoidStoryExclusion();"), "background cats are pushed out of the staging exclusion (§17)");
check(engine.includes("n.storyAvoidUntil = this.time + 3;") && engine.includes('"giving the scene space"'), "exclusion avoidance is throttled and communicated as an activity");
check(engine.includes("clearNpcStoryAnchor(npcId: string) {\n    const n = this.npcStates.find((s) => s.def.id === npcId);\n    if (!n || !n.storyAnchor) return;\n    n.storyAnchor = undefined;\n    n.ai = \"idle\";\n    n.tx = n.x;\n    n.ty = n.y;"), "released cats resume normal life FROM WHERE THEY ARE (no reset home, §30)");

console.log("--- game wiring: staging on boot/step change, arrival-gated dialogue ---");
check(game.includes("import { beatActorIds, resolveStaging } from \"@/game/storyStaging\";"), "Game imports the staging system");
check(game.includes("const plan = resolveStaging(step.id);") && game.includes("g.clearOtherStoryAnchors(keep);"), "each step applies its staging and releases cats the story no longer stages (§20)");
check(game.includes("dist > 1400") && game.includes("g.placeNpcForStory(role.npcId"), "far placement is a controlled scene-init reposition (>1400px only, §32); closer cats WALK");
check(game.includes("run: dist > 260"), "long walks get urgency (run); short ones stay natural");
check(game.includes('g.setStoryStagingExclusion({ x: plan.scene.x, y: plan.scene.y, r: plan.scene.r })') && game.includes("g.setStoryStagingExclusion(null);"), "the scene exclusion is applied per step and cleared when none");
check(game.split("waitForStoryArrival(").length >= 3, "BOTH the opening and every step beat wait for cast arrival (§12/§22)");
check(game.includes("waitForStoryArrival(beatActorIds(beat), 4500)") && game.includes("waitForStoryArrival([\"smudge\"], 5000)"), "arrival waits are bounded — a stuck cat can never stall the story");
check(game.includes("if (!cancelled) setCineBeat(beat);"), "the beat only starts after arrival resolved");
check(game.includes("?storydebug") && game.includes("wcrpg-story-debug") && game.includes("Story staging (dev)"), "§33 debug overlay exists but is flag-gated (never visible to players)");
check(game.includes("if (!g || phase !== \"playing\" || mode !== \"story\") return;") && game.includes("const plan = resolveStaging(storySteps[storyStep]?.id);"), "debug polling is story-mode only");

console.log("--- continuity: locations persist via deterministic staging (§21/§30) ---");
check(STAGED_STEPS["s17-epilogue"].npcs.some((n) => n.npcId === "graypaw" && n.label.includes("sharing")), "the epilogue stages Graypaw at the fresh-kill pile (continuity to the final scene)");
const campSteps = ["s4-the-camp", "s5-bluestar", "s6-test-lionheart", "s7-firepaw", "s8-hunt-first", "s17-epilogue"];
check(campSteps.every((id) => STAGED_STEPS[id].npcs.some((n) => n.npcId === "bluestar")), "Bluestar is staged in camp across every camp chapter (no random absence)");
check(campSteps.every((id) => !STAGED_STEPS[id].npcs.some((n) => n.npcId === "smudge" && !n.label.includes("home"))), "Smudge stays HOME during camp chapters (never randomly in ThunderClan territory)");

console.log(`\n${bad === 0 ? "ALL STORY-STAGING CHECKS PASS" : `${bad} CHECK(S) FAILED`} (${ok} ok)`);
if (bad > 0) process.exit(1);
