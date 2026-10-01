// WarriorCatsRPG — WARRIORS character presets + morph library (§22-§30).
//
// A PRESET applies a COMPLETE structured appearance (fur, pattern, markings,
// eyes, ears, tail, scars, accessories) to the player's real customizer state
// — it never merely renames the cat. Every preset is tagged with its story
// group and availability so the browser can filter by Prophecies/Clan/etc.
//
// A MORPH (§22-23) is the same data applied with `morph: <id>` recorded on the
// skin: the player keeps their account, controls, animations and multiplayer
// identity — only the visual configuration changes. Both systems are pure data
// over CustomSkin, so anything added to the customizer later works here too.

import type { CustomSkin } from "./catItems";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CharacterPreset {
  /** stable id, e.g. "firestar" — recorded on the skin as presetId */
  id: string;
  displayName: string;
  /** structured appearance the preset APPLIES (real visual config) */
  skin: Omit<CustomSkin, "morph" | "presetId">;
  group: PresetGroup;
  clan?: string;
  rank?: string;
  /** one-line character detail shown in the preview card */
  blurb: string;
  /** descriptive tags driving the text filters (clan/rank/story/type) */
  tags: string[];
}

export type PresetGroup =
  | "prophecies"
  | "thunderclan"
  | "riverclan"
  | "windclan"
  | "shadowclan"
  | "twoplegplace"
  | "rogues"
  | "other";

