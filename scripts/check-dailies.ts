// check-dailies.ts — §8/§9/§27: daily activities, world events and titles.
// Verifies the shared logic BEHAVIORALLY (bun imports the dependency-free
// src/game modules directly) and the wiring statically.
import * as fs from "fs";
import { dailyDefsFor, DAILY_KINDS, freshDailyState, streakAfterFullDay, yesterdayOf, utcDate, FULL_SWEEP_BONUS_XP, type DailyState } from "../src/game/dailiesShared";
import { TITLES, TITLE_IDS, earnedTitleIds, titleLabel } from "../src/game/titles";

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

const game = fs.readFileSync("src/pages/Game.tsx", "utf8");
const dailies = fs.readFileSync("src/convex/dailies.ts", "utf8");
const players = fs.readFileSync("src/convex/players.ts", "utf8");
const schema = fs.readFileSync("src/convex/schema.ts", "utf8");
const menu = fs.readFileSync("src/pages/MainMenu.tsx", "utf8");
const shared = fs.readFileSync("src/game/dailiesShared.ts", "utf8");

console.log("--- shared logic: behavior (imported headless) ---");
const today = utcDate();
const uid = "test-user-0001";
const a1 = JSON.stringify(dailyDefsFor(today, uid));
check(a1 === JSON.stringify(dailyDefsFor(today, uid)), "task set is deterministic for (date, player)");
const defs = dailyDefsFor(today, uid);
check(defs.length === 3, "exactly 3 tasks per day");
check(new Set(defs.map((d) => d.kind)).size === 3, "all 3 tasks are DISTINCT kinds");
check(defs.every((d) => DAILY_KINDS.includes(d.kind)), "kinds come from the known pool");
check(defs.every((d) => d.target >= 1 && d.xp > 0 && d.label.length > 3 && d.hint.length > 3), "every task has a real target, XP, label and hint");
// variety: some other day must mix it up (12-date sweep — same 3 kinds every
// day would defeat the "sessions feel different" goal)
const baseKinds = defs.map((d) => d.kind).sort().join(",");
const varied = Array.from({ length: 12 }, (_, i) => {
  const d2 = new Date(`${today}T00:00:00.000Z`);
  d2.setUTCDate(d2.getUTCDate() + i + 1);
  return dailyDefsFor(utcDate(d2), uid).map((x) => x.kind).sort().join(",");
});
check(varied.some((k) => k !== baseKinds), "task mix VARIES across days (rotating, not fixed)");
const variedByPlayer = Array.from({ length: 12 }, (_, i) => dailyDefsFor(today, `user-${i}`).map((x) => x.kind).sort().join(","));
check(variedByPlayer.some((k) => k !== baseKinds), "task mix VARIES across players");

console.log("--- streak logic ---");
const st = (s?: Partial<DailyState>) => streakAfterFullDay(s as DailyState | undefined, today);
check(st(undefined) === 1, "first full day starts streak at 1");
check(st({ streak: 2, lastFullDay: yesterdayOf(today) }) === 3, "consecutive day extends the streak");
check(st({ streak: 5, lastFullDay: "2020-01-01" }) === 1, "a gap resets the streak to 1");
check(st({ streak: 3, lastFullDay: today }) === 3, "same-day re-entry is idempotent");
const fs0 = freshDailyState({ date: yesterdayOf(today), progress: [9, 9, 9], claimed: [true, true, true], streak: 4 }, today);
check(fs0.streak === 4 && fs0.progress.every((p) => p === 0) && !fs0.claimed.some(Boolean), "new day keeps the streak, resets progress");
check(FULL_SWEEP_BONUS_XP > 0, "full sweep grants a bonus");

console.log("--- titles: earned, cosmetic only ---");
check(TITLES.length >= 8 && TITLE_IDS.length === TITLES.length, "a real title catalogue exists (ids unique)");
check(TITLES.every((t) => !/\$|pay|purchase|buy/i.test(t.label + t.how)), "titles are descriptive — never purchasable");
check(titleLabel("explorer") === "the Explorer" && titleLabel("nope") === undefined, "titleLabel resolves known ids only");
const e1 = earnedTitleIds({ discoveredCount: 5, xp: 0 });
const e2 = earnedTitleIds({ discoveredCount: 9, xp: 300, huntSkill: 3, questsCount: 6, npcTalkedCount: 3, streak: 3, storyStep: 16 });
check(e1.includes("explorer") && !e1.includes("tracker") && !e1.includes("veteran"), "low-progress player earns only what they should");
check(e2.includes("tracker") && e2.includes("veteran") && e2.includes("hunter") && e2.includes("patrol-cat") && e2.includes("clan-helper") && e2.includes("social-cat") && e2.includes("devoted") && e2.includes("storyteller"), "high-progress player earns the full set");

