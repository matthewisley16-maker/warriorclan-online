import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  NPC_SYNC_AUTHORITY_MS,
  NPC_SYNC_BUSY_TTL_MS,
  NPC_SYNC_WORLD,
  liveBusyClaims,
  npcRoster,
  sanitizeCrossMap,
  sanitizeNpcStates,
} from "../game/npcSync";

/**
 * §30/§31 — SERVER-AUTHORITATIVE ONLINE NPC WORLD STATE.
 *
 * Online Multiplayer only. Story Mode is a separate system and never touches
 * this table (every entry point rejects `worldId !== "online"`).
 *
 * One row per world holds the latest VALIDATED snapshot of the whole NPC
 * roster plus the live conversation claims. Exactly one client — the elected
 * authority — simulates and publishes; everyone else renders what the server
 * accepted. Territory, pose/AI vocabulary and conversation visibility are
 * enforced HERE, so no client can force an NPC into another Clan's territory,
 * invent a state, or push private chat text through the sync channel.
 *
 * Election mirrors the world clock: the lexicographically smallest ONLINE
 * (mode "open") user with a fresh presence row is the authority, and it keeps
 * the pen while it keeps publishing. If it stalls (tab closed, crashed,
 * throttled), any publisher may take over after NPC_SYNC_AUTHORITY_MS.
 */

const PRESENCE_STALE_MS = 20_000;

/** Ids of every player currently in the ONLINE world (fresh presence rows). */
async function liveOpenUsers(ctx: QueryCtx | MutationCtx): Promise<string[]> {
  const rows = await ctx.db.query("presence").collect();
  const cutoff = Date.now() - PRESENCE_STALE_MS;
  return rows
    .filter((r) => r.updatedAt > cutoff && r.mode === "open")
    .map((r) => String(r.userId))
    .sort();
}

async function worldRow(
  ctx: QueryCtx | MutationCtx,
  worldId: string,
): Promise<Doc<"npcWorldState"> | null> {
  return await ctx.db
    .query("npcWorldState")
    .withIndex("by_world_id", (q) => q.eq("worldId", worldId))
    .first();
}

/** Who holds the pen right now (stored authority while it stays live). */
function authorityFor(row: Doc<"npcWorldState"> | null, live: string[]): string | null {
  if (row?.authorityUserId && live.includes(String(row.authorityUserId))) return String(row.authorityUserId);
  return live[0] ?? null;
}

const npcWire = v.object({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  facing: v.number(),
  pose: v.string(),
  ai: v.string(),
  activity: v.string(),
  movement: v.string(),
  denId: v.optional(v.union(v.string(), v.null())),
  convoWith: v.optional(v.union(v.string(), v.null())),
  seq: v.number(),
});

/**
 * Publish the authority's NPC snapshot. Rejected wholesale for a non-authority
 * caller or a stale/out-of-order packet; each NPC inside an accepted packet is
 * still individually validated + clamped.
 */
