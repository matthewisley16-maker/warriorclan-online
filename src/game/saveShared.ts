import { v } from "convex/values";

export const TILE_SHARED = 32;

/** Cat appearance validator — must match schema.ts appearanceValidator. */
export const appearance = v.object({
  fur: v.string(),
  furDark: v.string(),
  eye: v.string(),
  chest: v.optional(v.string()),
  pattern: v.union(v.literal("solid"), v.literal("tabby"), v.literal("tortie"), v.literal("bicolor")),
  furLength: v.number(),
  tail: v.union(v.literal("normal"), v.literal("short"), v.literal("fluffy"), v.literal("bob")),
  ears: v.union(v.literal("normal"), v.literal("tall"), v.literal("fold")),
  size: v.number(),
  scar: v.boolean(),
});

export type AppearanceT = {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern: "solid" | "tabby" | "tortie" | "bicolor";
  furLength: number;
  tail: "normal" | "short" | "fluffy" | "bob";
  ears: "normal" | "tall" | "fold";
  size: number;
  scar: boolean;
};

export const CLAN_SPAWNS: Record<string, { x: number; y: number }> = {
  thunderclan: { x: 89 * TILE_SHARED, y: 99.5 * TILE_SHARED },
  windclan: { x: 20 * TILE_SHARED, y: 87 * TILE_SHARED },
  riverclan: { x: 170 * TILE_SHARED, y: 99 * TILE_SHARED },
  shadowclan: { x: 96 * TILE_SHARED, y: 23 * TILE_SHARED },
  // The kittypet life: Rusty & Smudge's street in Twolegplace.
  kittypet: { x: 78 * TILE_SHARED, y: 146 * TILE_SHARED },
};

/**
 * Default spawn: Rusty's garden in Twolegplace (Smudge's street).
 * New cats — and respawns — start here as kittypets, then travel to
 * whichever Clan camp they join.
 */
export const TWOLEG_SPAWN = { x: 78 * TILE_SHARED, y: 146 * TILE_SHARED };
export const SPAWN = TWOLEG_SPAWN;
