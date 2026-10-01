import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { appearance } from "../game/saveShared";

const STALE_MS = 20_000;

// movement-state sync: the authoritative movement vocabulary (mirrors engine)
const MOVEMENT_STATES = new Set(["idle", "walk", "run", "crouch"]);
// animation states mirror the engine's CatPose vocabulary
const ANIM_STATES = new Set(["walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake"]);
// vocal actions ride the same channel as emotes (synced through the
// presence row): each vocal is a short one-shot the receiver plays locally.
const VOCALS = new Set(["meow", "hiss", "growl", "chirp", "trill"]);

/** Helper for string-array membership tests with plain objects (convex v). */
function oneOf(set: Set<string>, v: string | undefined): string | undefined {
  return v && set.has(v) ? v : undefined;
}

/** tiny JSON guard for the (rare) extended action payloads */
function jsonOrNull(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v.length > 220) return undefined;
  try {
    JSON.parse(v);
    return v;
  } catch {
    return undefined;
  }
}

/**
 * Plain-string guard for ANIMATION one-shot ids ("groom", "dance1", …).
 * These are NOT JSON — jsonOrNull would silently drop every emote id, so
 * animation sync uses a simple length-capped string check instead.
 */
function animIdOrNull(v: string | undefined): string | undefined {
  return v && v.length > 0 && v.length <= 40 ? v : undefined;
}

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

/**
 * §5: cheap round-trip probe — no arguments, no database writes. The client
 * measures RTT against this instead of the full heartbeat so the ping reads
 * network latency only, never DB write time.
 */
export const ping = mutation({
  args: {},
  handler: async () => Date.now(),
});

/** Heartbeat: upsert this player's presence row. */
export const heartbeat = mutation({
  args: {
    x: v.number(),
    y: v.number(),
    facing: v.number(),
    moving: v.boolean(),
    emote: v.optional(v.string()),
    vocal: v.optional(v.string()),
    action: v.optional(v.string()),
    animOneShot: v.optional(v.string()),
    mode: v.union(v.literal("story"), v.literal("open")),
    catName: v.string(),
    clan: v.optional(v.string()),
    rank: v.optional(v.string()),
    // §4: optional — movement packets ride the version number only; the full
    // object is attached exclusively when the look actually changed.
    appearance: v.optional(appearance),
    inputSequence: v.optional(v.number()),
    movementState: v.optional(v.string()),
    animationState: v.optional(v.string()),
    // §12/§13: fingerprint of the appearance riding this packet. When it
    // matches the stored row the appearance payload is SKIPPED — identical
    // coats are never re-broadcast at the 300ms movement cadence.
    appearanceVersion: v.optional(v.number()),
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
    const vocal = oneOf(VOCALS, args.vocal);
    // one-shot social action payload (JSON) — validated, size-capped
    const action = jsonOrNull(args.action);

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
      // §12/§14: only re-broadcast appearance when its fingerprint CHANGED
      // (or it is genuinely missing on a legacy row) — identical looks are
      // never written at the movement cadence. A packet without an appearance
      // NEVER unsets the stored one.
      const appearanceChanged =
        args.appearance !== undefined &&
        !(
          args.appearanceVersion !== undefined &&
          existing.appearanceVersion === args.appearanceVersion &&
          existing.appearance
        );
      await ctx.db.patch(existing._id, {
        x,
        y,
        facing,
        moving,
        emote: args.emote,
        vocal,
        action,
        animOneShot: animIdOrNull(args.animOneShot),
        mode: args.mode,
        catName: args.catName,
        clan: args.clan,
        rank: args.rank,
        // §12/§14: only re-broadcast appearance when its fingerprint CHANGED
        // (or it is genuinely missing on a legacy row) — identical looks are
        // never written at the movement cadence.
        appearance:
          args.appearance === undefined
            ? existing.appearance
            : appearanceChanged
              ? args.appearance
              : existing.appearance,
        appearanceVersion:
          args.appearanceVersion ??
          (appearanceChanged ? (existing.appearanceVersion ?? 0) + 1 : existing.appearanceVersion),
        inputSequence: args.inputSequence ?? existing.inputSequence,
        movementState,
        animationState,
        stateVersion: (existing.stateVersion ?? 0) + 1,
        serverTick: now,
        updatedAt: now,
      });
      return existing._id;
    }
    // §10: a FRESH presence row must never hold a default cat — fall back to
    // the player's persisted appearance when the first packet rode without one.
    let appToStore = args.appearance;
    if (!appToStore) {
      const p = await ctx.db
        .query("players")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      appToStore = p?.appearance;
    }
    // guaranteed non-empty: the players row always carries an appearance; the
    // literal default cat covers the (never expected) no-row edge case
    const stored = appToStore ?? { fur: "#d96b2f", furDark: "#a34a1a", eye: "#4fae6e", furLength: 1, size: 1, scar: false };
    const id = await ctx.db.insert("presence", {
      userId,
      x,
      y,
      facing,
      moving,
      emote: args.emote,
      vocal,
      action,
      animOneShot: animIdOrNull(args.animOneShot),
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: stored,
      appearanceVersion: args.appearanceVersion ?? (appToStore ? 1 : undefined),
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
        appearanceVersion: r.appearanceVersion,
        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
        vocal: r.vocal,
        action: r.action,
        animOneShot: r.animOneShot,
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
