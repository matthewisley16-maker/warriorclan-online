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
  // §18: per-slot accessory tint overrides (slot id -> hex); falls back to accColor
  accColors: v.optional(v.record(v.string(), v.string())),
  // morph = a WARRIORS character look applied on top of the base coat (§22):
  // same player account, same controls, same animations — visuals only
  morph: v.optional(v.string()),
  // the WARRIORS character preset this look came from, tracked separately so
  // "reset to my custom cat" is always possible (baseCustomAppearance §30)
  presetId: v.optional(v.string()),
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
  accColors?: Partial<Record<string, string>>;
  morph?: string;
  presetId?: string;
};

/**
 * Bump helper for appearanceVersion (§13): a compact structural fingerprint of
 * EVERY visual field. It is the client's change detector two ways: it tells the
 * send gate when a new look must ride a packet, and the server uses it to
 * compare the payload it received against the look it already stores (the
 * presence row's version is derived from that comparison, never taken from the
 * client's number). Add a field here whenever a customizable field is added, or
 * editing only that field would never be broadcast at all.
 */
export function appearanceVersion(a?: {
  fur?: string; furDark?: string; eye?: string; eye2?: string; chest?: string;
  pattern?: string; furLength?: number; furStyle?: string; tail?: string;
  ears?: string; size?: number; nose?: string; face?: string;
  patternIntensity?: number; markings?: string[]; scars?: string[]; scar?: boolean;
  acc?: Record<string, string>; accColor?: string; accColors?: Record<string, string>;
  morph?: string; presetId?: string;
} | null): number {
  if (!a) return 0;
  const acc = a.acc ? Object.keys(a.acc).sort().map((k) => `${k}=${a.acc![k]}`).join(";") : "";
  const accColors = a.accColors ? Object.keys(a.accColors).sort().map((k) => `${k}=${a.accColors![k]}`).join(";") : "";
  return [
    a.fur ?? "", a.furDark ?? "", a.eye ?? "", a.eye2 ?? "", a.chest ?? "",
    a.pattern ?? "", a.furLength ?? 1, a.furStyle ?? "", a.tail ?? "", a.ears ?? "",
    Math.round((a.size ?? 1) * 100), a.nose ?? "", a.face ?? "",
    a.patternIntensity !== undefined ? Math.round(a.patternIntensity * 100) : "",
    (a.markings ?? []).slice().sort().join(","), (a.scars ?? []).slice().sort().join(","),
    // the classic single-scar toggle: without this, flipping ONLY the scar
    // looked like "no change" to the send gate, so the edit was never
    // broadcast to other players at all
    a.scar ? 1 : 0,
    acc, accColors, a.accColor ?? "", a.morph ?? "", a.presetId ?? "",
  ].join("|")
    .split("")
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 5381) >>> 0;
}

/**
 * §MULTIPLAYER: authoritative merge for ONE presence row's look.
 *
 * The stored appearance and its version travel TOGETHER, atomically:
 *   - a packet carrying no payload changes NEITHER field, so a bare version
 *     number can never advance (and thereby strand) the stored look — the
 *     exact bug where a saved re-skin never reached other players
 *   - a payload is compared by CONTENT, so re-sending an identical coat is a
 *     no-op (no version churn, no pointless remote re-renders at the 300ms
 *     movement cadence)
 *   - a real change advances the version MONOTONICALLY (server-owned); a
 *     fresh row starts from the server clock so a returning player's look is
 *     always numerically newer than anything a remote client cached before
 */
export function nextPresenceAppearance<T>(
  existing: { appearance?: T; appearanceVersion?: number } | null | undefined,
  incoming: T | undefined,
  serverNow: number,
): { appearance: T | undefined; appearanceVersion: number | undefined; changed: boolean } {
  const prevApp = existing?.appearance;
  const prevVer = existing?.appearanceVersion;
  if (incoming === undefined) {
    // no payload: the look is untouched. A row that has no version yet (created
    // before versioning) is given the server clock ONCE so it has a defined
    // baseline — never a bump of an existing version.
    return {
      appearance: prevApp,
      appearanceVersion: prevVer ?? (prevApp !== undefined ? serverNow : undefined),
      changed: false,
    };
  }
  const changed = appearanceVersion(incoming as never) !== appearanceVersion(prevApp as never);
  if (!changed) {
    return {
      appearance: prevApp ?? incoming,
      appearanceVersion: prevVer ?? serverNow,
      changed: false,
    };
  }
  return {
    appearance: incoming,
    appearanceVersion: prevVer !== undefined ? prevVer + 1 : serverNow,
    changed: true,
  };
}

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
