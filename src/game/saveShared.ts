import { v } from "convex/values";

export const TILE_SHARED = 32;

/** Cat appearance validator — must match schema.ts appearanceValidator. */
export const appearance = v.object({
  fur: v.string(),
  furDark: v.string(),
  eye: v.string(),
  chest: v.optional(v.string()),
  // extended ids (mackerel/spotted/...) render via drawCat's pattern switch
  pattern: v.optional(v.string()),
  furLength: v.number(),
  furStyle: v.optional(v.string()),
  tail: v.optional(v.string()),
  ears: v.optional(v.string()),
  size: v.number(),
  scar: v.boolean(),
  // customization extensions (optional so old saves load unchanged)
  eye2: v.optional(v.string()),
  nose: v.optional(v.string()),
  face: v.optional(v.string()),
  patternIntensity: v.optional(v.number()),
  markings: v.optional(v.array(v.string())),
  scars: v.optional(v.array(v.string())),
  acc: v.optional(v.record(v.string(), v.string())),
  accColor: v.optional(v.string()),
});

export type AppearanceT = {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern: string;
  furLength: number;
  furStyle?: string;
  tail: string;
  ears: string;
  size: number;
  scar: boolean;
  eye2?: string;
  nose?: string;
  face?: string;
  patternIntensity?: number;
  markings?: string[];
  scars?: string[];
  acc?: Partial<Record<string, string>>;
  accColor?: string;
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