export const publish = mutation({
  args: {
    worldId: v.string(),
    seq: v.number(),
    npcs: v.array(npcWire),
    cross: v.optional(v.record(v.string(), v.object({ reason: v.string(), until: v.number() }))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { accepted: false as const, reason: "signed-out", authority: null };
    // §15: Story Mode is a separate system — the online sync never touches it.
    if (args.worldId !== NPC_SYNC_WORLD) return { accepted: false as const, reason: "online-only", authority: null };

    const now = Date.now();
    const live = await liveOpenUsers(ctx);
    const row = await worldRow(ctx, args.worldId);
    const authority = authorityFor(row, live);
    if (!authority) return { accepted: false as const, reason: "no-authority", authority: null };
    if (String(userId) !== authority) return { accepted: false as const, reason: "not-authority", authority };
    if (row && args.seq <= row.seq) {
      return { accepted: false as const, reason: "stale-seq", authority, serverTick: row.serverTick };
    }

    // the server's own previous sequences: an NPC state can never move backward
    const prevSeq: Record<string, number> = {};
    for (const raw of row?.npcs ?? []) {
      const n = raw as { id?: unknown; seq?: unknown };
      if (typeof n?.id === "string" && typeof n?.seq === "number") prevSeq[n.id] = n.seq;
    }
    const cross = sanitizeCrossMap(args.cross, now);
    const res = sanitizeNpcStates(args.npcs, cross, now, prevSeq);
    // keep only live conversation claims (they expire on their own)
    const busy = (row?.busy ?? []).filter((b) => b.until > now && npcRoster(b.npcId) !== null);

    if (row) {
      await ctx.db.patch(row._id, {
        authorityUserId: userId,
        authorityAt: now,
        serverTick: now,
        seq: args.seq,
        stateVersion: row.stateVersion + 1,
        npcs: res.states,
        busy,
      });
    } else {
      await ctx.db.insert("npcWorldState", {
        worldId: args.worldId,
        authorityUserId: userId,
        authorityAt: now,
        serverTick: now,
        seq: args.seq,
        stateVersion: 1,
        npcs: res.states,
        busy,
      });
    }
    return {
      accepted: true as const,
      authority,
      count: res.states.length,
      clamped: res.clamped,
      crossing: res.crossing,
      rejected: res.rejected.length,
      serverTick: now,
    };
  },
});

/**
 * §29 — conversation ownership. A cat can only be claimed by ONE player at a
 * time; a second caller is told who holds it and never silently overwrites the
 * first player's conversation state.
 */
export const claimConversation = mutation({
  args: { worldId: v.string(), npcId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { accepted: false as const, reason: "signed-out" };
    if (args.worldId !== NPC_SYNC_WORLD) return { accepted: false as const, reason: "online-only" };
    if (!npcRoster(args.npcId)) return { accepted: false as const, reason: "unknown-npc" };

    const now = Date.now();
    const row = await worldRow(ctx, args.worldId);
    const live = (row?.busy ?? []).filter((b) => b.until > now && npcRoster(b.npcId) !== null);
    const existing = live.find((b) => b.npcId === args.npcId);
    if (existing && String(existing.userId) !== String(userId)) {
      return { accepted: false as const, reason: "busy", busyWith: existing.name, until: existing.until };
    }
    const name =
      args.name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "a cat";
    const next = [
      ...live.filter((b) => b.npcId !== args.npcId),
      { npcId: args.npcId, name, userId, until: now + NPC_SYNC_BUSY_TTL_MS },
    ];
    if (row) await ctx.db.patch(row._id, { busy: next });
    else {
      await ctx.db.insert("npcWorldState", {
        worldId: args.worldId,
        authorityAt: 0,
        serverTick: 0,
        seq: 0,
        stateVersion: 0,
        npcs: [],
        busy: next,
      });
    }
    return { accepted: true as const };
  },
});

/** Refresh a claim while a conversation is open (TTL extension). */
export const refreshConversation = mutation({
  args: { worldId: v.string(), npcId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || args.worldId !== NPC_SYNC_WORLD) return { accepted: false as const };
    const now = Date.now();
    const row = await worldRow(ctx, args.worldId);
    if (!row) return { accepted: false as const };
    const live = row.busy.filter((b) => b.until > now && String(b.userId) === String(userId));
    const mine = live.find((b) => b.npcId === args.npcId);
    if (!mine) return { accepted: false as const };
    await ctx.db.patch(row._id, {
      busy: [...row.busy.filter((b) => b.npcId !== args.npcId), { ...mine, until: now + NPC_SYNC_BUSY_TTL_MS }],
    });
    return { accepted: true as const };
  },
});

/** Release my conversation claim (called when the chat panel closes). */
export const releaseConversation = mutation({
  args: { worldId: v.string(), npcId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || args.worldId !== NPC_SYNC_WORLD) return;
    const row = await worldRow(ctx, args.worldId);
    if (!row) return;
    const next = row.busy.filter(
      (b) => !(b.npcId === args.npcId && String(b.userId) === String(userId)),
    );
    if (next.length !== row.busy.length) await ctx.db.patch(row._id, { busy: next });
  },
});

/**
 * The authoritative snapshot every ONLINE client renders from. `fresh` false
 * means the authority went quiet: clients fall back to their own local sim so
 * the world never freezes on a stalled sender.
 */
export const list = query({
  args: { worldId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();
    if (args.worldId !== NPC_SYNC_WORLD) {
      return {
        worldId: args.worldId,
        authorityUserId: null as string | null,
        isAuthority: false,
        onlineCount: 0,
        fresh: false,
        serverTick: 0,
        stateVersion: 0,
        npcs: [] as Doc<"npcWorldState">["npcs"],
        busy: [] as { npcId: string; name: string; until: number }[],
      };
    }
    const live = await liveOpenUsers(ctx);
    const row = await worldRow(ctx, args.worldId);
    const authority = authorityFor(row, live);
    const fresh = !!row && now - row.authorityAt <= NPC_SYNC_AUTHORITY_MS && row.npcs.length > 0;
    // §29: never echo a player their OWN claim back as someone else talking.
    const others = (row?.busy ?? []).filter((b) => String(b.userId) !== String(userId ?? ""));
    const busy = liveBusyClaims(
      others.map((b) => ({ npcId: b.npcId, name: b.name, until: b.until })),
      now,
    );
    const byId = new Map(busy.map((b) => [b.npcId, b.name]));
    const npcs = fresh
      ? row!.npcs.map((n) => ({
          ...n,
          // a conversation another player started is visible to everyone (§29)
          convoWith: byId.get(n.id) ?? n.convoWith ?? null,
        }))
      : [];
    return {
      worldId: args.worldId,
      authorityUserId: authority,
      isAuthority: !!userId && authority === String(userId),
      onlineCount: live.length,
      fresh,
      serverTick: fresh ? row!.serverTick : 0,
      stateVersion: row?.stateVersion ?? 0,
      npcs,
      busy,
    };
  },
});