export const PRESET_GROUPS: { id: PresetGroup; name: string }[] = [
  { id: "prophecies", name: "The Prophecies Begin" },
  { id: "thunderclan", name: "ThunderClan" },
  { id: "riverclan", name: "RiverClan" },
  { id: "windclan", name: "WindClan" },
  { id: "shadowclan", name: "ShadowClan" },
  { id: "twoplegplace", name: "Twolegplace / Kittypets" },
  { id: "rogues", name: "Rogues" },
  { id: "other", name: "Other Characters" },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const P = (
  id: string,
  displayName: string,
  group: PresetGroup,
  blurb: string,
  skin: Omit<CustomSkin, "morph" | "presetId" | "accColors">,
  extra?: Partial<Pick<CharacterPreset, "clan" | "rank" | "tags">>,
): CharacterPreset => ({
  id,
  displayName,
  group,
  blurb,
  skin,
  clan: extra?.clan,
  rank: extra?.rank,
  tags: extra?.tags ?? [],
});

// ---------------------------------------------------------------------------

export const CHARACTER_PRESETS: CharacterPreset[] = [
  // --- THE PROPHECIES BEGIN -------------------------------------------------
  P("firestar", "Firestar", "prophecies", "Rusty of Twolegplace — the fire who saved the Clans.",
    { fur: "#d96b2f", furDark: "#a34a1a", eye: "#4fae6e", pattern: "solid", furLength: 0.85, tail: "long", ears: "tall", size: 1.02, scar: false, markings: ["chest"] },
    { clan: "thunderclan", rank: "leader", tags: ["thunderclan", "leader", "prophecies", "ginger"] }),
  P("bluestar", "Bluestar", "prophecies", "ThunderClan's noble leader, silver-touched and wise.",
    { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#5b8fd6", pattern: "solid", furLength: 1.15, tail: "fluffy", ears: "normal", size: 1.05, scar: false, markings: ["muzzle"] },
    { clan: "thunderclan", rank: "leader", tags: ["thunderclan", "leader", "prophecies", "silver"] }),
  P("graystripe", "Graystripe", "prophecies", "Firestar's best friend — long-haired and loyal.",
    { fur: "#8f8f96", furDark: "#5c5c60", eye: "#d9a83a", pattern: "solid", furLength: 1.35, tail: "fluffy", ears: "normal", size: 1.08, scar: true, scars: ["shoulder"], markings: ["chest"] },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "prophecies", "gray"] }),
  P("ravenpaw", "Ravenpaw", "prophecies", "The timid black apprentice who found a different path.",
    { fur: "#1c1c20", furDark: "#101014", eye: "#e8e6e0", pattern: "solid", furLength: 0.85, tail: "slim", ears: "normal", size: 0.94, scar: false, markings: ["chest", "tailtip"] },
    { clan: "thunderclan", rank: "apprentice", tags: ["thunderclan", "apprentice", "prophecies", "black", "rogue"] }),
  P("sandstorm", "Sandstorm", "prophecies", "Quick-tongued, pale-furred — Firestar's fiercest ally.",
    { fur: "#e3c088", furDark: "#b08d58", eye: "#4fae6e", pattern: "solid", furLength: 0.8, tail: "normal", ears: "tall", size: 0.98, scar: false },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "prophecies", "pale"] }),
  P("yellowfang", "Yellowfang", "prophecies", "Cranky ShadowClan medicine cat with a broken past.",
    { fur: "#8a7a66", furDark: "#5c5044", eye: "#d9a83a", pattern: "solid", furLength: 1.3, tail: "fluffy", ears: "fold", size: 1.02, scar: true, scars: ["brow"], markings: ["muzzle"] },
    { clan: "shadowclan", rank: "medicine-cat", tags: ["shadowclan", "medicine cat", "prophecies", "dark gray"] }),
  P("tigerclaw", "Tigerclaw", "prophecies", "Massive brown tabby with amber eyes and dark ambition.",
    { fur: "#7a5b3a", furDark: "#4a3620", eye: "#d9a83a", pattern: "tabby", furLength: 1.15, tail: "short", ears: "normal", size: 1.12, scar: true, scars: ["nose", "shoulder"] },
    { clan: "shadowclan", rank: "leader", tags: ["shadowclan", "leader", "prophecies", "tabby", "villain"] }),
  P("spottedleaf", "Spottedleaf", "prophecies", "The gentle tortoiseshell medicine cat of ThunderClan.",
    { fur: "#a5622d", furDark: "#6e4220", eye: "#d9a83a", pattern: "tortie", furLength: 1, tail: "normal", ears: "normal", size: 0.96, scar: false, markings: ["chest", "muzzle"] },
    { clan: "thunderclan", rank: "medicine-cat", tags: ["thunderclan", "medicine cat", "prophecies", "tortie"] }),
  P("whitestorm", "Whitestorm", "prophecies", "Calm white warrior — Bluestar's trusted deputy.",
    { fur: "#e8e6e0", furDark: "#b8b6ae", eye: "#d9a83a", pattern: "solid", furLength: 1.1, tail: "long", ears: "normal", size: 1.06, scar: false },
    { clan: "thunderclan", rank: "deputy", tags: ["thunderclan", "deputy", "prophecies", "white"] }),
  P("brambleclaw", "Brambleclaw", "prophecies", "Dark tabby bearing his father's shadow.",
    { fur: "#6b4a2f", furDark: "#42301e", eye: "#4fae6e", pattern: "tabby", furLength: 1.05, tail: "normal", ears: "normal", size: 1.08, scar: false },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "prophecies", "tabby"] }),
  P("crookedstar", "Crookedstar", "prophecies", "RiverClan's jaw-broken leader who loved the river.",
    { fur: "#b0925f", furDark: "#7c6842", eye: "#4fae6e", pattern: "solid", furLength: 1.1, tail: "normal", ears: "normal", size: 1.08, scar: true, scars: ["cheek"] },
    { clan: "riverclan", rank: "leader", tags: ["riverclan", "leader", "prophecies", "ginger", "scarred"] }),
  P("nightstars", "Nightstar", "prophecies", "ShadowClan's gentle, short-lived leader.",
    { fur: "#2c2c30", furDark: "#18181c", eye: "#d9a83a", pattern: "solid", furLength: 1.05, tail: "slim", ears: "tall", size: 1, scar: false, markings: ["chest"] },
    { clan: "shadowclan", rank: "leader", tags: ["shadowclan", "leader", "prophecies", "black"] }),

  // --- THUNDERCLAN ----------------------------------------------------------
  P("smudge", "Smudge", "thunderclan", "Rusty's kittypet friend — black-and-white and curious.",
    { fur: "#2c2c30", furDark: "#18181c", eye: "#4fae6e", pattern: "bicolor", furLength: 1.05, tail: "normal", ears: "normal", size: 1, scar: false, acc: { neck: "collar-blue" } },
    { clan: "kittypet", rank: "kittypet", tags: ["thunderclan", "kittypet", "black", "collar"] }),
  // (Smudge keeps his blue collar; Princess gets the bright kittypet tag)
  P("dustpaw", "Dustpelt", "thunderclan", "Dark brown tabby, sharp-tongued and ambitious.",
    { fur: "#6b4a2f", furDark: "#42301e", eye: "#d9a83a", pattern: "tabby", furLength: 0.9, tail: "normal", ears: "normal", size: 1.04, scar: false },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "tabby"] }),
  P("longtail", "Longtail", "thunderclan", "Pale tabby with a famously long tail.",
    { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#d9a83a", pattern: "mackerel", furLength: 0.85, tail: "long", ears: "tall", size: 1.02, scar: false },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "tabby", "long tail"] }),
  P("mousefur", "Mousefur", "thunderclan", "Small, brown, and famously prickly.",
    { fur: "#8a7a66", furDark: "#5c5044", eye: "#d9a83a", pattern: "solid", furLength: 0.8, tail: "short", ears: "normal", size: 0.92, scar: false },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "brown"] }),
  P("halftail", "Halftail", "thunderclan", "The elder who lost his tail to a Twoleg trap.",
    { fur: "#5c5c60", furDark: "#3a3a40", eye: "#d9a83a", pattern: "tabby", furLength: 1.05, tail: "short", ears: "normal", size: 1, scar: true, scars: ["ear"] },
    { clan: "thunderclan", rank: "elder", tags: ["thunderclan", "elder", "tabby", "scarred"] }),
  P("speckletail", "Speckletail", "thunderclan", "Golden elder with fading tabby stripes.",
    { fur: "#d9a441", furDark: "#9c7428", eye: "#d9a83a", pattern: "mackerel", furLength: 1.1, tail: "normal", ears: "fold", size: 0.98, scar: false, markings: ["muzzle"] },
    { clan: "thunderclan", rank: "elder", tags: ["thunderclan", "elder", "golden", "tabby"] }),

  // --- RIVERCLAN ------------------------------------------------------------
  P("leopardfur", "Leopardstar", "riverclan", "Golden spotted leader of the river.",
    { fur: "#d9a441", furDark: "#9c7428", eye: "#4fae6e", pattern: "spotted", furLength: 0.85, tail: "long", ears: "tall", size: 1.06, scar: false },
    { clan: "riverclan", rank: "leader", tags: ["riverclan", "leader", "golden", "spotted"] }),
  P("mistyfoot", "Mistyfoot", "riverclan", "Blue-gray swimmer — Bluestar's lost daughter.",
    { fur: "#8f8f96", furDark: "#5c5c60", eye: "#5b8fd6", pattern: "solid", furLength: 0.95, tail: "normal", ears: "normal", size: 1.02, scar: false, markings: ["chest"] },
    { clan: "riverclan", rank: "deputy", tags: ["riverclan", "deputy", "gray", "blue eyes"] }),
  P("blackclaw", "Blackclaw", "riverclan", "Sleek black smoke-touched warrior of RiverClan.",
    { fur: "#1c1c20", furDark: "#101014", eye: "#4fae6e", pattern: "solid", furLength: 0.8, tail: "slim", ears: "tall", size: 1.04, scar: false },
    { clan: "riverclan", rank: "warrior", tags: ["riverclan", "warrior", "black"] }),
  P("silverstream", "Silverstream", "riverclan", "The silver tabby of the river, bright and brave.",
    { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#5b8fd6", pattern: "mackerel", furLength: 1.1, tail: "fluffy", ears: "normal", size: 1, scar: false, markings: ["chest"] },
    { clan: "riverclan", rank: "warrior", tags: ["riverclan", "warrior", "silver", "tabby"] }),
  P("mudfur", "Mudfur", "riverclan", "RiverClan's long-serving medicine cat.",
    { fur: "#8a5a3a", furDark: "#5c3c26", eye: "#d9a83a", pattern: "solid", furLength: 1.05, tail: "normal", ears: "normal", size: 1.04, scar: false },
    { clan: "riverclan", rank: "medicine-cat", tags: ["riverclan", "medicine cat", "brown"] }),

  // --- WINDCLAN -------------------------------------------------------------
  P("deadfoot", "Deadfoot", "windclan", "Twisted-paw deputy who never slowed down.",
    { fur: "#2c2c30", furDark: "#18181c", eye: "#d9a83a", pattern: "solid", furLength: 0.9, tail: "normal", ears: "tall", size: 1, scar: true, scars: ["side"], markings: ["paws"] },
    { clan: "windclan", rank: "deputy", tags: ["windclan", "deputy", "black", "scarred"] }),
  P("tallstar", "Tallstar", "windclan", "The long-tailed moor-runner, calm and far-seeing.",
    { fur: "#1c1c20", furDark: "#101014", eye: "#d9a83a", pattern: "bicolor", furLength: 1, tail: "long", ears: "tall", size: 1.06, scar: false, markings: ["muzzle", "tailtip"] },
    { clan: "windclan", rank: "leader", tags: ["windclan", "leader", "black", "white", "long tail"] }),
  P("onewhisker", "Onewhisker", "windclan", "Brown tabby with a single pale whisker.",
    { fur: "#8a5a3a", furDark: "#5c3c26", eye: "#4fae6e", pattern: "tabby", furLength: 0.85, tail: "normal", ears: "normal", size: 0.98, scar: false, markings: ["muzzle"] },
    { clan: "windclan", rank: "warrior", tags: ["windclan", "warrior", "brown", "tabby"] }),
  P("runningnose", "Runningnose", "shadowclan", "ShadowClan's sneezing, devoted medicine cat.",
    { fur: "#43434a", furDark: "#28282e", eye: "#d9a83a", pattern: "solid", furLength: 1, tail: "slim", ears: "normal", size: 0.94, scar: false, markings: ["muzzle"] },
    { clan: "shadowclan", rank: "medicine-cat", tags: ["shadowclan", "medicine cat", "gray"] }),

  // --- SHADOWCLAN -----------------------------------------------------------
  P("blackfoot", "Blackstar", "shadowclan", "White-pawed, huge-pawed — ShadowClan's iron will.",
    { fur: "#2c2c30", furDark: "#18181c", eye: "#d9a83a", pattern: "bicolor", furLength: 1.05, tail: "normal", ears: "tall", size: 1.12, scar: true, scars: ["shoulder"], markings: ["paws"] },
    { clan: "shadowclan", rank: "leader", tags: ["shadowclan", "leader", "black", "white paws"] }),
  P("littlecloud", "Littlecloud", "shadowclan", "Small, kind medicine cat under a broken Clan.",
    { fur: "#8a7a66", furDark: "#5c5044", eye: "#4fae6e", pattern: "solid", furLength: 0.9, tail: "slim", ears: "normal", size: 0.9, scar: false },
    { clan: "shadowclan", rank: "medicine-cat", tags: ["shadowclan", "medicine cat", "brown"] }),
  P("russetfur", "Russetfur", "shadowclan", "Dark ginger deputy with a temper of fire.",
    { fur: "#a5622d", furDark: "#6e4220", eye: "#4fae6e", pattern: "solid", furLength: 0.95, tail: "normal", ears: "tall", size: 1.04, scar: false },
    { clan: "shadowclan", rank: "deputy", tags: ["shadowclan", "deputy", "ginger"] }),

  // --- TWOLEGPLACE / KITTYPETS ------------------------------------------------
  P("rusty", "Rusty", "twoplegplace", "A ginger kittypet before the forest claimed him.",
    { fur: "#d96b2f", furDark: "#a34a1a", eye: "#4fae6e", pattern: "solid", furLength: 0.9, tail: "normal", ears: "normal", size: 0.98, scar: false, acc: { neck: "collar-red" } },
    { clan: "kittypet", rank: "kittypet", tags: ["kittypet", "twoplegplace", "ginger", "collar"] }),
  P("princess", "Princess", "twoplegplace", "Rusty's gentle sister, cream with a brown tail.",
    { fur: "#f4e9d8", furDark: "#c4b098", eye: "#4fae6e", pattern: "colorpoint", furLength: 1.2, tail: "fluffy", ears: "normal", size: 0.96, scar: false, acc: { neck: "collar-kittypet" } },
    { clan: "kittypet", rank: "kittypet", tags: ["kittypet", "twoplegplace", "cream", "collar"] }),
  P("smudge-street", "Pounce", "twoplegplace", "A Twolegplace apprentice of the alleys.",
    { fur: "#5c5c60", furDark: "#3a3a40", eye: "#d9a83a", pattern: "speckled", furLength: 0.85, tail: "slim", ears: "tall", size: 0.94, scar: false },
    { clan: "kittypet", rank: "kittypet", tags: ["kittypet", "twoplegplace", "gray"] }),

  // --- ROGUES -----------------------------------------------------------------
  P("barley", "Barley", "rogues", "The barn cat with a soft heart and a hard past.",
    { fur: "#1c1c20", furDark: "#101014", eye: "#4fae6e", pattern: "bicolor", furLength: 1.15, tail: "normal", ears: "normal", size: 1.06, scar: false, markings: ["muzzle", "chest", "paws"] },
    { tags: ["rogue", "barn", "black", "white"] }),
  P("violet", "Violet", "rogues", "A lone she-cat who survived BloodClan's shadow.",
    { fur: "#8f8f96", furDark: "#5c5c60", eye: "#4fae6e", pattern: "solid", furLength: 1, tail: "slim", ears: "normal", size: 0.94, scar: true, scars: ["cheek"] },
    { tags: ["rogue", "gray", "scarred"] }),
  P("scourge-like", "Tiny", "rogues", "Small, black, sharp-clawed — the city remembers him.",
    { fur: "#101014", furDark: "#08080a", eye: "#5b8fd6", pattern: "solid", furLength: 0.75, tail: "slim", ears: "tall", size: 0.9, scar: true, scars: ["brow", "nose"], acc: { neck: "collar-stud" } },
    { tags: ["rogue", "black", "collar", "villain"] }),

  // --- OTHER -----------------------------------------------------------------
  P("yellowfang-medicine", "Cinderpelt", "other", "The injured apprentice who became a great healer.",
    { fur: "#43434a", furDark: "#28282e", eye: "#5b8fd6", pattern: "solid", furLength: 1.05, tail: "normal", ears: "normal", size: 0.96, scar: true, scars: ["side"] },
    { clan: "thunderclan", rank: "medicine-cat", tags: ["thunderclan", "medicine cat", "gray", "blue eyes"] }),
  P("brightheart", "Brightheart", "other", "Scarred but unbreakable — lost half her face to dogs.",
    { fur: "#e8e6e0", furDark: "#b8b6ae", eye: "#4fae6e", pattern: "solid", furLength: 1, tail: "normal", ears: "normal", size: 0.98, scar: true, scars: ["brow", "cheek"], markings: ["muzzle"] },
    { clan: "thunderclan", rank: "warrior", tags: ["thunderclan", "warrior", "white", "scarred", "ginger"] }),
];

