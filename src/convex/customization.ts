import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Account-wide customization extras: favorite item ids and up to 10 named
 * appearance presets. Stored on the players row so one account always gets
 * exactly its own data back.
 */
export const setFavorites = mutation({
  args: { favorites: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    await ctx.db.patch(p._id, { favorites: args.favorites.slice(0, 200) });
    return true;
  },
});

const presetValidator = v.object({
  name: v.string(),
  skin: v.any(), // full CustomSkin (validated client-side, stored opaque)
});

export const savePresets = mutation({
  args: { presets: v.array(presetValidator) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    await ctx.db.patch(p._id, { presets: args.presets.slice(0, 10) });
    return true;
  },
});
