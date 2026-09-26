import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const MAX_LEN = 240;

/** Basic profanity/spam filter — keeps the chat family-friendly. */
const BLOCKED = [
  /\b(nigger|nigga|faggot|kike|spic|chink|retard)\b/i,
  /\b(fuck|shit|bitch|asshole|cunt|dick|pussy)\b/i,
  /https?:\/\//i, // no links
];

function clean(text: string): string | null {
  const trimmed = text.trim().slice(0, MAX_LEN);
  if (!trimmed) return null;
  for (const re of BLOCKED) {
    if (re.test(trimmed)) return null;
  }
  return trimmed;
}

export const send = mutation({
  args: {
    channel: v.union(v.literal("global"), v.literal("clan"), v.literal("local")),
    clan: v.optional(v.string()),
    catName: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const user = await ctx.db.get(userId);
    const text = clean(args.text);
    if (!text) return false;
    // Use the player's cat name — that is the identity other players see.
    const catName = (args.catName ?? "").trim().slice(0, 24);
    const name = catName || (user?.name ?? user?.email?.split("@")[0] ?? "A cat");
    await ctx.db.insert("messages", {
      fromUserId: userId,
      fromName: name,
      channel: args.channel,
      clan: args.clan,
      x: args.x,
      y: args.y,
      text,
      createdAt: Date.now(),
    });
    return true;
  },
});

/** Recent messages for a channel. Clan channel filters by clan. */
export const list = query({
  args: {
    channel: v.union(v.literal("global"), v.literal("clan"), v.literal("local")),
    clan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const all = await ctx.db.query("messages").collect();
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes of history
    return all
      .filter((m) => {
        if (m.createdAt < cutoff) return false;
        if (args.channel === "clan") return m.clan === args.clan;
        if (args.channel === "global") return m.channel === "global";
        return false; // local chat is rendered client-side from global feed
      })
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-60)
      .map((m) => ({
        id: m._id,
        fromName: m.fromName,
        fromUserId: m.fromUserId,
        channel: m.channel,
        clan: m.clan,
        x: m.x,
        y: m.y,
        text: m.text,
        createdAt: m.createdAt,
        mine: m.fromUserId === userId,
      }));
  },
});
