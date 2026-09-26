import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** display name for a user row: prefer the cat's name, never the email */
async function displayInfo(
  db: any,
  userId: any,
): Promise<{ username: string; catName: string | null; clan: string | null; rank: string | null }> {
  const user = await db.get(userId);
  const player = await db
    .query("players")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  return {
    username: (player?.catName || user?.name || user?.email?.split("@")[0] || "Cat") as string,
    catName: player?.catName ?? null,
    clan: player?.clan ?? null,
    rank: player?.rank ?? null,
  };
}

/** minimal public info for search results (no emails, no private data) */
export const searchUser = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return null;
    const q = args.username.trim();
    if (!q) return null;

    // match by cat name or account name (exact, case-insensitive)
    const players = await ctx.db.query("players").collect();
    for (const p of players) {
      if (p.catName.toLowerCase() === q.toLowerCase()) {
        const isMe = p.userId === meId;
        return {
          userId: p.userId as string,
          username: p.catName,
          catName: p.catName,
          clan: p.clan ?? null,
          rank: p.rank ?? null,
          isMe,
        };
      }
    }
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if ((u.name ?? "").toLowerCase() === q.toLowerCase()) {
        const isMe = u._id === meId;
        return {
          userId: u._id as string,
          username: u.name ?? "Cat",
          catName: null,
          clan: null,
          rank: null,
          isMe,
        };
      }
    }
    return null; // player not found
  },
});

export const sendRequest = mutation({
  args: { toUserId: v.id("users") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    if (args.toUserId === meId) throw new Error("You cannot add yourself");

    // already friends?
    const [x, y] = [meId, args.toUserId].sort();
    const existing = await ctx.db
      .query("friendships")
      .withIndex("by_a", (q) => q.eq("aUserId", x))
      .filter((f) => f.eq(f.field("bUserId"), y))
      .first();
    if (existing) throw new Error("Already friends");

    // duplicate request in either direction?
    const sent = await ctx.db
      .query("friendRequests")
      .withIndex("by_from", (q) => q.eq("fromUserId", meId))
      .filter((f) => f.eq(f.field("toUserId"), args.toUserId))
      .first();
    if (sent) return sent._id; // idempotent: request already exists
    const incoming = await ctx.db
      .query("friendRequests")
      .withIndex("by_to", (q) => q.eq("toUserId", meId))
      .filter((f) => f.eq(f.field("fromUserId"), args.toUserId))
      .first();
    if (incoming) {
      // they already asked us — auto-accept
      await ctx.db.insert("friendships", { aUserId: x, bUserId: y, createdAt: Date.now() });
      await ctx.db.delete(incoming._id);
      return null;
    }
    return await ctx.db.insert("friendRequests", {
      fromUserId: meId,
      toUserId: args.toUserId,
      createdAt: Date.now(),
    });
  },
});

export const acceptRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    const req = await ctx.db.get(args.requestId);
    if (!req || req.toUserId !== meId) throw new Error("Request not found");
    const [x, y] = [req.fromUserId, req.toUserId].sort();
    await ctx.db.insert("friendships", { aUserId: x, bUserId: y, createdAt: Date.now() });
    await ctx.db.delete(args.requestId);
  },
});

export const declineRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    const req = await ctx.db.get(args.requestId);
    if (!req || req.toUserId !== meId) throw new Error("Request not found");
    await ctx.db.delete(args.requestId);
  },
});

export const cancelRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    const req = await ctx.db.get(args.requestId);
    if (!req || req.fromUserId !== meId) throw new Error("Request not found");
    await ctx.db.delete(args.requestId);
  },
});

export const removeFriend = mutation({
  args: { friendUserId: v.id("users") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    const [x, y] = [meId, args.friendUserId].sort();
    const row = await ctx.db
      .query("friendships")
      .withIndex("by_a", (q) => q.eq("aUserId", x))
      .filter((f) => f.eq(f.field("bUserId"), y))
      .first();
    if (!row) throw new Error("Not friends");
    await ctx.db.delete(row._id);
  },
});

export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return [];
    const asA = await ctx.db.query("friendships").withIndex("by_a", (q) => q.eq("aUserId", meId)).collect();
    const asB = await ctx.db.query("friendships").withIndex("by_b", (q) => q.eq("bUserId", meId)).collect();
    const friendIds = [...asA.map((r) => r.bUserId), ...asB.map((r) => r.aUserId)];
    const out = [];
    for (const fid of friendIds) {
      const info = await displayInfo(ctx.db, fid);
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", fid))
        .first();
      const online = presence ? Date.now() - presence.updatedAt < 20000 : false;
      out.push({
        userId: fid as string,
        username: info.username,
        catName: info.catName,
        clan: info.clan,
        rank: info.rank,
        online,
        mode: online && presence ? (presence.mode === "story" ? "Story Mode" : "Open World") : null,
      });
    }
    return out;
  },
});

