import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { appearance } from "../game/saveShared";

const STALE_MS = 20_000;

// movement-state sync: the authoritative movement vocabulary (mirrors engine)
const MOVEMENT_STATES = new Set(["idle", "walk", "run", "crouch"]);
// animation states mirror the engine's CatPose vocabulary
const ANIM_STATES = new Set(["walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake"]);

// server speed authority: clamp generously above RUN_SPEED (250 px/s) so
// lag spikes never rubber-band honest clients, but impossible jumps
// (teleports) are pulled back to the last confirmed position.
const MAX_SPEED_PX_S = 340;
const MAX_TELEPORT_PX = 900; // larger than that = new snapshot, accept
// heartbeat cadence is ~5s; anything older uses the same rules

/** true if `inputSequence` is NEWER than the last processed one. */
function isFreshInput(incoming: number | undefined, last: number | undefined): boolean {
  if (incoming === undefined) return true; // legacy clients: accept
  if (last !== undefined && incoming <= last) return false; // old/duplicate
  return true;
}

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
    movementState: v.optional(v.string()),
    animationState: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();

    // ---- ordering: ignore old/duplicate/out-of-order packets outright ----
    if (existing && !isFreshInput(args.inputSequence, existing.inputSequence)) {
      return existing._id;
    }

    // ---- movement state validation: never persist an unknown vocabulary ----
    const movementState =
      args.movementState && MOVEMENT_STATES.has(args.movementState) ? args.movementState : undefined;
    const animationState =
      args.animationState && ANIM_STATES.has(args.animationState) ? args.animationState : undefined;

    // ---- position + speed authority (the SERVER wins on impossible moves) --
    let x = args.x;
    let y = args.y;
    let moving = args.moving;
    let facing = args.facing;
    if (existing) {
      const dtS = Math.max(0.25, (now - existing.updatedAt) / 1000);
      const dist = Math.hypot(x - existing.x, y - existing.y);
      if (dist <= MAX_TELEPORT_PX && dist / dtS > MAX_SPEED_PX_S) {
        // impossible for any real movement state — reject the jump, keep the
        // last confirmed position but accept the (valid) direction/state
        x = existing.x;
        y = existing.y;
        moving = false;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        x,
        y,
        facing,
        moving,
        emote: args.emote,
        mode: args.mode,
        catName: args.catName,
        clan: args.clan,
        rank: args.rank,
        appearance: args.appearance,
        inputSequence: args.inputSequence ?? existing.inputSequence,
        movementState,
        animationState,
        stateVersion: (existing.stateVersion ?? 0) + 1,
        serverTick: now,
        updatedAt: now,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x,
      y,
      facing,
      moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      inputSequence: args.inputSequence,
      movementState,
      animationState,
      stateVersion: 1,
      serverTick: now,
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
        movementState: r.movementState,
        animationState: r.animationState,
        serverTick: r.serverTick,
        stateVersion: r.stateVersion,
        lastProcessedInput: r.inputSequence,
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
