import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SPAWN, CLAN_SPAWNS, appearance } from "../game/saveShared";

export const defaultAppearance = {
  fur: "#d96b2f",
  furDark: "#b04f1d",
  eye: "#4fae6e",
  chest: "#f4e9d8",
  pattern: "solid" as const,
  furLength: 1,
  tail: "normal" as const,
  ears: "normal" as const,
  size: 1,
  scar: false,
};

export const getPlayer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Create the save if absent. */
export const ensurePlayer = mutation({
  args: {
    mode: v.union(v.literal("story"), v.literal("open")),
    appearance,
    catName: v.string(),
  },
  handler: async (ctx, args) => {
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
      mode: args.mode,
      catName: args.catName,
      clan: undefined,
      rank: args.mode === "story" ? "kittypet" : "apprentice",
      xp: 0,
      inventory: [],
      achievements: [],
      appearance: args.appearance,
      x: SPAWN.x,
      y: SPAWN.y,
      discovered: ["camp"],
      storyStep: 0,
      questsDone: [],
      skills: { hunt: 1, fight: 1, herb: 0 },
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/**
 * Update the ONE persistent cat (rename / re-skin / change Clan without
 * creating a new character). Only fields actually provided are changed.
 */
export const updateCat = mutation({
  args: {
    catName: v.optional(v.string()),
    appearance: v.optional(appearance),
    clan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.catName !== undefined) patch.catName = args.catName;
    if (args.appearance !== undefined) patch.appearance = args.appearance;
    if (args.clan !== undefined) {
      patch.clan = args.clan;
      // Moving Clans relocates the cat to the new camp.
      const spawn = CLAN_SPAWNS[args.clan];
      if (spawn) {
        patch.x = spawn.x;
        patch.y = spawn.y;
      }
    }
    await ctx.db.patch(p._id, patch);
    return true;
  },
});

export const savePosition = mutation({
  args: {
    x: v.number(),
    y: v.number(),
    discovered: v.optional(v.array(v.string())),
    /** Client wall-clock at send time: lets the server ignore out-of-order
     *  writes from a previous session (e.g. a sign-out flush racing a
     *  delayed autosave from the same account). */
    clientUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    // stale-write guard: never let an OLDER client timestamp overwrite a
    // NEWER position (race between the periodic autosave and the sign-out
    // flush, or two tabs of the same account).
    const effectiveAt = typeof args.clientUpdatedAt === "number" ? args.clientUpdatedAt : Date.now();
    if (typeof p.updatedAt === "number" && p.updatedAt > effectiveAt + 2000) {
      return false; // a newer save already landed; drop this stale write
    }
    const discovered =
      args.discovered && args.discovered.length > (p.discovered?.length ?? 0)
        ? args.discovered
        : p.discovered;
    await ctx.db.patch(p._id, { x: args.x, y: args.y, discovered, updatedAt: effectiveAt });
    return true;
  },
});

export const completeQuest = mutation({
  args: { questId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const questsDone = p.questsDone ?? [];
    if (questsDone.includes(args.questId)) return false;
    await ctx.db.patch(p._id, {
      questsDone: [...questsDone, args.questId],
      xp: (p.xp ?? 0) + 10,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const setStoryStep = mutation({
  args: { step: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    await ctx.db.patch(p._id, {
      storyStep: Math.max(args.step, p.storyStep ?? 0),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const joinClan = mutation({
  args: { clan: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const spawn = CLAN_SPAWNS[args.clan] ?? SPAWN;
    await ctx.db.patch(p._id, {
      clan: args.clan,
      rank: "apprentice",
      x: spawn.x,
      y: spawn.y,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const addXp = mutation({
  args: { amount: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const xp = (p.xp ?? 0) + args.amount;
    let rank = p.rank ?? "kit";
    if (xp >= 300) rank = "warrior";
    else if (xp >= 100) rank = "apprentice";
    await ctx.db.patch(p._id, { xp, rank, updatedAt: Date.now() });
    return { xp, rank };
  },
});

export const addItem = mutation({
  args: { item: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const inventory = p.inventory ?? [];
    if (inventory.includes(args.item)) return false;
    await ctx.db.patch(p._id, { inventory: [...inventory, args.item], updatedAt: Date.now() });
    return true;
  },
});

export const unlockAchievement = mutation({
  args: { achievement: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    const achievements = p.achievements ?? [];
    if (achievements.includes(args.achievement)) return false;
    await ctx.db.patch(p._id, {
      achievements: [...achievements, args.achievement],
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const resetPlayer = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (p) {
      await ctx.db.patch(p._id, {
        x: SPAWN.x,
        y: SPAWN.y,
        discovered: ["camp"],
        storyStep: 0,
        questsDone: [],
        xp: 0,
        rank: "kittypet",
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});

/** My auth userId (for world-clock leader election). */
export const getMyUserId = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});
