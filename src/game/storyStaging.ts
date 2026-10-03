// §1/§5/§6/§7/§8/§19: Story Mode character staging — the single source of
// truth for WHO is WHERE during every story step.
//
// Coordinates are REAL MAP coordinates: they reuse the exact tile math from
// src/game/world.ts (TILE=32, TC_OX/TC_OY = +48/+40 tiles, CAMP_CENTER =
// (41,46)+TC = (89,86) tiles) so a staged position is always a genuine spot
// at the actual landmark — never a faked backdrop. This module is
// dependency-free so static checks can import it headless and the engine and
// Game can both rely on it.
//
// Staging feeds the engine's story anchors: a staged cat WALKS to its mark
// (physical travel, §10), arrives, faces the right way (§13) and HOLDS that
// spot for the step — normal AI resumes when the story no longer stages it
// (§2/§24). The player's arrival spot and the exclusion circle (§17) come
// from the scene, and background cats politely keep out of it.

export const TILE = 32;

/** ThunderClan-offset tile helper (world.ts: TC_OX = t(48), TC_OY = t(40)). */
const tc = (tx: number, ty: number): { x: number; y: number } => ({
  x: (tx + 48) * TILE,
  y: (ty + 40) * TILE,
});
/** ThunderClan camp-center offset in tiles (CAMP_CENTER = (41,46)+TC). */
const cc = (dx: number, dy: number): { x: number; y: number } => tc(41 + dx, 46 + dy);
/** WindClan camp center + offset (camp area spans tiles 12–28 × 76–92). */
const wcl = (dx: number, dy: number): { x: number; y: number } => ({
  x: (20 + dx) * TILE,
  y: (84 + dy) * TILE,
});
const pt = (tx: number, ty: number): { x: number; y: number } => ({ x: tx * TILE, y: ty * TILE });

export type StoryFace = "player" | "left" | "right" | "up" | "down" | "scene";
export type StoryPriority = "main" | "secondary" | "background";

export interface StoryLocation {
  x: number;
  y: number;
  label: string;
  territory: string;
}

/** §6/§7: story location database — every id is a REAL map landmark. */
export const STORY_LOCATIONS: Record<string, StoryLocation> = {
  "twoleg-garden": { ...pt(78, 146), label: "Rusty's garden street", territory: "twolegplace" },
  "twoleg-street": { ...pt(74.5, 144.1), label: "Smudge's garden", territory: "twolegplace" },
  "forest-edge": { ...tc(26, 70), label: "The forest edge by Tallpines", territory: "tallpines" },
  "tc-entrance": { ...cc(-0.5, 23.2), label: "Gorse tunnel", territory: "thunderclan" },
  "tc-clearing": { ...cc(0, 1.5), label: "Camp clearing", territory: "thunderclan" },
  "tc-tallrock": { ...cc(1.4, -5.4), label: "Beneath the Tallrock", territory: "thunderclan" },
  "tc-fresh-kill": { ...cc(-2.4, -0.4), label: "Fresh-kill pile", territory: "thunderclan" },
  "tc-medicine-den": { ...cc(8.2, -0.8), label: "Medicine cat's den", territory: "thunderclan" },
  "tc-nursery": { ...cc(-5.4, 5.6), label: "Nursery", territory: "thunderclan" },
  "tc-warriors-den": { ...cc(4.2, 7.4), label: "Warriors' den", territory: "thunderclan" },
  "tc-apprentices-den": { ...cc(8, 4.4), label: "Apprentices' den", territory: "thunderclan" },
  "tc-elders-den": { ...cc(-6.2, 0.6), label: "Elders' den", territory: "thunderclan" },
  "sandy-hollow": { ...tc(32.5, 63.3), label: "Sandy Hollow", territory: "sandy" },
  "bm-tc-west": { ...pt(50.25, 76), label: "River border marker", territory: "thunderclan" },
  "river-bank": { ...pt(49, 76), label: "The river bank", territory: "river" },
  "snakerocks": { ...tc(68, 19.4), label: "Snakerocks", territory: "snakerocks" },
  "sunningrocks": { ...tc(9, 41.3), label: "Sunningrocks", territory: "sunningrocks" },
  "fourtrees": { ...tc(19, 67), label: "Fourtrees clearing", territory: "fourtrees" },
  "windclan-camp": { ...wcl(0, 0), label: "WindClan camp", territory: "windclan-camp" },
  "moonstone": { ...pt(27.5, 44.8), label: "Mothermouth entrance", territory: "highstones" },
};