export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return { incoming: [], outgoing: [] };
    const incoming = await ctx.db.query("friendRequests").withIndex("by_to", (q) => q.eq("toUserId", meId)).collect();
    const outgoing = await ctx.db.query("friendRequests").withIndex("by_from", (q) => q.eq("fromUserId", meId)).collect();
    const mapReq = async (r: any, dir: "in" | "out") => {
      const other = dir === "in" ? r.fromUserId : r.toUserId;
      const info = await displayInfo(ctx.db, other);
      return {
        requestId: r._id as string,
        userId: other as string,
        username: info.username,
        catName: info.catName,
        clan: info.clan,
        createdAt: r.createdAt,
      };
    };
    return {
      incoming: await Promise.all(incoming.map((r) => mapReq(r, "in"))),
      outgoing: await Promise.all(outgoing.map((r) => mapReq(r, "out"))),
    };
  },
});

/** count of unread incoming requests — drives the FRIENDS badge */
export const unreadRequestCount = query({
  args: {},
  handler: async (ctx) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return 0;
    const incoming = await ctx.db.query("friendRequests").withIndex("by_to", (q) => q.eq("toUserId", meId)).collect();
    return incoming.length;
  },
});

// ---------------- Direct messages ----------------

export const sendDm = mutation({
  args: { toUserId: v.id("users"), text: v.string() },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) throw new Error("Not signed in");
    const text = args.text.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!text) return null;
    // must be friends to DM (keeps the system spam-safe)
    const [x, y] = [meId, args.toUserId].sort();
    const friend = await ctx.db
      .query("friendships")
      .withIndex("by_a", (q) => q.eq("aUserId", x))
      .filter((f) => f.eq(f.field("bUserId"), y))
      .first();
    if (!friend) throw new Error("You can only message friends");
    const info = await displayInfo(ctx.db, meId);
    return await ctx.db.insert("dmMessages", {
      fromUserId: meId,
      toUserId: args.toUserId,
      fromName: info.username,
      text,
      createdAt: Date.now(),
    });
  },
});

export const listDms = query({
  args: { withUserId: v.id("users") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return [];
    const sent = await ctx.db
      .query("dmMessages")
      .withIndex("by_pair", (q) => q.eq("fromUserId", meId).eq("toUserId", args.withUserId))
      .collect();
    const received = await ctx.db
      .query("dmMessages")
      .withIndex("by_pair", (q) => q.eq("fromUserId", args.withUserId).eq("toUserId", meId))
      .collect();
    const all = [...sent, ...received].sort((a, b) => a.createdAt - b.createdAt);
    return all.map((m) => ({
      id: m._id as string,
      text: m.text,
      mine: m.fromUserId === meId,
      fromName: m.fromName,
      createdAt: m.createdAt,
      readAt: m.readAt ?? null,
    }));
  },
});

export const markDmsRead = mutation({
  args: { withUserId: v.id("users") },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return;
    const received = await ctx.db
      .query("dmMessages")
      .withIndex("by_pair", (q) => q.eq("fromUserId", args.withUserId).eq("toUserId", meId))
      .collect();
    const now = Date.now();
    for (const m of received) {
      if (!m.readAt) await ctx.db.patch(m._id, { readAt: now });
    }
  },
});

export const unreadDmCounts = query({
  args: {},
  handler: async (ctx) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return { total: 0, byUser: {} as Record<string, number> };
    const received = await ctx.db.query("dmMessages").withIndex("by_to", (q) => q.eq("toUserId", meId)).collect();
    const byUser: Record<string, number> = {};
    let total = 0;
    const now = Date.now();
    for (const m of received) {
      if (m.readAt) continue;
      total++;
      byUser[m.fromUserId] = (byUser[m.fromUserId] ?? 0) + 1;
    }
    void now;
    return { total, byUser };
  },
});

export const dmConversations = query({
  args: {},
  handler: async (ctx) => {
    const meId = await getAuthUserId(ctx);
    if (!meId) return [];
    const all = await ctx.db.query("dmMessages").withIndex("by_to", (q) => q.eq("toUserId", meId)).collect();
    const sent = await ctx.db.query("dmMessages").withIndex("by_pair", (q) => q.eq("fromUserId", meId)).collect();
    void all;
    // collect conversation partners from both directions
    const partners = new Map<string, { last: string; at: number; unread: number }>();
    const recv = await ctx.db.query("dmMessages").withIndex("by_to", (q) => q.eq("toUserId", meId)).collect();
    for (const m of recv) {
      const prev = partners.get(m.fromUserId) ?? { last: m.text, at: 0, unread: 0 };
      const cur = m.createdAt > prev.at ? { ...prev, last: m.text, at: m.createdAt } : prev;
      if (!m.readAt) cur.unread++;
      partners.set(m.fromUserId, cur);
    }
    for (const m of sent) {
      const prev = partners.get(m.toUserId) ?? { last: m.text, at: 0, unread: 0 };
      const cur = m.createdAt > prev.at ? { ...prev, last: m.text, at: m.createdAt } : prev;
      partners.set(m.toUserId, cur);
    }
    const out = [];
    for (const [userId, v] of partners) {
      const info = await displayInfo(ctx.db, userId);
      out.push({ userId, username: info.username, catName: info.catName, clan: info.clan, last: v.last, at: v.at, unread: v.unread });
    }
    out.sort((a, b) => b.at - a.at);
    return out;
  },
});