console.log("--- server: kind-validated progress, idempotent claims ---");
check(dailies.includes("dailyDefsFor(today, userId)") && dailies.includes("streakAfterFullDay") && dailies.includes("freshDailyState"), "server derives tasks from the SHARED module (client + server always agree)");
check(dailies.includes("findIndex((t) => t.kind === args.kind)") && dailies.includes("if (idx === -1) return null"), "unknown/stale kinds are rejected server-side");
check(dailies.includes("if (state.claimed[idx]) return { granted: 0"), "claims are idempotent (no double XP)");
check(dailies.includes("granted += def.xp") && dailies.includes("granted += FULL_SWEEP_BONUS_XP"), "task XP + sweep bonus granted server-side");
check(dailies.includes('xp >= 300') && dailies.includes('xp >= 100'), "rank thresholds mirror addXp (300/100)");
check(!shared.includes("@convex-dev/auth") && !shared.includes("./_generated"), "shared module stays dependency-free (Convex-free)");

console.log("--- schema + title save path ---");
check(schema.includes("title: v.optional(v.string())") && schema.includes("dailies: v.optional("), "players row stores title + dailies (optional — old saves load unchanged)");
check(schema.includes("lastFullDay: v.optional(v.string())"), "dailies state carries streak history");
check(players.includes("export const setTitle") && players.includes("!TITLE_IDS.includes(args.title)"), "setTitle validates against the shared title whitelist");

console.log("--- game wiring: dailies driven by real events ---");
check(game.includes("useQuery(api.dailies.getDaily") && game.includes("useMutation(api.dailies.progressDaily)"), "panel data + progress mutations wired");
check(game.includes('if (mode === "story") return;') && game.includes("reportDailyRef.current(\"hunt\")"), "progress reports gated OFF in story mode; prey catches report hunt");
check(game.includes('["rain", "storm", "snow"].includes(weatherRef.current)'), "wet-weather hunt variant checks the live weather");
check(game.includes('reportDailyRef.current("patrol")') && game.includes('reportDailyRef.current("explore")'), "area changes report patrol (distinct areas) + explore (new discovery)");
check(game.includes('reportDailyRef.current("gather")'), "lore/scent marker investigation reports gather");
check(game.split('reportDailyRef.current("social")').length >= 3, "both chat send AND NPC conversations report social");
check(game.includes("preyBonusUntilRef.current") && game.includes("amount: 6"), "prey-stirring world event makes hunting briefly extra rewarding");

console.log("--- activity panel: optional, minimal, non-blocking ---");
check(game.includes('mode !== "story" && dailiesQ && (') && game.includes("absolute left-3 top-14 z-20 w-60"), "panel lives in the story tracker's slot — open/free only, never overlapping story UI");
check(game.includes("setDailiesMin((m) => !m)") && game.includes("aria-expanded={!dailiesMin}"), "panel is minimizable (players can close it)");
check(game.includes("setDailyToast(`Daily complete · +${t.xp} XP`)") && game.includes('playSfx("quest_done"'), "claiming a task gives subtle sound + micro-toast (never a giant popup)");
check(game.includes("streak}d streak"), "streak is visible in the panel header");

console.log("--- world events: rare, believable, never spam ---");
check(game.includes("90_000 + Math.random() * 150_000"), "events fire with 90–240s randomized gaps (no spam)");
check(game.includes("if (!dialogueRef.current && !npcConvoRef.current)"), "events skip while talking or in a conversation");
check(game.includes("setTimeout(() => setWorldEvent(null), 6500)"), "event banner auto-dismisses (no permanent clutter)");
check(game.includes('if (mode === "story") return;') && game.includes("const EVENTS:"), "story mode is authored — no random events there");
check((game.match(/worldEvent && \(/g) ?? []).length >= 1 && game.includes("pointer-events-none absolute left-1/2 top-24"), "banner is a small non-blocking flavor line");

console.log("--- titles: profile integration ---");
check(menu.includes("onSaveTitle?: (t: string | null) => void") && game.includes("onSaveTitle={(t) => setTitle("), "title selection saves instantly via the whitelist mutation");
check(menu.includes("earnedTitleIds({") && menu.includes("title === id ? null : id"), "only EARNED titles are offered; tapping the selected one clears it");
check(game.includes("npcTalkedCount: player.npcMemory?.talked?.length ?? 0") && game.includes("streak: player.dailies?.streak ?? 0"), "title sources derive from real saved data");
check(menu.includes("“{titleLabel(player.title)}”"), "the equipped title shows on the profile and the menu cat card");

console.log(`\n${bad === 0 ? "ALL DAILY/WORLD/TITLE CHECKS PASS" : `${bad} CHECK(S) FAILED`} (${ok} ok)`);
if (bad > 0) process.exit(1);
