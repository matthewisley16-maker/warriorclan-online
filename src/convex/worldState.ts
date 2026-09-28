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
    // Leader election: the lexicographically smallest ONLINE userId writes.
    // A stored leader is only valid while it keeps ticking — if it has gone
    // quiet for 30s (tab closed, crashed, offline), any caller takes over.
    // Without this, a vanished small-id leader froze the shared clock forever.
    if (args.myUserId !== row.leaderUserId) {
      const leaderIsStale = now - row.serverTick > 30_000;
      if (row.leaderUserId && !leaderIsStale) {
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
      // Clear/sunny skies are the NORMAL state (~75% with breezy weather);
      // rain is uncommon, snow/storms are rare treats. After bad weather the
      // sky usually breaks straight back to sun, and bright skies ramp through
      // cloud cover instead of snapping into a storm.
      const options = ["clear", "cloudy", "rain", "fog", "wind", "storm", "snow"] as const;
      const weights = [63, 15, 4, 3, 12, 1.5, 1.5];
      const prev = row.weather as (typeof options)[number];
      let pick: (typeof options)[number] = "clear";
      for (let attempt = 0; attempt < 4; attempt++) {
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        pick = "clear";
        for (let i = 0; i < options.length; i++) {
          r -= weights[i];
          if (r <= 0) { pick = options[i]; break; }
        }
        if (prev !== "clear" && prev !== "wind" && Math.random() < 0.55) {
          pick = "clear"; // bad spell over: back to sun
        }
        if ((prev === "clear" || prev === "wind") && (pick === "storm" || pick === "snow")) {
          pick = "cloudy"; // smooth transition
        }
        if (pick !== prev || attempt === 3) break;
      }
      weather = pick;
      weatherIntensity = weather === "storm" ? 1 : weather === "rain" ? 0.6 : 0.3;
      weatherStartedAt = now;
      // clear spells LAST (it's the normal condition); unsettled weather is shorter
      weatherDurationMs =
        weather === "clear" || weather === "wind" ? 240_000 + Math.random() * 240_000
        : weather === "cloudy" || weather === "fog" ? 110_000 + Math.random() * 120_000
        : weather === "storm" ? 70_000 + Math.random() * 60_000
        : 90_000 + Math.random() * 90_000;
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
