import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const CLANS = ["thunderclan", "riverclan", "windclan", "shadowclan", "kittypet", "loner"] as const;

const appearanceValidator = v.object({
  fur: v.string(),
  furDark: v.string(),
  eye: v.string(),
  chest: v.optional(v.string()),
  pattern: v.optional(v.string()),
  furLength: v.number(),
  tail: v.optional(v.string()),
  ears: v.optional(v.string()),
  size: v.number(), // 0.9 - 1.15
  scar: v.boolean(),
  // customization extensions (optional so old saves load unchanged)
  eye2: v.optional(v.string()),
  patternIntensity: v.optional(v.number()),
  markings: v.optional(v.array(v.string())),
  scars: v.optional(v.array(v.string())),
  acc: v.optional(v.record(v.string(), v.string())),
  accColor: v.optional(v.string()),
});

export type CatAppearance = Infer<typeof appearanceValidator>;

const schema = defineSchema(
  {
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // One cat per signed-in player.
    players: defineTable({
      userId: v.id("users"),
      mode: v.union(v.literal("story"), v.literal("open")),
      catName: v.string(),
      clan: v.optional(v.string()),
      rank: v.optional(v.string()),
      xp: v.optional(v.number()),
      inventory: v.optional(v.array(v.string())),
      achievements: v.optional(v.array(v.string())),
      appearance: appearanceValidator,
      x: v.number(),
      y: v.number(),
      discovered: v.optional(v.array(v.string())),
      storyStep: v.optional(v.number()),
      // customization extras: favorite item ids + up to 10 named appearance presets
      favorites: v.optional(v.array(v.string())),
      presets: v.optional(v.array(v.object({ name: v.string(), skin: v.any() }))),
      // per-NPC social memory: knowledge learned FROM each cat and the bond
      // built with them ("smudge:starclan" strings — knowledge is per-NPC,
      // never global; a Twolegplace cat learns StarClan only when told)
      npcMemory: v.optional(
        v.object({
          learned: v.optional(v.array(v.string())),
          bonds: v.optional(v.array(v.string())),
          talked: v.optional(v.array(v.string())),
          facts: v.optional(v.array(v.string())),
        }),
      ),
      questsDone: v.optional(v.array(v.string())),
      skills: v.optional(v.object({
        hunt: v.number(),
        fight: v.number(),
        herb: v.number(),
      })),
      // survival stats (hunger/energy/health, 0..100) — optional so existing
      // saves load unchanged; defaults fill in on first write
      stats: v.optional(v.object({
        hunger: v.number(),
        energy: v.number(),
        health: v.number(),
        updatedAt: v.number(),
      })),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Multiplayer presence: one row per player, heartbeat-updated.
    presence: defineTable({
      userId: v.id("users"),
      catName: v.string(),
      clan: v.optional(v.string()),
      rank: v.optional(v.string()),
      appearance: appearanceValidator,
      x: v.number(),
      y: v.number(),
      facing: v.number(),
      moving: v.boolean(),
      emote: v.optional(v.string()),
      vocal: v.optional(v.string()),
      action: v.optional(v.string()),
      mode: v.union(v.literal("story"), v.literal("open")),
      updatedAt: v.number(),
      // server authority: ordering + staleness rejection (see presence.ts)
      inputSequence: v.optional(v.number()),
      stateVersion: v.optional(v.number()),
      serverTick: v.optional(v.number()),
      // synchronized state vocabulary (idle/walk/run/crouch + CatPose)
      movementState: v.optional(v.string()),
      animationState: v.optional(v.string()),
    }).index("by_user", ["userId"])
      .index("by_updated", ["updatedAt"]),

    // Chat: global / clan / local (local rendered client-side by distance).
    messages: defineTable({
      fromUserId: v.id("users"),
      fromName: v.string(),
      channel: v.union(v.literal("global"), v.literal("clan"), v.literal("local")),
      clan: v.optional(v.string()),
      x: v.number(),
      y: v.number(),
      text: v.string(),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    // Friendships (mutual — one row per pair, stored with sorted ids).
    friendships: defineTable({
      aUserId: v.id("users"), // lexicographically smaller id
      bUserId: v.id("users"), // lexicographically larger id
      createdAt: v.number(),
    })
      .index("by_a", ["aUserId"])
      .index("by_b", ["bUserId"]),

    // Friend requests (pending until accepted/declined/cancelled).
    friendRequests: defineTable({
      fromUserId: v.id("users"),
      toUserId: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_to", ["toUserId"])
      .index("by_from", ["fromUserId"]),

    // Shared world clock/weather — one authoritative row ("global").
    worldState: defineTable({
      serverTick: v.number(),
      worldTime: v.number(),
      weather: v.string(),
      weatherIntensity: v.number(),
      weatherStartedAt: v.number(),
      weatherDurationMs: v.number(),
      dayLengthS: v.number(),
      leaderUserId: v.optional(v.id("users")),
    }),

    // Direct messages — visible ONLY to the two participants.
    dmMessages: defineTable({
      fromUserId: v.id("users"),
      toUserId: v.id("users"),
      fromName: v.string(),
      text: v.string(),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_pair", ["fromUserId", "toUserId"])
      .index("by_to", ["toUserId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
