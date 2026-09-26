import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { appearance } from "../game/saveShared";

const STALE_MS = 20_000;

/** Heartbeat: upsert this player's presence row. */
export const heartbeat = mutation({
  args: {
    x: v.number(),
    y: v.number(),
    facing: v.number(),
    moving: v.boolean(),
    emote: v.optional(v.string()),
    mode: v.union(v.literal("story"), v.literal("open")),
    catName: v.string(),
    clan: v.optional(v.string()),
    rank: v.optional(v.string()),
    appearance,
    inputSequence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x: args.x,
      y: args.y,
      facing: args.facing,
      moving: args.moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      updatedAt: now,
    });
    return id;
  },
});

/** List other live open-world players (excludes self and stale rows). */
export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db.query("presence").collect();
    const cutoff = Date.now() - STALE_MS;
    return rows
      .filter((r) => r.userId !== userId && r.updatedAt > cutoff)
      .map((r) => ({
        userId: r.userId,
        catName: r.catName,
        clan: r.clan,
        rank: r.rank,
        appearance: r.appearance,
        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
      }));
  },
});

/** Remove my presence row (called on unmount/beforeunload best-effort). */
export const leave = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