// ---------------------------------------------------------------------------
// MORPHS (§22-23): character looks applied with morph tracking. Data is
// identical in shape to presets — the difference is recorded on the skin.
// ---------------------------------------------------------------------------

export interface CatMorph {
  id: string;
  name: string;
  desc: string;
  skin: Omit<CustomSkin, "morph" | "presetId" | "accColors">;
  tags?: string[];
}

export const CAT_MORPHS: CatMorph[] = [
  { id: "fire-look", name: "Fire Look", desc: "Flame-pelted warrior with bright green eyes.", skin: { fur: "#d96b2f", furDark: "#a34a1a", eye: "#4fae6e", pattern: "solid", furLength: 0.9, tail: "long", ears: "tall", size: 1.04, markings: ["chest"] }, tags: ["ginger", "hero"] },
  { id: "shadow-look", name: "Shadow Look", desc: "Night-black pelt, pale eyes, silent paws.", skin: { fur: "#1c1c20", furDark: "#101014", eye: "#e8e6e0", pattern: "solid", furLength: 0.85, tail: "slim", ears: "tall", size: 0.98, markings: ["tailtip"] }, tags: ["black", "stealth"] },
  { id: "river-look", name: "River Look", desc: "Sleek silver tabby built for swimming.", skin: { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#5b8fd6", pattern: "mackerel", furLength: 0.7, tail: "slim", ears: "normal", size: 1, markings: ["chest"] }, tags: ["silver", "riverclan"] },
  { id: "moor-look", name: "Moor Look", desc: "Windy-moor runner: pale, long-legged, tall-eared.", skin: { fur: "#e3c088", furDark: "#b08d58", eye: "#d9a83a", pattern: "speckled", furLength: 0.75, tail: "long", ears: "tall", size: 1.02 }, tags: ["windclan", "pale"] },
  { id: "pine-look", name: "Pine Look", desc: "Dark forest hunter with stripes like bark-shadow.", skin: { fur: "#6b4a2f", furDark: "#42301e", eye: "#d9a83a", pattern: "mackerel", furLength: 1.1, tail: "normal", ears: "normal", size: 1.06, scars: ["ear"] }, tags: ["shadowclan", "tabby"] },
  { id: "silver-look", name: "Silver Look", desc: "Moonlit pale coat with deep blue eyes.", skin: { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#5b8fd6", pattern: "solid", furLength: 1.2, tail: "fluffy", ears: "normal", size: 1, markings: ["chest", "muzzle"] }, tags: ["silver", "starclan"] },
  { id: "elder-look", name: "Elder Look", desc: "Muzzle-frosted, scarred and slow-paced.", skin: { fur: "#8a7a66", furDark: "#5c5044", eye: "#d9a83a", pattern: "solid", furLength: 1.3, tail: "short", ears: "fold", size: 0.94, scars: ["brow"], markings: ["muzzle"] }, tags: ["elder", "scarred"] },
  { id: "kittypet-look", name: "Kittypet Look", desc: "Plump bell-furred house cat with a bright collar.", skin: { fur: "#e8e6e0", furDark: "#b8b6ae", eye: "#5b8fd6", pattern: "bicolor", furLength: 1.15, tail: "normal", ears: "fold", size: 1.06, acc: { neck: "collar-kittypet" } }, tags: ["kittypet", "collar"] },
];

// ---------------------------------------------------------------------------
// Lookup / application helpers
// ---------------------------------------------------------------------------

export function presetById(id: string): CharacterPreset | undefined {
  return CHARACTER_PRESETS.find((p) => p.id === id);
}

export function morphById(id: string): CatMorph | undefined {
  return CAT_MORPHS.find((m) => m.id === id);
}

/** Apply a preset's APPEARANCE (never just the name) with presetId tracked. */
export function applyPreset(base: CustomSkin, presetId: string): CustomSkin {
  const preset = presetById(presetId);
  if (!preset) return base;
  return { ...structuredClone(base), ...structuredClone(preset.skin), presetId, morph: undefined };
}

/** Apply a morph look, recording morph + keeping the player's own identity. */
export function applyMorph(base: CustomSkin, morphId: string): CustomSkin {
  const morph = morphById(morphId);
  if (!morph) return base;
  return { ...structuredClone(base), ...structuredClone(morph.skin), morph: morphId };
}

/** Strip a preset/morph back to the player's own base custom look (§30). */
export function stripPresetAndMorph(base: CustomSkin): CustomSkin {
  const s = structuredClone(base);
  delete s.presetId;
  delete s.morph;
  return s;
}
