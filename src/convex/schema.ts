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
  pattern: v.union(v.literal("solid"), v.literal("tabby"), v.literal("tortie"), v.literal("bicolor")),
  furLength: v.number(),
  tail: v.union(v.literal("normal"), v.literal("short"), v.literal("fluffy"), v.literal("bob")),
  ears: v.union(v.literal("normal"), v.literal("tall"), v.literal("fold")),
  size: v.number(), // 0.9 - 1.15
  scar: v.boolean(),
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
      questsDone: v.optional(v.array(v.string())),
      skills: v.optional(v.object({
        hunt: v.number(),
        fight: v.number(),
        herb: v.number(),
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
      mode: v.union(v.literal("story"), v.literal("open")),
      updatedAt: v.number(),
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