export interface StagedNpc {
  npcId: string;
  x: number;
  y: number;
  face: StoryFace;
  pose?: "sit" | "groom" | "sleep" | "crouch";
  priority: StoryPriority;
  /** shown in the debug overlay (§33) */
  label: string;
}

export interface StepStaging {
  /** scene center + exclusion radius (§17) — background cats keep out */
  scene: { x: number; y: number; r: number; label: string } | null;
  npcs: StagedNpc[];
}

// §19: chapter-based character states. Each step stages exactly WHO is
// present and WHERE — everyone else keeps normal AI from wherever they are.
// Positions carry personal offsets so staged cats never overlap (§14).
const S = (
  scene: { x: number; y: number; r: number; label: string } | null,
  npcs: StagedNpc[],
): StepStaging => ({ scene, npcs });

const N = (
  npcId: string,
  loc: keyof typeof STORY_LOCATIONS,
  dx: number,
  dy: number,
  face: StoryFace,
  priority: StoryPriority,
  label: string,
  pose?: StagedNpc["pose"],
): StagedNpc => {
  const l = STORY_LOCATIONS[loc];
  return { npcId, x: l.x + dx, y: l.y + dy, face, pose, priority, label };
};

export const STAGED_STEPS: Record<string, StepStaging> = {
  // Chapter 1 — kittypet days: everyone story-relevant is in Twolegplace.
  "s1-twolegplace": S(
    { ...STORY_LOCATIONS["twoleg-garden"], r: 170 },
    [
      N("smudge", "twoleg-garden", -18, 10, "player", "main", "meeting the player"),
      N("rusty", "twoleg-garden", 46, -6, "scene", "background", "idling by his garden"),
      N("henry", "twoleg-street", 10, 26, "scene", "background", "garden life"),
      N("princess", "twoleg-street", -86, -22, "scene", "background", "by her porch"),
    ],
  ),
  // Into the forest — a travel step: the kittypets stay HOME (never wander
  // into ThunderClan territory), no scene is staged.
  "s2-into-forest": S(null, [
    N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
    N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    N("henry", "twoleg-street", 10, 26, "down", "background", "home"),
  ]),
  // Graypaw ambushes the kittypet at the forest edge — he physically WALKS
  // there from his life in camp (~300px, always visible travel, §10).
  "s3-graypaw": S(
    { ...STORY_LOCATIONS["forest-edge"], r: 150 },
    [
      N("graypaw", "forest-edge", -10, 14, "player", "main", "ambushing the newcomer"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // The camp, in mourning: the whole core cast staged across the clearing,
  // each at a real den/landmark, facing the arrival path (§14 readable ring).
  "s4-the-camp": S(
    { ...STORY_LOCATIONS["tc-clearing"], r: 180 },
    [
      N("bluestar", "tc-tallrock", 0, 0, "player", "main", "watching from the Tallrock"),
      N("graypaw", "tc-entrance", 34, -26, "player", "secondary", "welcoming at the gorse tunnel"),
      N("lionheart", "tc-clearing", 96, 26, "scene", "secondary", "by the clearing"),
      N("tigerclaw", "tc-clearing", 168, 6, "scene", "secondary", "suspicious, apart"),
      N("whitestorm", "tc-clearing", -128, 22, "scene", "secondary", "calm, near the elders"),
      N("spottedleaf", "tc-medicine-den", 0, 0, "scene", "background", "her den"),
      N("ravenpaw", "tc-apprentices-den", -6, 8, "scene", "background", "nervous, at the den"),
      N("sandpaw", "tc-clearing", -84, 48, "scene", "background", "among the apprentices"),
      N("dustpaw", "tc-warriors-den", -20, 0, "scene", "background", "outside the warriors' den"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home in Twolegplace"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home in Twolegplace"),
    ],
  ),
  // Bluestar's offer — the leader holds her rock; the Clan gives space.
  "s5-bluestar": S(
    { ...STORY_LOCATIONS["tc-clearing"], r: 150 },
    [
      N("bluestar", "tc-tallrock", 0, 0, "player", "main", "the leader's offer"),
      N("graypaw", "tc-clearing", -76, 96, "player", "secondary", "listening nearby"),
      N("lionheart", "tc-clearing", 108, 74, "scene", "background", "keeping an eye out"),
      N("spottedleaf", "tc-medicine-den", 0, 0, "scene", "background", "her den"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Lionheart's test — circle work in the open clearing; Bluestar watches
  // from the Tallrock (continuity: the leader never leaves mid-chapter).
  "s6-test-lionheart": S(
    { ...STORY_LOCATIONS["tc-clearing"], r: 150 },
    [
      N("lionheart", "tc-clearing", 48, 88, "player", "main", "testing the kittypet"),
      N("bluestar", "tc-tallrock", 0, 0, "scene", "background", "watching from her rock"),
      N("graypaw", "tc-clearing", -88, 66, "player", "secondary", "watching the test"),
      N("tigerclaw", "tc-clearing", 176, -8, "scene", "background", "watching, cold"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Named before StarClan — beneath the Tallrock at moonhigh.
  "s7-firepaw": S(
    { ...STORY_LOCATIONS["tc-clearing"], r: 150 },
    [
      N("spottedleaf", "tc-clearing", -58, -80, "player", "main", "giving the blessing"),
      N("bluestar", "tc-tallrock", 0, 0, "scene", "secondary", "presiding"),
      N("graypaw", "tc-clearing", 38, 66, "player", "secondary", "celebrating"),
      N("lionheart", "tc-clearing", 120, 40, "scene", "background", "among the warriors"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // First hunt — Graypaw waits by the fresh-kill; the patrol lives normally.
  "s8-hunt-first": S(
    { ...STORY_LOCATIONS["tc-fresh-kill"], r: 130 },
    [
      N("graypaw", "tc-fresh-kill", 0, 0, "down", "main", "waiting at the pile"),
      N("bluestar", "tc-tallrock", 0, 0, "scene", "background", "her rock"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Battle training — Whitestorm drills the apprentices at the Sandy Hollow.
  "s9-training": S(
    { ...STORY_LOCATIONS["sandy-hollow"], r: 160 },
    [
      N("whitestorm", "sandy-hollow", -24, -10, "player", "main", "running the session"),
      N("graypaw", "sandy-hollow", 36, 16, "scene", "secondary", "drilling"),
      N("sandpaw", "sandy-hollow", 8, 40, "scene", "secondary", "drilling"),
      N("dustpaw", "sandy-hollow", -56, 26, "scene", "secondary", "drilling"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Border patrol — the patrol physically walks to the river marker together.
  "s10-border-patrol": S(
    { ...STORY_LOCATIONS["bm-tc-west"], r: 150 },
    [
      N("lionheart", "bm-tc-west", -8, 10, "left", "main", "leading the patrol"),
      N("whitestorm", "bm-tc-west", 46, -22, "left", "secondary", "flanking"),
      N("graypaw", "bm-tc-west", 20, 36, "left", "secondary", "learning the border"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Oakheart across the water — RiverClan deputy on HIS side of the stones.
  "s11-riverclan": S(
    { ...STORY_LOCATIONS["river-bank"], r: 150 },
    [
      N("oakheart", "bm-tc-west", -62, -6, "right", "main", "across the stepping stones"),
      N("lionheart", "bm-tc-west", 34, 8, "left", "secondary", "bristling at the bank"),
      N("graypaw", "bm-tc-west", 6, 42, "left", "background", "watching"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Yellowfang at Snakerocks (she exists from step 12 onward — storyFrom 11).
  "s12-shadowclan-scent": S(
    { ...STORY_LOCATIONS["snakerocks"], r: 160 },
    [
      N("yellowfang", "snakerocks", -12, 18, "player", "main", "hiding at Snakerocks"),
      N("ravenpaw", "tc-apprentices-den", -6, 8, "down", "background", "home, trembling"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // The open moor — WindClan's leader receives the visitor in HIS camp.
  "s13-windclan-moor": S(
    { ...STORY_LOCATIONS["windclan-camp"], r: 170 },
    [
      N("tallstar", "windclan-camp", 0, -16, "player", "main", "receiving the guest"),
      N("mudclaw", "windclan-camp", 44, 20, "scene", "background", "watchful warrior"),
      N("deadfoot", "windclan-camp", -42, 22, "scene", "background", "calm deputy"),
      N("barkface", "windclan-camp", 12, 44, "scene", "background", "medicine cat"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // The Gathering — leaders on the Great Oak's roots, apprentices behind.
  "s14-gathering": S(
    { ...STORY_LOCATIONS["fourtrees"], r: 200 },
    [
      N("bluestar", "fourtrees", 0, -34, "scene", "main", "speaking for ThunderClan"),
      N("tallstar", "fourtrees", 66, 24, "scene", "secondary", "on the roots"),
      N("crookedstar", "fourtrees", -66, 24, "scene", "secondary", "on the roots"),
      N("brokenstar", "fourtrees", 0, 40, "scene", "secondary", "shadows at the edge"),
      N("graypaw", "fourtrees", 30, -58, "player", "secondary", "beside the player"),
      N("sandpaw", "fourtrees", 88, 56, "scene", "background", "with the apprentices"),
      N("dustpaw", "fourtrees", -88, 56, "scene", "background", "with the apprentices"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // The Moonstone — Bluestar leads the apprentices to Mothermouth.
  "s15-moonstone": S(
    { ...STORY_LOCATIONS["moonstone"], r: 140 },
    [
      N("bluestar", "moonstone", 20, 28, "up", "main", "at the cave mouth"),
      N("graypaw", "moonstone", -28, 32, "up", "secondary", "beside the player"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Battle for Sunningrocks — the patrol meets the ShadowClan charge.
  "s16-final-battle": S(
    { ...STORY_LOCATIONS["sunningrocks"], r: 200 },
    [
      N("lionheart", "sunningrocks", -32, -14, "left", "main", "holding the line"),
      N("tigerclaw", "sunningrocks", 8, -46, "left", "secondary", "fighting at the edge"),
      N("whitestorm", "sunningrocks", 38, 18, "left", "secondary", "flanking"),
      N("ravenpaw", "sunningrocks", 66, 46, "player", "secondary", "the whisper after battle"),
      N("oakheart", "sunningrocks", -128, 8, "right", "background", "RiverClan side"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
  // Epilogue — the Clan fed and settled; Graypaw waits at the pile.
  "s17-epilogue": S(
    { ...STORY_LOCATIONS["tc-fresh-kill"], r: 150 },
    [
      N("graypaw", "tc-fresh-kill", 0, 0, "player", "main", "sharing tongues"),
      N("bluestar", "tc-tallrock", 0, 0, "scene", "background", "her rock"),
      N("spottedleaf", "tc-medicine-den", 0, 0, "scene", "background", "her den"),
      N("ravenpaw", "tc-apprentices-den", -6, 8, "scene", "background", "settled"),
      N("smudge", "twoleg-street", 0, 0, "down", "background", "home"),
      N("rusty", "twoleg-garden", 46, -6, "down", "background", "home"),
    ],
  ),
};

/** Resolve staging for a step id (null when the step has no staged cast). */
export function resolveStaging(stepId: string | undefined): StepStaging | null {
  if (!stepId) return null;
  return STAGED_STEPS[stepId] ?? null;
}

/** Which npc ids a beat will direct (its acting + camera targets, §22). */
export function beatActorIds(
  beat: { lines: { act?: { npcId?: string } | null; cam?: unknown }[] },
): string[] {
  const ids: string[] = [];
  for (const line of beat.lines) {
    if (line.act?.npcId && !ids.includes(line.act.npcId)) ids.push(line.act.npcId);
    const cam = line.cam as { npcId?: string } | null | undefined;
    if (cam && typeof cam.npcId === "string" && !ids.includes(cam.npcId)) ids.push(cam.npcId);
  }
  return ids;
}
