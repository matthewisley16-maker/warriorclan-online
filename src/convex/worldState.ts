import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Shared world clock & weather — ONE authority for everyone on the server.
 *
 * The row (id "global") holds:
 *  - serverTick:   monotonic network ordering (server Date.now(), never client)
 *  - worldTime:    shared in-game day clock (seconds since dawn)
 *  - weather + weatherStartedAt + weatherDurationMs: shared weather state
 *  - dayLengthS:   full in-game day length (shared constant)
 *
 * Clients RENDER from this state; nobody simulates their own private clock.
 * A deterministic "leader" (the lowestuserId online) advances the clock so
 * exactly one writer mutates per interval — conflict-free by construction.
 */

const DAY_LENGTH_S = 600; // shared with the engine's GAME_DAY_SECONDS

export const getWorldState = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("worldState").first();
    if (!row) {
      return {
        serverTick: Date.now(),
        worldTime: 0,
        dayPhase: "morning",
        weather: "clear",
        weatherIntensity: 0,
        weatherStartedAt: Date.now(),
        weatherDurationMs: 90_000,
        dayLengthS: DAY_LENGTH_S,
        leaderUserId: null as string | null,
      };
    }
    // derive phase from worldTime for convenience
    const frac = (row.worldTime % row.dayLengthS) / row.dayLengthS;
    const hour24 = frac * 24;
    const dayPhase =
      hour24 < 5 ? "night" : hour24 < 7 ? "sunrise" : hour24 < 12 ? "morning"
      : hour24 < 17 ? "afternoon" : hour24 < 19.5 ? "sunset" : "night";
    return {
      serverTick: row.serverTick,
      worldTime: row.worldTime,
      dayPhase,
      weather: row.weather,
      weatherIntensity: row.weatherIntensity,
      weatherStartedAt: row.weatherStartedAt,
      weatherDurationMs: row.weatherDurationMs,
      dayLengthS: row.dayLengthS,
      leaderUserId: row.leaderUserId,
    };
  },
});

/** Called by clients; ONLY the deterministic leader's write wins. */
export const tickWorld = mutation({
  args: {
    myUserId: v.id("users"),
    advanceSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("worldState").first();
    const now = Date.now();
    if (!row) {
      await ctx.db.insert("worldState", {
        serverTick: now,
        worldTime: 0,
        weather: "clear",
        weatherIntensity: 0,
        weatherStartedAt: now,
        weatherDurationMs: 90_000,
        dayLengthS: DAY_LENGTH_S,
        leaderUserId: args.myUserId,
      });
      return { accepted: true, leader: args.myUserId };
    }
    // leader election: lexicographically smallest online userId writes.
    if (args.myUserId !== row.leaderUserId) {
      // take over if the previous leader vanished (stale heartbeat)
      if (!row.leaderUserId || row.leaderUserId < args.myUserId) {
        // keep existing leader if it's still "smaller" (deterministic order)
        if (row.leaderUserId && row.leaderUserId < args.myUserId) {
          return { accepted: false, leader: row.leaderUserId };
        }
      } else {
        return { accepted: false, leader: row.leaderUserId };
      }
    }
    // advance the shared clock (server-side only)
    const worldTime = (row.worldTime + Math.max(0, Math.min(5, args.advanceSeconds))) % row.dayLengthS;
    let weather = row.weather;
    let weatherIntensity = row.weatherIntensity;
    let weatherStartedAt = row.weatherStartedAt;
    let weatherDurationMs = row.weatherDurationMs;
    if (now - weatherStartedAt > weatherDurationMs) {
      const options = ["clear", "cloudy", "rain", "fog", "wind", "storm", "snow"] as const;
      weather = options[Math.floor(Math.random() * options.length)];
      weatherIntensity = weather === "storm" ? 1 : weather === "rain" ? 0.6 : 0.3;
      weatherStartedAt = now;
      weatherDurationMs = 60_000 + Math.random() * 120_000;
    }
    await ctx.db.patch(row._id, {
      serverTick: now,
      worldTime,
      weather,
      weatherIntensity,
      weatherStartedAt,
      weatherDurationMs,
      leaderUserId: args.myUserId,
    });
    return { accepted: true, leader: args.myUserId };
  },
});

/** Claim leadership when the stored leader is gone (idempotent, server-side check). */
export const claimLeadership = mutation({
  args: { myUserId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("worldState").first();
    if (!row) {
      await ctx.db.insert("worldState", {
        serverTick: Date.now(),
        worldTime: 0,
        weather: "clear",
        weatherIntensity: 0,
        weatherStartedAt: Date.now(),
        weatherDurationMs: 90_000,
        dayLengthS: DAY_LENGTH_S,
        leaderUserId: args.myUserId,
      });
      return true;
    }
    // stale leader (no tick in 30s) → take over deterministically
    if (Date.now() - row.serverTick > 30_000) {
      await ctx.db.patch(row._id, { leaderUserId: args.myUserId, serverTick: Date.now() });
      return true;
    }
    return row.leaderUserId === args.myUserId;
  },
});
