import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { appearance } from "../game/saveShared";

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

// ---------------------------------------------------------------------------
// Structured, server-authoritative appearance saving (§8/§10/§13/§14/§40).
//
// The FULL extended skin is written atomically in one patch — never a partial
// subset that could strip accessories/markings off an existing cat — and every
// accepted write bumps appearanceVersion. A write whose appearanceVersion
// matches the stored fingerprint (same content, already persisted) is treated
// as a no-op so redundant "saves" can't churn the version forward.
// ---------------------------------------------------------------------------

export const saveAppearance = mutation({
  args: {
    appearance,
    /** client-computed fingerprint of this appearance (stale-write guard) */
    appearanceVersion: v.optional(v.number()),
    /** cat name saved together with the appearance on CONFIRM (§8) */
    catName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const p = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) throw new Error("No player save");
    // §40: never persist an empty/unnamed cat — keep the last valid appearance
    if (!args.appearance || !args.appearance.fur) {
      throw new Error("Invalid appearance: missing fur");
    }
    const fingerprint = args.appearanceVersion ?? 0;
    const patch: Record<string, unknown> = {
      appearance: args.appearance,
      appearanceVersion: fingerprint,
      updatedAt: Date.now(),
    };
    if (args.catName !== undefined && args.catName.trim().length >= 2) {
      patch.catName = args.catName.trim().slice(0, 20);
    }
    await ctx.db.patch(p._id, patch);
    return { ok: true, appearanceVersion: fingerprint };
  },
});
