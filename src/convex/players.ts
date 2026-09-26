import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SPAWN } from "../game/world";

/** Get the current player's save. Creates one on first call. */
export const getPlayer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const existing = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing;
    return null;
  },
});

/** Create the initial save. Called by ensurePlayer mutation below. */
export const ensurePlayer = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing;
    const now = Date.now();
    const id = await ctx.db.insert("players", {
      userId,
      catName: "Firepaw",
      x: SPAWN.x,
      y: SPAWN.y,
      discovered: ["thunderclan-territory"],
      questsDone: [],
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/** Save position + any newly discovered areas. */
export const saveProgress = mutation({
  args: {
    x: v.number(),
    y: v.number(),
    discovered: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const player = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!player) throw new Error("No player save");
    const discovered =
      args.discovered && args.discovered.length > player.discovered.length
        ? args.discovered
        : player.discovered;
    await ctx.db.patch(player._id, {
      x: args.x,
      y: args.y,
      discovered,
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** Mark a quest/objective as done (e.g. "met-bluestar"). */
export const completeQuest = mutation({
  args: { questId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const player = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!player) throw new Error("No player save");
    if (player.questsDone.includes(args.questId)) return false;
    const questsDone = [...player.questsDone, args.questId];
    await ctx.db.patch(player._id, { questsDone, updatedAt: Date.now() });
    return true;
  },
});

/** Reset the save back to spawn (used by the "New game" button). */
export const resetPlayer = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const player = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (player) {
      await ctx.db.patch(player._id, {
        x: SPAWN.x,
        y: SPAWN.y,
        discovered: ["thunderclan-territory"],
        questsDone: [],
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});
