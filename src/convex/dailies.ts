// §8 daily activities — rotating optional tasks that give players a reason to
// return. Task TEXT is derived deterministically from (UTC date, userId) via
// src/game/dailiesShared.ts (same file the client/checks import), so only
// progress + streak live in the players row. Every task is earned through
// real gameplay events; nothing is mandatory and nothing is purchasable.
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  dailyDefsFor,
  freshDailyState,
  FULL_SWEEP_BONUS_XP,
  streakAfterFullDay,
  utcDate,
  type DailyState,
} from "../game/dailiesShared";

/** Today's three activities for the signed-in player (+ streak/progress). */
export const getDaily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) return null;
    const today = utcDate();
    const state: DailyState =
      p.dailies && p.dailies.date === today
        ? p.dailies
        : freshDailyState(p.dailies, today);
    const tasks = dailyDefsFor(today, userId).map((def, i) => ({
      ...def,
      progress: Math.min(def.target, state.progress[i] ?? 0),
      claimed: state.claimed[i] ?? false,
    }));
    return {
      date: today,
      tasks,
      streak: state.streak,
      allDone: state.claimed.every(Boolean),
    };
  },
});

/**
 * Report progress on ONE activity by KIND (the client reports what actually
 * happened in the world: a prey catch, a new area, a lore marker, a chat...).
 * The server only counts the kind if it is among TODAY's tasks — a stale
 * client reporting yesterday's activity is simply ignored. Reaching the
 * target claims the task once (grants its XP); finishing all three grants
 * the sweep bonus and extends/starts the streak.
 */
export const progressDaily = mutation({
  args: { kind: v.string(), delta: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) return null;
    const today = utcDate();
    const defs = dailyDefsFor(today, userId);
    const idx = defs.findIndex((t) => t.kind === args.kind);
    if (idx === -1) return null; // not one of today's tasks
    const state: DailyState =
      p.dailies && p.dailies.date === today
        ? p.dailies
        : freshDailyState(p.dailies, today);
    if (state.claimed[idx]) return { granted: 0, claimed: true, sweep: false };

    const def = defs[idx];
    const delta = Math.max(1, Math.floor(args.delta ?? 1));
    state.progress[idx] = Math.min(def.target, (state.progress[idx] ?? 0) + delta);

    let granted = 0;
    let sweep = false;
    if (state.progress[idx] >= def.target) {
      state.claimed[idx] = true;
      granted += def.xp;
      if (state.claimed.every(Boolean)) {
        if (state.lastFullDay !== today) granted += FULL_SWEEP_BONUS_XP;
        state.streak = streakAfterFullDay(state, today);
        state.lastFullDay = today;
        sweep = true;
      }
    }

    // XP + rank mirrors addXp thresholds so dailies never bypass the ladder.
    let patch: Record<string, unknown> = { dailies: state, updatedAt: Date.now() };
    if (granted > 0) {
      const xp = (p.xp ?? 0) + granted;
      let rank = p.rank ?? "kit";
      if (xp >= 300) rank = "warrior";
      else if (xp >= 100) rank = "apprentice";
      patch = { ...patch, xp, rank };
    }
    await ctx.db.patch(p._id, patch);
    return {
      granted,
      claimed: state.claimed[idx],
      sweep,
      progress: state.progress[idx],
      streak: state.streak,
    };
  },
});
