// WarriorCatsRPG — world data. Four Clan territories laid out like the books:
// ThunderClan forest center, WindClan moor west across the river, RiverClan
// east across the river, ShadowClan north beyond the Thunderpath. Twolegplace
// and the farm sit south; Fourtrees and Highstones are shared ground.

export const TILE = 32;
export const MAP_W = 192; // tiles
export const MAP_H = 176; // tiles
export const WORLD_W = MAP_W * TILE; // 6144
export const WORLD_H = MAP_H * TILE; // 5632

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type InteractableKind =
  | "leader-den" | "medicine-den" | "warriors-den" | "apprentices-den"
  | "nursery" | "elders-den" | "fresh-kill" | "tallrock" | "entrance"
  | "training-hollow" | "sunningrocks" | "owltree" | "snakerocks"
  | "fourtrees" | "sycamore" | "tallpines" | "thunderpath" | "river"
  | "moonstone" | "twolegplace" | "farm" | "windclan-camp"
  | "riverclan-camp" | "shadowclan-camp" | "highstones" | "lilypool"
  | "border-marker" | "herbs";

export type Style =
  | "rock" | "bramble" | "bush" | "log" | "tree" | "stump"
  | "fresh-kill" | "stone" | "house" | "barn" | "fence" | "cave"
  | "reeds" | "nest" | "herbs" | "flowerbed" | "tallrock-big" | "prey-pile"
  // content-expansion styles (Into the Wild flavored)
  | "feathers" | "mudpatch" | "puddle" | "driftwood" | "burrow" | "mossball" | "vines" | "toy" | "carpet" | "lamp" | "plank" | "haybale" | "fishing-spot" | "door";

export interface WorldObject {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  interact?: InteractableKind;
  /** enters an interior room instead of showing lore */
  interior?: string;
  style: Style;
  solid?: boolean;
  scale?: number;
  /** visual garnish only — never shows an interact prompt */
  detail?: boolean;
  /** Pokemon-style doorway: door tile offset from object center (tiles). */
  doorAt?: { dx: number; dy: number };
}

export interface NPCScheduleSlot {
  /** start hour (0-24 game time) */
  h: number;
  x: number;
  y: number;
  activity?: string;
}

export interface NPCDef {
  id: string;
  name: string;
  role: string;
  clan: string;
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern?: "solid" | "tabby" | "tortie" | "bicolor";
  tail?: "normal" | "short" | "fluffy" | "bob";
  wander: boolean;
  home: Vec2;
  schedule?: NPCScheduleSlot[];
  lines: string[];
  /** only present in story mode after this step */
  storyOnly?: boolean;
}

export interface AreaDef {
  id: string;
  name: string;
  rect: Rect;
}

const t = (n: number) => n * TILE;

// ---------------------------------------------------------------------------
// ThunderClan content is authored in its own local space (the original map)
// and shifted into the big world.
// ---------------------------------------------------------------------------

export const TC_OX = t(48);
export const TC_OY = t(40);

function shiftRect(r: Rect): Rect {
  return { x: r.x + TC_OX, y: r.y + TC_OY, w: r.w, h: r.h };
}

// ---------------------------------------------------------------------------
// Key regions (ThunderClan local coords, shifted below)
// ---------------------------------------------------------------------------

export const CAMP_CENTER: Vec2 = { x: t(41) + TC_OX, y: t(46) + TC_OY };
export const CAMP_RADIUS = t(12.5);

/**
 * Default spawn — Rusty's garden in Twolegplace, next to Smudge's home.
 * Every new session (and every respawn) starts in the kittypet neighborhood.
 */
export const SPAWN: Vec2 = { x: t(78), y: t(146) };

export const CLAN_SPAWNS: Record<string, Vec2> = {
  thunderclan: { x: CAMP_CENTER.x, y: t(59.5) + TC_OY },
  windclan: { x: t(20), y: t(84) + t(3) },
  riverclan: { x: t(170), y: t(96) + t(3) },
  shadowclan: { x: t(96), y: t(20) + t(3) },
  // The kittypet life: Rusty's garden on Smudge's street.
  kittypet: SPAWN,
};

export const clearZones: Rect[] = [
  { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 },
  { x: t(28) + TC_OX, y: t(44) + TC_OY, w: t(14), h: t(4) },   // west trail
  { x: t(39) + TC_OX, y: t(55) + TC_OY, w: t(5), h: t(12) },   // south trail
  { x: t(36) + TC_OX, y: t(64) + TC_OY, w: t(12), h: t(4) },   // south fork
  { x: t(41) + TC_OX, y: t(38) + TC_OY, w: t(5), h: t(9) },    // north trail
  { x: t(42) + TC_OX, y: t(31) + TC_OY, w: t(14), h: t(4) },   // NE trail
  { x: t(55) + TC_OX, y: t(31) + TC_OY, w: t(4), h: t(12) },   // east trail
  { x: t(26) + TC_OX, y: t(58) + TC_OY, w: t(11), h: t(9) },   // Sandy Hollow
  { x: t(14) + TC_OX, y: t(62) + TC_OY, w: t(10), h: t(10) },  // Fourtrees
  { x: t(52) + TC_OX, y: t(40) + TC_OY, w: t(8), h: t(6) },    // Owl Tree
  { x: t(62) + TC_OX, y: t(14) + TC_OY, w: t(9), h: t(8) },    // Snakerocks
  { x: t(16) + TC_OX, y: t(36) + TC_OY, w: t(8), h: t(8) },    // Great Sycamore
  { x: t(4) + TC_OX, y: t(34) + TC_OY, w: t(7), h: t(12) },    // Sunningrocks
  { x: t(42) + TC_OX, y: t(68) + TC_OY, w: t(4), h: t(4) },    // Smudge's garden fence corner
  // shared / other clans
  { x: t(10), y: t(74), w: t(22), h: t(20) },                  // WindClan camp
  { x: t(160), y: t(86), w: t(22), h: t(20) },                 // RiverClan camp
  { x: t(86), y: t(10), w: t(20), h: t(18) },                  // ShadowClan camp
  { x: t(58), y: t(128), w: t(40), h: t(40) },                 // Twolegplace
  { x: t(104), y: t(136), w: t(40), h: t(36) },                // Farm
  { x: t(18), y: t(38), w: t(16), h: t(10) },                  // Highstones
  { x: t(140), y: t(64), w: t(16), h: t(6) },                  // east river crossing approach
];

// ---------------------------------------------------------------------------
// Ground painting
// ---------------------------------------------------------------------------

export type GroundKind =
  | "grass" | "sand" | "water" | "stone" | "paved" | "pine" | "dirt"
  | "moor" | "marsh" | "riverbank" | "reeds";

export const GROUND_CELL = 8;
export const GROUND_COLS = WORLD_W / GROUND_CELL;
export const GROUND_ROWS = WORLD_H / GROUND_CELL;

// Absolute regions for the whole world.
export const groundRegions: { kind: GroundKind; rect: Rect }[] = [
  // --- ThunderClan (shifted) ---
  { kind: "sand", rect: { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 } },
  { kind: "water", rect: { x: TC_OX, y: t(28) + TC_OY, w: t(4), h: WORLD_H - (t(28) + TC_OY) } }, // west river (WindClan border)
  { kind: "paved", rect: { x: 0, y: t(2) + TC_OY, w: WORLD_W, h: t(4) } },  // Thunderpath
  { kind: "stone", rect: { x: t(4) + TC_OX, y: t(36) + TC_OY, w: t(7), h: t(9) } }, // Sunningrocks
  { kind: "sand", rect: { x: t(27) + TC_OX, y: t(59) + TC_OY, w: t(9), h: t(7) } }, // Sandy Hollow
  { kind: "stone", rect: { x: t(63) + TC_OX, y: t(15) + TC_OY, w: t(7), h: t(6) } }, // Snakerocks
  { kind: "pine", rect: { x: t(6) + TC_OX, y: t(66) + TC_OY, w: t(42), h: WORLD_H - (t(66) + TC_OY) } }, // Tallpines south
  { kind: "sand", rect: { x: t(17) + TC_OX, y: t(65) + TC_OY, w: t(8), h: t(7) } }, // Fourtrees clearing
  // --- ShadowClan (north of the Thunderpath) ---
  { kind: "pine", rect: { x: t(46), y: 0, w: t(100), h: t(40) } },
  { kind: "marsh", rect: { x: t(108), y: t(6), w: t(34), h: t(30) } }, // marshes east
  { kind: "sand", rect: { x: t(88), y: t(14), w: t(16), h: t(12) } }, // ShadowClan camp floor
  // --- WindClan (west moor) ---
  { kind: "moor", rect: { x: 0, y: t(40), w: t(48), h: WORLD_H - t(40) } },
  { kind: "sand", rect: { x: t(13), y: t(78), w: t(14), h: t(12) } }, // WindClan camp bowl
  // --- east river (RiverClan border) ---
  { kind: "water", rect: { x: t(144), y: t(48), w: t(8), h: WORLD_H - t(48) } },
  // --- RiverClan (east) ---
  { kind: "riverbank", rect: { x: t(152), y: t(40), w: t(40), h: WORLD_H - t(40) } },
  { kind: "water", rect: { x: t(154), y: t(110), w: t(38), h: t(12) } }, // lake/streams in RiverClan
  { kind: "reeds", rect: { x: t(152), y: t(46), w: t(8), h: WORLD_H - t(46) } }, // reed bank along river
  { kind: "sand", rect: { x: t(162), y: t(90), w: t(16), h: t(12) } }, // RiverClan camp floor
  // --- Twolegplace (south-west) ---
  { kind: "paved", rect: { x: t(70), y: t(128), w: t(4), h: t(48) } },  // vertical road
  { kind: "paved", rect: { x: t(46), y: t(148), w: t(58), h: t(4) } },  // horizontal road
  { kind: "dirt", rect: { x: t(50), y: t(132), w: t(50), h: t(14) } },  // gardens strip
  // --- Farm (south-east of Twolegplace) ---
  { kind: "dirt", rect: { x: t(104), y: t(136), w: t(40), h: t(36) } },
  // --- Highstones ---
  { kind: "stone", rect: { x: t(18), y: t(38), w: t(16), h: t(10) } },
];

/** Trails — painted as dirt over everything. */
export const trailRects: Rect[] = [
  // ThunderClan internal (shifted)
  { x: t(30) + TC_OX, y: t(47) + TC_OY, w: t(12), h: t(2) },
  { x: t(41) + TC_OX, y: t(55) + TC_OY, w: t(2), h: t(11) },
  { x: t(37) + TC_OX, y: t(65) + TC_OY, w: t(12), h: t(2) },
  { x: t(42) + TC_OX, y: t(38) + TC_OY, w: t(2), h: t(9) },
  { x: t(42) + TC_OX, y: t(31) + TC_OY, w: t(14), h: t(2) },
  { x: t(55) + TC_OX, y: t(31) + TC_OY, w: t(2), h: t(12) },
  // long routes
  { x: t(88), y: t(42), w: t(3), h: t(50) },       // TC camp -> over Thunderpath -> ShadowClan
  { x: t(89), y: t(10), w: t(3), h: t(34) },       // into ShadowClan camp
  { x: t(104), y: t(70), w: t(46), h: t(3) },      // TC east trail -> river crossing
  { x: t(146), y: t(72), w: t(3), h: t(20) },      // down to east crossing
  { x: t(148), y: t(90), w: t(22), h: t(3) },      // crossing -> RiverClan camp
  { x: t(67), y: t(86), w: t(12), h: t(3) },       // TC west trail -> Fourtrees
  { x: t(50), y: t(99), w: t(18), h: t(3) },       // Fourtrees -> west crossing
  { x: t(48), y: t(99), w: t(3), h: t(40) },       // along west bank south
  { x: t(20), y: t(55), w: t(31), h: t(3) },       // west crossing -> WindClan camp
  { x: t(89), y: t(113), w: t(3), h: t(38) },      // Tallpines -> Twolegplace road
  { x: t(46), y: t(148), w: t(60), h: t(3) },      // main street
  { x: t(104), y: t(150), w: t(24), h: t(3) },     // road -> farm
  { x: t(26), y: t(46), w: t(3), h: t(12) },       // Fourtrees path north to Highstones
];

const KIND_INDEX: Record<GroundKind, number> = {
  grass: 0, sand: 1, water: 2, stone: 3, paved: 4, pine: 5, dirt: 6,
  moor: 7, marsh: 8, riverbank: 9, reeds: 10,
};

export const groundMap: Uint8Array = new Uint8Array(GROUND_COLS * GROUND_ROWS);

function buildGroundMap() {
  const inRect = (x: number, y: number, r: Rect) =>
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  groundMap.fill(KIND_INDEX.grass);
  for (const reg of [...groundRegions]) {
    const k = KIND_INDEX[reg.kind];
    const x0 = Math.floor(reg.rect.x / GROUND_CELL);
    const y0 = Math.floor(reg.rect.y / GROUND_CELL);
    const x1 = Math.ceil((reg.rect.x + reg.rect.w) / GROUND_CELL);
    const y1 = Math.ceil((reg.rect.y + reg.rect.h) / GROUND_CELL);
    for (let cy = Math.max(0, y0); cy < Math.min(GROUND_ROWS, y1); cy++) {
      for (let cx = Math.max(0, x0); cx < Math.min(GROUND_COLS, x1); cx++) {
        const wx = cx * GROUND_CELL + GROUND_CELL / 2;
        const wy = cy * GROUND_CELL + GROUND_CELL / 2;
        if (inRect(wx, wy, reg.rect)) {
          groundMap[cy * GROUND_COLS + cx] = k;
        }
      }
    }
  }
  for (const tr of trailRects) {
    const x0 = Math.floor(tr.x / GROUND_CELL);
    const y0 = Math.floor(tr.y / GROUND_CELL);
    const x1 = Math.ceil((tr.x + tr.w) / GROUND_CELL);
    const y1 = Math.ceil((tr.y + tr.h) / GROUND_CELL);
    for (let cy = Math.max(0, y0); cy < Math.min(GROUND_ROWS, y1); cy++) {
      for (let cx = Math.max(0, x0); cx < Math.min(GROUND_COLS, x1); cx++) {
        groundMap[cy * GROUND_COLS + cx] = KIND_INDEX.dirt;
      }
    }
  }
}

/** Which Clan territory a point is in (for chat, spawning, ranks). */
export function clanAt(x: number, y: number): string {
  if (x < t(48)) return "windclan";
  if (x >= t(152)) return "riverclan";
  if (y < t(40)) return "shadowclan";
  return "thunderclan";
}

// ---------------------------------------------------------------------------
// Objects — ThunderClan camp (local coords, shifted)
// ---------------------------------------------------------------------------

const cc = CAMP_CENTER;

const tcCampObjects: WorldObject[] = [
  {
    id: "tallrock",
    x: cc.x, y: cc.y - t(8.6), w: t(6), h: t(4.6),
    label: "Highrock", interact: "tallrock", style: "tallrock-big", solid: true, scale: 1.5,
  },
  // Highrock garnish: weathered cracks, moss, and plants at its base
  { id: "tallrock-crack", x: cc.x - t(1.4), y: cc.y - t(7.4), w: t(1.2), h: t(0.8), style: "vines", detail: true },
  { id: "tallrock-crack-2", x: cc.x + t(1.2), y: cc.y - t(6.4), w: t(1), h: t(0.8), style: "vines", detail: true },
  { id: "tallrock-moss", x: cc.x - t(2.2), y: cc.y - t(5.6), w: t(1.6), h: t(1), style: "mossball", detail: true },
  { id: "tallrock-fern", x: cc.x + t(2.4), y: cc.y - t(5.2), w: t(1.2), h: t(1), style: "bush", detail: true },
  { id: "tallrock-stone", x: cc.x - t(3), y: cc.y - t(4.6), w: t(1), h: t(0.8), style: "stone", detail: true },
  {
    id: "leader-den",
    x: cc.x + t(3.4), y: cc.y - t(6.8), w: t(2.2), h: t(2.2),
    label: "Leader's den", interact: "leader-den", interior: "tc-leader-den",
    style: "bramble", solid: true,
  },
  {
    id: "medicine-den",
    x: cc.x + t(8.2), y: cc.y - t(4.2), w: t(3.6), h: t(3),
    label: "Medicine cat's den", interact: "medicine-den", interior: "tc-medicine-den",
    style: "bush", solid: true, scale: 1.2,
  },
  {
    id: "medicine-stone",
    x: cc.x + t(8.4), y: cc.y - t(1.2), w: t(1.6), h: t(1.2),
    label: "Stone with a pool of rainwater", style: "stone", solid: true,
  },
  {
    id: "nursery",
    x: cc.x - t(7.4), y: cc.y + t(4.2), w: t(4), h: t(3.2),
    label: "Nursery", interact: "nursery", interior: "tc-nursery",
    style: "bramble", solid: true, scale: 1.2,
  },
  {
    id: "warriors-den",
    x: cc.x + t(4.6), y: cc.y + t(5.4), w: t(3.6), h: t(3),
    label: "Warriors' den", interact: "warriors-den", interior: "tc-warriors-den",
    style: "bush", solid: true, scale: 1.2,
  },
  {
    id: "apprentices-den",
    x: cc.x + t(8.6), y: cc.y + t(2.6), w: t(3), h: t(2.6),
    label: "Apprentices' den", interact: "apprentices-den", interior: "tc-apprentices-den",
    style: "bramble", solid: true, scale: 1.15,
  },
  {
    id: "elders-den",
    x: cc.x - t(8.2), y: cc.y - t(1.6), w: t(4.4), h: t(2.4),
    label: "Elders' den", interact: "elders-den", interior: "tc-elders-den",
    style: "log", solid: true, scale: 1.2,
  },
  {
    id: "fresh-kill",
    x: cc.x - t(1.6), y: cc.y - t(1.2), w: t(1.8), h: t(1.4),
    label: "Fresh-kill pile", interact: "fresh-kill", style: "fresh-kill",
  },
  // fresh-kill garnish: distinct prey laid around the pile
  { id: "fk-mouse", x: cc.x - t(2.8), y: cc.y - t(0.6), w: t(0.6), h: t(0.5), style: "prey-pile", detail: true },
  { id: "fk-rabbit", x: cc.x - t(0.4), y: cc.y - t(2.4), w: t(1), h: t(0.8), style: "prey-pile", detail: true, scale: 1.4 },
  { id: "fk-squirrel", x: cc.x - t(2.6), y: cc.y - t(2), w: t(0.9), h: t(0.7), style: "prey-pile", detail: true, scale: 1.2 },
  { id: "fk-starling", x: cc.x - t(0.2), y: cc.y + t(0.2), w: t(0.8), h: t(0.6), style: "feathers", detail: true },
  // nesting-material cache beside the warriors' den
  { id: "nesting-cache", x: cc.x + t(3), y: cc.y + t(7.4), w: t(1.4), h: t(1), style: "mossball", detail: true },
  {
    id: "entrance",
    x: cc.x - t(0.5), y: cc.y + t(11.4), w: t(2.4), h: t(2),
    label: "Gorse tunnel", interact: "entrance", style: "bramble", scale: 1.2,
  },
  // Lived-in details: resting stones, moss patches, fallen branches
  { id: "tc-stone-1", x: cc.x - t(3), y: cc.y + t(1.6), w: t(1.4), h: t(1.1), label: "Sun-warmed stone", style: "stone" },
  { id: "tc-stone-2", x: cc.x + t(2.2), y: cc.y - t(2.4), w: t(1.4), h: t(1.1), label: "Sun-warmed stone", style: "stone" },
  { id: "tc-stone-3", x: cc.x + t(6.2), y: cc.y + t(0.4), w: t(1.4), h: t(1.1), label: "Sun-warmed stone", style: "stone" },
  { id: "tc-moss-1", x: cc.x - t(5.6), y: cc.y - t(3.8), w: t(1.8), h: t(1.2), label: "Soft moss", style: "bush" },
  { id: "tc-moss-2", x: cc.x + t(3.2), y: cc.y + t(2.2), w: t(1.8), h: t(1.2), label: "Soft moss", style: "bush" },
  { id: "tc-branch", x: cc.x - t(2.2), y: cc.y + t(7.6), w: t(3.2), h: t(1), label: "Fallen branch", style: "log" },
  // clearing detail: grass patches, flattened earth, small stones, moss, leaves
  { id: "tc-grass-a", x: cc.x - t(6.2), y: cc.y + t(0.4), w: t(1.6), h: t(1.2), style: "mossball", detail: true },
  { id: "tc-grass-b", x: cc.x + t(5.4), y: cc.y - t(2), w: t(1.6), h: t(1.2), style: "mossball", detail: true },
  { id: "tc-grass-c", x: cc.x - t(4), y: cc.y + t(6.4), w: t(1.4), h: t(1), style: "mossball", detail: true },
  { id: "tc-earth-a", x: cc.x + t(0.6), y: cc.y + t(4.6), w: t(2), h: t(1.4), style: "mudpatch", detail: true },
  { id: "tc-earth-b", x: cc.x - t(5), y: cc.y + t(3.2), w: t(1.6), h: t(1.2), style: "mudpatch", detail: true },
  { id: "tc-stone-a", x: cc.x + t(1.2), y: cc.y - t(3.4), w: t(0.9), h: t(0.7), style: "stone", detail: true },
  { id: "tc-stone-b", x: cc.x - t(3.6), y: cc.y - t(0.2), w: t(0.8), h: t(0.6), style: "stone", detail: true },
  { id: "tc-stone-c", x: cc.x + t(6.6), y: cc.y + t(3.8), w: t(0.9), h: t(0.7), style: "stone", detail: true },
  { id: "tc-leaves-a", x: cc.x - t(6.6), y: cc.y - t(0.6), w: t(1.4), h: t(1), style: "feathers", detail: true },
  { id: "tc-leaves-b", x: cc.x + t(4.4), y: cc.y - t(0.8), w: t(1.4), h: t(1), style: "feathers", detail: true },
  { id: "tc-twig-a", x: cc.x + t(2.8), y: cc.y + t(0.8), w: t(1), h: t(0.6), style: "log", detail: true },
  // Book beats from Into the Wild:
  // a tree stump near the apprentices' den where they practice and gossip
  { id: "tc-stump-app", x: cc.x + t(7), y: cc.y + t(5), w: t(1.6), h: t(1.3), label: "Training stump", style: "stump" },
  // a fern tunnel screening the medicine den's crack in the rock
  { id: "tc-fern-tunnel", x: cc.x + t(7), y: cc.y - t(5.4), w: t(1.8), h: t(1.2), label: "Fern tunnel", style: "bush", detail: true },
  { id: "tc-fern-tunnel-2", x: cc.x + t(8.6), y: cc.y - t(4.6), w: t(1.4), h: t(1), style: "bush", detail: true },
  // worn sandy trails from the gorse tunnel to the clearing (sandy ravine floor)
  { id: "tc-sand-a", x: cc.x - t(0.4), y: cc.y + t(8.6), w: t(1.8), h: t(1.2), style: "mudpatch", detail: true },
  { id: "tc-sand-b", x: cc.x - t(0.8), y: cc.y + t(5.8), w: t(1.6), h: t(1.1), style: "mudpatch", detail: true },
  { id: "tc-sand-c", x: cc.x - t(1), y: cc.y + t(2.6), w: t(1.4), h: t(1), style: "mudpatch", detail: true },
  // bramble clumps hugging the inside of the camp wall (enclosed ravine feel)
  { id: "tc-wall-bramble-a", x: cc.x - t(8.6), y: cc.y + t(2.4), w: t(1.6), h: t(1.2), style: "bramble", detail: true },
  { id: "tc-wall-bramble-b", x: cc.x + t(7.8), y: cc.y - t(6.8), w: t(1.6), h: t(1.2), style: "bramble", detail: true },
  { id: "tc-wall-bramble-c", x: cc.x - t(7.8), y: cc.y - t(6.2), w: t(1.4), h: t(1.1), style: "bramble", detail: true },
  { id: "tc-twig-b", x: cc.x - t(1), y: cc.y + t(8.6), w: t(0.9), h: t(0.5), style: "log", detail: true },
];

const tcLandmarks: WorldObject[] = [
  {
    id: "sandy-hollow", x: t(31) + TC_OX, y: t(62) + TC_OY, w: t(3), h: t(2.6),
    label: "Sandy Hollow", interact: "training-hollow", style: "stump",
  },
  // Fourtrees — the four great oaks from Into the Wild, one per corner of
  // the clearing (each a distinct oak: trunks, layered canopies, variation)
  {
    id: "fourtrees", x: t(17.6) + TC_OX, y: t(66.4) + TC_OY, w: t(2.6), h: t(2),
    label: "Fourtrees — the Great Oak (north)", interact: "fourtrees", style: "tree", scale: 1.8, solid: true,
  },
  {
    id: "fourtrees-2", x: t(21.2) + TC_OX, y: t(66.6) + TC_OY, w: t(2.4), h: t(1.9),
    label: "Fourtrees — the Twin Oak (east)", style: "tree", scale: 1.55, solid: true,
  },
  {
    id: "fourtrees-3", x: t(17.4) + TC_OX, y: t(70.2) + TC_OY, w: t(2.5), h: t(1.95),
    label: "Fourtrees — the Broad Oak (west)", style: "tree", scale: 1.65, solid: true,
  },
  {
    id: "fourtrees-4", x: t(21) + TC_OX, y: t(70) + TC_OY, w: t(2.3), h: t(1.8),
    label: "Fourtrees — the Young Oak (south)", style: "tree", scale: 1.4, solid: true,
  },
  {
    id: "great-rock", x: t(17) + TC_OX, y: t(66) + TC_OY, w: t(3), h: t(2.4),
    label: "Great Rock", style: "rock", solid: true, scale: 1.4,
  },
  {
    id: "owl-tree", x: t(56) + TC_OX, y: t(43) + TC_OY, w: t(4), h: t(3),
    label: "Owl Tree", interact: "owltree", style: "tree", scale: 2, solid: true,
  },
  {
    id: "snakerocks", x: t(66) + TC_OX, y: t(18) + TC_OY, w: t(4), h: t(2.8),
    label: "Snakerocks", interact: "snakerocks", style: "rock", scale: 1.6, solid: true,
  },
  {
    id: "sycamore", x: t(20) + TC_OX, y: t(40) + TC_OY, w: t(4), h: t(3),
    label: "Great Sycamore", interact: "sycamore", style: "tree", scale: 2, solid: true,
  },
  {
    id: "sunningrocks", x: t(7) + TC_OX, y: t(40) + TC_OY, w: t(4), h: t(2.6),
    label: "Sunningrocks", interact: "sunningrocks", style: "rock", scale: 1.6, solid: true,
  },
  {
    id: "tallpines", x: t(27) + TC_OX, y: t(72) + TC_OY, w: t(3.4), h: t(2.6),
    label: "Tallpines", interact: "tallpines", style: "stump", scale: 1.3,
  },
  {
    id: "thunderpath", x: t(42) + TC_OX, y: t(4) + TC_OY, w: t(4), h: t(2),
    label: "Thunderpath", interact: "thunderpath", style: "stone", scale: 1.2,
  },
  {
    id: "river", x: t(6) + TC_OX, y: t(50) + TC_OY, w: t(3), h: t(2),
    label: "The river", interact: "river", style: "stone", scale: 1.2,
  },
];

// ---------------------------------------------------------------------------
// Other Clan camps + shared landmarks (absolute coords)
// ---------------------------------------------------------------------------

const wc = { x: t(20), y: t(84) }; // WindClan camp
const rc = { x: t(170), y: t(96) }; // RiverClan camp
const sc = { x: t(96), y: t(20) }; // ShadowClan camp

// Distinct environmental dressing per Clan camp (book-faithful):
const otherClanObjects: WorldObject[] = [
  // --- WindClan: wind-swept open camp — gorse shelter, heather, rocks ---
  { id: "wc-gorse-shelter", x: wc.x - t(3), y: wc.y - t(3.4), w: t(3.2), h: t(2.4), label: "Gorse bush shelter", style: "bramble", interior: "wc-warriors-den", solid: true },
  { id: "wc-heather-1", x: wc.x + t(2.6), y: wc.y - t(3), w: t(1.6), h: t(1.2), label: "Heather patch", style: "flowerbed" },
  { id: "wc-heather-2", x: wc.x - t(6), y: wc.y + t(1), w: t(1.6), h: t(1.2), label: "Heather patch", style: "flowerbed" },
  { id: "wc-boulder-1", x: wc.x + t(3.4), y: wc.y + t(3.2), w: t(2.2), h: t(1.8), label: "Moork boulder", style: "rock", solid: true },
  { id: "wc-boulder-2", x: wc.x - t(2.2), y: wc.y + t(3.8), w: t(1.8), h: t(1.5), label: "Moork boulder", style: "rock", solid: true },
  { id: "wc-apprentices", x: wc.x + t(1.6), y: wc.y + t(1), w: t(2.6), h: t(2), label: "WindClan apprentices' den", interact: "apprentices-den", style: "bramble", solid: true },
  // --- RiverClan: watery environment — streams, reeds, wet rocks ---
  { id: "rc-stream", x: rc.x - t(1), y: rc.y + t(5.8), w: t(9), h: t(1.6), label: "Camp stream", style: "reeds" },
  { id: "rc-reeds-2", x: rc.x + t(5.4), y: rc.y - t(1.6), w: t(1.8), h: t(2.4), label: "Reed bed", style: "reeds", solid: true },
  { id: "rc-reeds-3", x: rc.x - t(3.4), y: rc.y - t(5), w: t(1.8), h: t(2), label: "Reed bed", style: "reeds" },
  { id: "rc-wet-rock", x: rc.x + t(2.2), y: rc.y + t(3.4), w: t(2), h: t(1.6), label: "Wet boulder", style: "rock", solid: true },
  { id: "rc-apprentices", x: rc.x - t(2.2), y: rc.y - t(2.2), w: t(2.6), h: t(2), label: "RiverClan apprentices' den", interact: "apprentices-den", style: "bush", solid: true },
  { id: "rc-stones", x: rc.x + t(4.4), y: rc.y - t(3.4), w: t(1.6), h: t(1.2), label: "Smooth stones", style: "stone" },
  // --- ShadowClan: dark pines — mud, boulders, brambles, marsh pool ---
  { id: "sc-bramble-1", x: sc.x - t(3.4), y: sc.y - t(3), w: t(2.8), h: t(2.2), label: "Tangled bramble", style: "bramble", interior: "sc-warriors-den", solid: true },
  { id: "sc-bramble-2", x: sc.x + t(3), y: sc.y - t(2.6), w: t(2.4), h: t(2), label: "Tangled bramble", style: "bramble", solid: true },
  { id: "sc-boulder", x: sc.x + t(1.6), y: sc.y + t(1.2), w: t(2.2), h: t(1.8), label: "Mossy boulder", style: "rock", solid: true },
  { id: "sc-mud-pool", x: sc.x - t(1.4), y: sc.y + t(3.8), w: t(2.6), h: t(1.8), label: "Muddy pool", style: "reeds" },
  { id: "sc-pine-stump", x: sc.x - t(5.6), y: sc.y + t(2.2), w: t(1.8), h: t(1.4), label: "Old pine stump", style: "stump" },
  { id: "sc-apprentices", x: sc.x - t(1.2), y: sc.y - t(1.4), w: t(2.6), h: t(2), label: "ShadowClan apprentices' den", interact: "apprentices-den", style: "bramble", solid: true },
  // WindClan — a shallow scoop ringed by gorse
  { id: "wc-rock", x: wc.x, y: wc.y - t(5), w: t(4), h: t(3), label: "WindClan meeting rock", interact: "windclan-camp", style: "rock", solid: true, scale: 1.4 },
  { id: "wc-nursery", x: wc.x - t(5.4), y: wc.y + t(2.6), w: t(3.4), h: t(2.6), label: "WindClan nursery", interact: "nursery", style: "bramble", interior: "wc-nursery-room", solid: true },
  { id: "wc-elders", x: wc.x + t(5.2), y: wc.y - t(0.4), w: t(3.6), h: t(2.2), label: "WindClan elders' den", interact: "elders-den", style: "log", interior: "wc-elders-room", solid: true },
  { id: "wc-freshkill", x: wc.x - t(1), y: wc.y + t(1.4), w: t(1.8), h: t(1.4), label: "Fresh-kill pile", interact: "fresh-kill", style: "fresh-kill" },
  { id: "wc-entrance", x: wc.x, y: wc.y + t(6.4), w: t(2.2), h: t(1.8), label: "Gorse tunnel", style: "bramble" },
  // RiverClan — a gravel hollow behind reed beds
  { id: "rc-rock", x: rc.x, y: rc.y - t(5.2), w: t(4), h: t(3), label: "RiverClan meeting rock", interact: "riverclan-camp", style: "rock", solid: true, scale: 1.4 },
  { id: "rc-nursery", x: rc.x - t(5.4), y: rc.y + t(2.4), w: t(3.4), h: t(2.6), label: "RiverClan nursery", interact: "nursery", style: "bramble", interior: "rc-nursery-room", solid: true },
  { id: "rc-elders", x: rc.x + t(5.2), y: rc.y - t(0.4), w: t(3.6), h: t(2.2), label: "RiverClan elders' den", interact: "elders-den", style: "log", interior: "rc-elders-room", solid: true },
  { id: "rc-freshkill", x: rc.x - t(1), y: rc.y + t(1.4), w: t(1.8), h: t(1.4), label: "Fresh-kill pile", interact: "fresh-kill", style: "fresh-kill" },
  { id: "rc-reeds", x: rc.x - t(7.4), y: rc.y - t(2.4), w: t(2), h: t(3), label: "Reed bed", style: "reeds", interior: "rc-warriors-den", solid: true },
  { id: "rc-fishing", x: rc.x + t(8), y: rc.y + t(4), w: t(2.4), h: t(1.8), label: "Fishing spot", interact: "river", style: "stone" },
  // ShadowClan — pine hollow with boulders
  { id: "sc-rock", x: sc.x, y: sc.y - t(5), w: t(4), h: t(3), label: "ShadowClan meeting rock", interact: "shadowclan-camp", style: "rock", solid: true, scale: 1.4 },
  { id: "sc-nursery", x: sc.x - t(5.4), y: sc.y + t(2.6), w: t(3.4), h: t(2.6), label: "ShadowClan nursery", interact: "nursery", style: "bramble", interior: "sc-nursery-room", solid: true },
  { id: "sc-elders", x: sc.x + t(5.2), y: sc.y - t(0.4), w: t(3.6), h: t(2.2), label: "ShadowClan elders' den", interact: "elders-den", style: "log", interior: "sc-elders-room", solid: true },
  { id: "sc-freshkill", x: sc.x - t(1), y: sc.y + t(1.4), w: t(1.8), h: t(1.4), label: "Fresh-kill pile", interact: "fresh-kill", style: "fresh-kill" },
  { id: "sc-reeds", x: sc.x + t(7), y: sc.y + t(3.4), w: t(2.4), h: t(2), label: "Marsh pool", style: "reeds" },
  // Shared: Highstones / Moonstone
  {
    id: "moonstone", x: t(26), y: t(42), w: t(3), h: t(2.4),
    label: "Mothermouth — the Moonstone", interact: "moonstone", interior: "moonstone-cave",
    style: "cave", solid: true, scale: 1.4,
  },
  // ------------------------------------------------------------------
  // Twolegplace — a real residential neighborhood (Smudge's street).
  // Grid: backyards north of the main street, houses south of it.
  // ------------------------------------------------------------------

  // Rusty/Smudge's street of Twoleg nests (north row of the main street)
  {
    id: "rusty-house", x: t(78), y: t(140), w: t(5), h: t(3.6),
    label: "Rusty's Twoleg nest", interact: "twolegplace", interior: "rusty-house",
    style: "house", solid: true, scale: 1.2, doorAt: { dx: 0, dy: 0 }},
  { id: "house-2", x: t(63.6), y: t(138), w: t(3.8), h: t(3.2), label: "Twoleg nest", interior: "house-a", style: "house", solid: true, scale: 1.1, doorAt: { dx: 0, dy: 0 }},
  { id: "house-3", x: t(92.4), y: t(138), w: t(3.8), h: t(3.2), label: "Twoleg nest", interior: "house-c", style: "house", solid: true, scale: 0.95, doorAt: { dx: 0, dy: 0 }},
  { id: "house-4", x: t(70), y: t(134), w: t(4), h: t(3), label: "Twoleg nest", interior: "house-b", style: "house", solid: true, scale: 1, doorAt: { dx: 0, dy: 0 }},
  { id: "house-5", x: t(85), y: t(134), w: t(4), h: t(3), label: "Twoleg nest", interior: "house-e", style: "house", solid: true, scale: 1.05, doorAt: { dx: 0, dy: 0 }},
  // Southern street row (across the main street)
  { id: "house-6", x: t(58), y: t(158), w: t(4.4), h: t(3.2), label: "Twoleg nest", interior: "house-a", style: "house", solid: true, scale: 1, doorAt: { dx: 0, dy: 0 }},
  { id: "house-7", x: t(70), y: t(160), w: t(4), h: t(3), label: "Twoleg nest", interior: "house-d", style: "house", solid: true, scale: 1.1, doorAt: { dx: 0, dy: 0 }},
  { id: "house-8", x: t(84), y: t(158), w: t(4.4), h: t(3.2), label: "Twoleg nest", interior: "house-b", style: "house", solid: true, scale: 0.9, doorAt: { dx: 0, dy: 0 }},
  { id: "house-9", x: t(96), y: t(160), w: t(4.4), h: t(3.2), label: "Twoleg nest", interior: "house-e", style: "house", solid: true, scale: 1.05, doorAt: { dx: 0, dy: 0 }},
  // Porches — front doors of a few nests (rendered as small wooden slabs)
  { id: "porch-1", x: t(78), y: t(142.4), w: t(1.6), h: t(1), label: "Rusty's porch", style: "log" },
  { id: "porch-2", x: t(92), y: t(140.2), w: t(1.6), h: t(1), label: "Nest porch", style: "log" },
  { id: "porch-3", x: t(58), y: t(160.2), w: t(1.6), h: t(1), label: "Nest porch", style: "log" },
  { id: "porch-4", x: t(84), y: t(160.2), w: t(1.6), h: t(1), label: "Nest porch", style: "log" },
  // Yards: flowerbeds, gardens, hedges, trees
  { id: "garden-bed-1", x: t(70), y: t(144), w: t(2), h: t(1.6), label: "Flowerbed", style: "flowerbed" },
  { id: "garden-bed-2", x: t(88), y: t(144), w: t(2), h: t(1.6), label: "Flowerbed", style: "flowerbed" },
  { id: "garden-bed-3", x: t(58), y: t(156), w: t(2), h: t(1.6), label: "Vegetable garden", style: "flowerbed" },
  { id: "garden-bed-4", x: t(96), y: t(156), w: t(2), h: t(1.6), label: "Rose garden", style: "flowerbed" },
  { id: "hedge-1", x: t(66), y: t(146), w: t(2.6), h: t(1.4), label: "Hedge", style: "bush", solid: true },
  { id: "hedge-2", x: t(90), y: t(146), w: t(2.6), h: t(1.4), label: "Hedge", style: "bush", solid: true },
  { id: "hedge-3", x: t(76), y: t(156), w: t(2.6), h: t(1.4), label: "Hedge", style: "bush", solid: true },
  { id: "yard-tree-1", x: t(62), y: t(146), w: t(2.4), h: t(2), label: "Garden tree", style: "tree", solid: true },
  { id: "yard-tree-2", x: t(93), y: t(146), w: t(2.4), h: t(2), label: "Garden tree", style: "tree", solid: true },
  { id: "yard-tree-3", x: t(73), y: t(160), w: t(2.4), h: t(2), label: "Garden tree", style: "tree", solid: true },
  { id: "yard-bush-1", x: t(80), y: t(146), w: t(2), h: t(1.6), label: "Garden bush", style: "bush", solid: true },
  { id: "yard-bush-2", x: t(64), y: t(162), w: t(2), h: t(1.6), label: "Garden bush", style: "bush", solid: true },
  { id: "yard-bush-3", x: t(92), y: t(162), w: t(2), h: t(1.6), label: "Garden bush", style: "bush", solid: true },
  // Fences + gates: Rusty's yard (between his nest and the forest),
  // neighbors' yards, and gaps as gates along the main street.
  { id: "fence-rusty-n", x: t(75.4), y: t(136.4), w: t(6.2), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-rusty-w", x: t(75.2), y: t(136.4), w: t(0.8), h: t(7), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-rusty-e", x: t(81.4), y: t(136.4), w: t(0.8), h: t(7), label: "Garden fence", style: "fence", solid: true },
  { id: "gate-rusty", x: t(78), y: t(143.2), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },
  { id: "fence-2-n", x: t(66.95), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-2-e", x: t(61.6), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },
  { id: "gate-2", x: t(64), y: t(141.6), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },
  { id: "fence-3-n", x: t(94.95), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-3-w", x: t(89.6), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },
  { id: "gate-3", x: t(92), y: t(141.6), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },
  { id: "fence-s-1", x: t(56), y: t(156), w: t(8), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-s-2", x: t(66), y: t(156), w: t(8), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-s-3", x: t(80), y: t(156), w: t(8), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "fence-s-4", x: t(94), y: t(156), w: t(8), h: t(0.8), label: "Garden fence", style: "fence", solid: true },
  { id: "gate-s-1", x: t(70), y: t(155.2), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },
  { id: "gate-s-2", x: t(84), y: t(155.2), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },
  // Neighborhood extras: a shared water bowl and a sunning wall
  { id: "water-bowl", x: t(79.6), y: t(144), w: t(1), h: t(0.8), label: "Water bowl", style: "stone" },
  { id: "sunning-wall", x: t(74), y: t(151), w: t(6), h: t(0.9), label: "Low garden wall", style: "stone", solid: true },

  // ---- EVERY Twoleg nest is enterable (walk up to a door and press E) ----
  // Front doors sit just south of each house, clear of the solid footprint.
  // The five kittypet doors were previously unreachable (embedded inside
  // another house's collision) — relocated to their own doorsteps.
  // Rusty's own front door (the nest itself was already enterable)
  // Kittypet doorstep doors — relocated OUT of neighboring collision so the
  // doorway is actually reachable from the street.
  // Front paths so each doorway reads as an entrance, not a random door
  { id: "path-2", x: t(64), y: t(141.6), w: t(1.2), h: t(2.2), style: "mudpatch", detail: true },
  { id: "path-3", x: t(92), y: t(141.6), w: t(1.2), h: t(2.2), style: "mudpatch", detail: true },
  { id: "path-4", x: t(70), y: t(137.5), w: t(1.2), h: t(2), style: "mudpatch", detail: true },
  { id: "path-5", x: t(85), y: t(137.5), w: t(1.2), h: t(2), style: "mudpatch", detail: true },
  { id: "path-6", x: t(58), y: t(161.7), w: t(1.2), h: t(2.2), style: "mudpatch", detail: true },
  { id: "path-7", x: t(70), y: t(163.6), w: t(1.2), h: t(2), style: "mudpatch", detail: true },
  { id: "path-8", x: t(84), y: t(161.7), w: t(1.2), h: t(2.2), style: "mudpatch", detail: true },
  { id: "path-9", x: t(96), y: t(163.6), w: t(1.2), h: t(2), style: "mudpatch", detail: true },
  { id: "path-smudge", x: t(74.5), y: t(144.1), w: t(1), h: t(1.6), style: "mudpatch", detail: true },
  { id: "path-henry", x: t(61.2), y: t(144.1), w: t(1), h: t(1.6), style: "mudpatch", detail: true },
  { id: "path-marmalade", x: t(94.6), y: t(144.1), w: t(1), h: t(1.6), style: "mudpatch", detail: true },
  { id: "path-ginger", x: t(83.5), y: t(162.4), w: t(1), h: t(1.6), style: "mudpatch", detail: true },
  // Street life: benches and a trash can by the paths (never in a doorway)
  { id: "bench-1", x: t(72), y: t(143.5), w: t(1.4), h: t(0.8), label: "Garden bench", style: "plank" },
  { id: "bench-2", x: t(86), y: t(162.5), w: t(1.4), h: t(0.8), label: "Garden bench", style: "plank" },
  { id: "trashcan-1", x: t(59.8), y: t(161.9), w: t(0.9), h: t(0.9), label: "Trash can", style: "stone", detail: true },
  // Yard clutter so the neighborhood feels lived-in
  { id: "tp-leaves-1", x: t(67), y: t(148.5), w: t(1.4), h: t(1), style: "feathers", detail: true },
  { id: "tp-leaves-2", x: t(88), y: t(150.5), w: t(1.4), h: t(1), style: "feathers", detail: true },
  { id: "tp-stones-1", x: t(77), y: t(149.5), w: t(1.2), h: t(0.9), style: "stone", detail: true },
  { id: "tp-stones-2", x: t(97), y: t(149.8), w: t(1.1), h: t(0.8), style: "stone", detail: true },
  { id: "tp-log-1", x: t(63), y: t(163), w: t(2), h: t(0.9), style: "log", detail: true },

  // ---- kittypet houses: standalone enterable buildings with their own
  //      black doorways (walk up to the gap to step inside) ----
  {
    id: "smudge-house", x: t(73.6), y: t(142.2), w: t(2.2), h: t(1.7),
    label: "Smudge's cozy home", interact: "twolegplace", interior: "smudge-house",
    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },
  },
  {
    id: "henry-house", x: t(59.8), y: t(142.2), w: t(2.2), h: t(1.7),
    label: "Henry's house", interact: "twolegplace", interior: "henry-house",
    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },
  },
  {
    id: "princess-house", x: t(69.5), y: t(136.5), w: t(2.2), h: t(1.7),
    label: "Princess's sunny house", interact: "twolegplace", interior: "princess-house",
    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },
  },
  {
    id: "marmalade-house", x: t(94.6), y: t(142.2), w: t(2.2), h: t(1.7),
    label: "Marmalade's house", interact: "twolegplace", interior: "marmalade-house",
    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },
  },
  {
    id: "ginger-house", x: t(83.5), y: t(160.9), w: t(2.2), h: t(1.7),
    label: "Ginger's house", interact: "twolegplace", interior: "ginger-house",
    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },
  },
  // Farm
  {
    id: "barn", x: t(124), y: t(156), w: t(6), h: t(4),
    label: "The farm barn", interact: "farm", interior: "barn",
    style: "barn", solid: true, scale: 1.2, doorAt: { dx: 0, dy: 0 }},
  { id: "fence-farm-1", x: t(112), y: t(148), w: t(14), h: t(0.8), label: "Farm fence", style: "fence" },
  { id: "fence-farm-2", x: t(132), y: t(164), w: t(12), h: t(0.8), label: "Farm fence", style: "fence" },
  // Border markers for patrols
  { id: "bm-tc-west", x: t(50) + 8, y: t(76), w: t(1), h: t(1), label: "Border marker — the river", interact: "border-marker", style: "stone" },
  { id: "bm-tc-north", x: t(88), y: t(47), w: t(1), h: t(1), label: "Border marker — Thunderpath", interact: "border-marker", style: "stone" },
  { id: "bm-tc-east", x: t(140), y: t(76), w: t(1), h: t(1), label: "Border marker — east river", interact: "border-marker", style: "stone" },
  { id: "bm-tc-south", x: t(90), y: t(126), w: t(1), h: t(1), label: "Border marker — Tallpines edge", interact: "border-marker", style: "stone" },
  // Stepping stones (visual, matching collision gaps)
  { id: "stones-west-1", x: t(49), y: t(57), w: t(1.2), h: t(1), label: "Stepping stones", style: "stone" },
  { id: "stones-west-2", x: t(49), y: t(100), w: t(1.2), h: t(1), label: "Stepping stones", style: "stone" },
  { id: "stones-east-1", x: t(147), y: t(90), w: t(1.2), h: t(1), label: "Stepping stones", style: "stone" },
  { id: "stones-east-2", x: t(147), y: t(130), w: t(1.2), h: t(1), label: "Stepping stones", style: "stone" },
  // Herb nodes (pickable in open world)
  { id: "herbs-tc-1", x: cc.x + t(10.4), y: cc.y - t(6.4), w: t(1.2), h: t(1), label: "Marigold", interact: "herbs", style: "herbs" },
  { id: "herbs-tc-2", x: t(33) + TC_OX, y: t(57) + TC_OY, w: t(1.2), h: t(1), label: "Catmint", interact: "herbs", style: "herbs" },
  { id: "herbs-rc-1", x: rc.x + t(7), y: rc.y - t(3), w: t(1.2), h: t(1), label: "Watermint", interact: "herbs", style: "herbs" },
  { id: "herbs-wc-1", x: wc.x - t(8), y: wc.y - t(4), w: t(1.2), h: t(1), label: "Chamomile", interact: "herbs", style: "herbs" },

  // ---- territory-flavored detail scatter (Into the Wild ecosystems) ----
  // RiverClan: river rocks, wet stones, driftwood, reeds, mud
  { id: "rc-detail-driftwood", x: rc.x - t(6.4), y: rc.y + t(3), w: t(2.4), h: t(1), style: "driftwood", detail: true },
  { id: "rc-detail-stones", x: rc.x + t(6.6), y: rc.y + t(1.6), w: t(1.4), h: t(1), style: "stone", detail: true },
  { id: "rc-detail-stones2", x: rc.x - t(4.4), y: rc.y - t(3.6), w: t(1.2), h: t(0.9), style: "stone", detail: true },
  { id: "rc-detail-mud", x: rc.x + t(3.2), y: rc.y - t(4.2), w: t(2), h: t(1.4), style: "mudpatch", detail: true },
  { id: "rc-detail-reeds", x: rc.x + t(7), y: rc.y + t(3.6), w: t(1.6), h: t(1.2), style: "reeds", detail: true },
  // WindClan: exposed stones, wind-swept grass, rabbit burrows
  { id: "wc-detail-burrow", x: wc.x + t(6), y: wc.y - t(4.4), w: t(1.6), h: t(1.2), style: "burrow", detail: true },
  { id: "wc-detail-burrow2", x: wc.x - t(7), y: wc.y + t(3.6), w: t(1.4), h: t(1), style: "burrow", detail: true },
  { id: "wc-detail-stones", x: wc.x - t(2.6), y: wc.y - t(5), w: t(1.3), h: t(0.9), style: "stone", detail: true },
  { id: "wc-detail-grass", x: wc.x + t(4.4), y: wc.y + t(0.6), w: t(1.5), h: t(1), style: "mossball", detail: true },
  // ShadowClan: mud, wet roots, puddles, fallen branches, thick brambles
  { id: "sc-detail-mud", x: sc.x + t(4.6), y: sc.y - t(3.6), w: t(2), h: t(1.4), style: "mudpatch", detail: true },
  { id: "sc-detail-puddle", x: sc.x - t(4.2), y: sc.y - t(2.6), w: t(1.8), h: t(1.2), style: "puddle", detail: true },
  { id: "sc-detail-roots", x: sc.x + t(2.4), y: sc.y + t(4.4), w: t(1.8), h: t(1), style: "vines", detail: true },
  { id: "sc-detail-branch", x: sc.x - t(6.4), y: sc.y + t(0.8), w: t(2.2), h: t(0.9), style: "log", detail: true },
  // Sunningrocks: basking stones + puddles
  { id: "sr-detail-stone", x: t(7) + TC_OX, y: t(42) + TC_OY, w: t(1.2), h: t(0.9), style: "stone", detail: true },
  { id: "sr-detail-puddle", x: t(9) + TC_OX, y: t(44) + TC_OY, w: t(1.4), h: t(1), style: "puddle", detail: true },
  // Fourtrees: fern clusters + fallen leaves under the great oaks
  { id: "ft-detail-fern", x: t(21) + TC_OX, y: t(69.4) + TC_OY, w: t(1.4), h: t(1), style: "bush", detail: true },
  { id: "ft-detail-leaves", x: t(17.4) + TC_OX, y: t(67) + TC_OY, w: t(1.4), h: t(1), style: "feathers", detail: true },
  // Farm: hay bales + mud
  { id: "farm-haybale", x: t(120), y: t(152), w: t(1.8), h: t(1.4), style: "haybale", detail: true },
  { id: "farm-haybale-2", x: t(130), y: t(160), w: t(1.6), h: t(1.2), style: "haybale", detail: true },
  { id: "farm-mud", x: t(126), y: t(148), w: t(2), h: t(1.4), style: "mudpatch", detail: true },
  // Sandy Hollow: training stones
  { id: "sh-detail-stone", x: t(31) + TC_OX, y: t(64) + TC_OY, w: t(1), h: t(0.8), style: "stone", detail: true },
  { id: "sh-detail-stone2", x: t(33) + TC_OX, y: t(62) + TC_OY, w: t(0.9), h: t(0.7), style: "stone", detail: true },
  // ---- kittypet houses (enterable, each with a unique interior) ----
];

export const allObjects: WorldObject[] = [...tcCampObjects, ...tcLandmarks, ...otherClanObjects];

/** Objects only present in Story Mode (e.g. Yellowfang ambush marker). */
export const storyObjects: WorldObject[] = [];

// ---------------------------------------------------------------------------
// Deterministic scatter
// ---------------------------------------------------------------------------

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface Tree {
  x: number; y: number; r: number; pine: boolean; tint: number; border?: boolean;
}

export const trees: Tree[] = [];
export const flora: {
  x: number;
  y: number;
  kind: "fern" | "tuft" | "flower" | "mushroom" | "leaves" | "roots" | "log" | "stones";
  tint: number;
  s: number;
}[] = [];
export const campWall: { x: number; y: number; r: number; tint: number }[] = [];

const rand = lcg(20260926);

function inAnyRect(x: number, y: number, rects: Rect[]) {
  return rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

function seedScatter() {
  const avoid: Rect[] = [...clearZones, ...trailRects];
  const waterAndRoad = (x: number, y: number) =>
    inAnyRect(x, y, groundRegions.filter((g) => g.kind === "water" || g.kind === "paved" || g.kind === "stone").map((g) => g.rect));

  // Border forest ring
  for (let gy = 2; gy < MAP_H - 2; gy += 2) {
    for (const gx of [0.6, 2.4]) {
      trees.push({ x: t(gx) + rand() * 24, y: t(gy) + rand() * 44, r: 26, pine: true, tint: rand(), border: true });
    }
    for (const gx of [MAP_W - 0.6, MAP_W - 2.4]) {
      trees.push({ x: t(gx) - rand() * 24, y: t(gy) + rand() * 44, r: 26, pine: true, tint: rand(), border: true });
    }
  }
  for (let gx = 2; gx < MAP_W - 2; gx += 2) {
    for (const gy of [0.6, 2.4]) {
      trees.push({ x: t(gx) + rand() * 44, y: t(gy) + rand() * 24, r: 26, pine: true, tint: rand(), border: true });
    }
    for (const gy of [MAP_H - 0.6, MAP_H - 2.4]) {
      trees.push({ x: t(gx) + rand() * 44, y: t(gy) - rand() * 24, r: 26, pine: true, tint: rand(), border: true });
    }
  }

  // ThunderClan forest — dense broadleaf
  let count = 0, attempts = 0;
  while (count < 220 && attempts < 8000) {
    attempts++;
    const x = t(48) + rand() * t(96);
    const y = t(46) + rand() * t(100);
    if (inAnyRect(x, y, avoid)) continue;
    if (waterAndRoad(x, y)) continue;
    const pineZone = y > t(66) + TC_OY;
    trees.push({ x, y, r: 24 + rand() * 10, pine: pineZone || rand() < 0.15, tint: rand() });
    count++;
  }
  // ShadowClan pines + marsh scrub
  count = 0; attempts = 0;
  while (count < 200 && attempts < 8000) {
    attempts++;
    const x = t(46) + rand() * t(100);
    const y = rand() * t(40);
    if (inAnyRect(x, y, avoid)) continue;
    if (waterAndRoad(x, y)) continue;
    trees.push({ x, y, r: 24 + rand() * 10, pine: true, tint: rand() });
    count++;
  }
  // WindClan — sparse wind-stunted trees only near the river
  count = 0; attempts = 0;
  while (count < 40 && attempts < 4000) {
    attempts++;
    const x = rand() * t(48);
    const y = t(40) + rand() * (WORLD_H - t(40));
    if (inAnyRect(x, y, avoid)) continue;
    if (waterAndRoad(x, y)) continue;
    trees.push({ x, y, r: 20 + rand() * 8, pine: false, tint: rand() });
    count++;
  }
  // RiverClan — soft willow-ish clusters
  count = 0; attempts = 0;
  while (count < 90 && attempts < 5000) {
    attempts++;
    const x = t(152) + rand() * t(40);
    const y = t(40) + rand() * (WORLD_H - t(40));
    if (inAnyRect(x, y, avoid)) continue;
    if (waterAndRoad(x, y)) continue;
    trees.push({ x, y, r: 22 + rand() * 9, pine: false, tint: rand() });
    count++;
  }

  // Flora everywhere — forest floor ecosystem: ferns, tufts, flowers,
  // mushrooms, leaf litter, root flares, fallen logs, stone clusters.
  attempts = 0; count = 0;
  while (count < 1250 && attempts < 20000) {
    attempts++;
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    if (waterAndRoad(x, y)) continue;
    if (inAnyRect(x, y, trailRects)) continue;
    if (Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < CAMP_RADIUS + 20) continue;
    const r = rand();
    const kind = r < 0.1 ? "flower" : r < 0.34 ? "fern" : r < 0.58 ? "tuft"
      : r < 0.68 ? "leaves" : r < 0.76 ? "mushroom" : r < 0.85 ? "stones"
      : r < 0.93 ? "roots" : "log";
    flora.push({ x, y, kind, tint: rand(), s: 0.7 + rand() * 0.7 });
    count++;
  }

  // ThunderClan camp wall brambles (gap at south entrance)
  const steps = 46;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (deg > 62 && deg < 118) continue;
    campWall.push({
      x: CAMP_CENTER.x + Math.cos(a) * CAMP_RADIUS,
      y: CAMP_CENTER.y + Math.sin(a) * CAMP_RADIUS,
      r: 30 + rand() * 12,
      tint: rand(),
    });
  }
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

export const solid: Uint8Array = new Uint8Array(MAP_W * MAP_H);

export function isSolidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return solid[ty * MAP_W + tx] === 1;
}

export function isSolidPoint(x: number, y: number): boolean {
  return isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE));
}

function blockRect(r: Rect) {
  const x0 = Math.max(0, Math.floor(r.x / TILE));
  const y0 = Math.max(0, Math.floor(r.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.floor((r.x + r.w) / TILE));
  const y1 = Math.min(MAP_H - 1, Math.floor((r.y + r.h) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) solid[y * MAP_W + x] = 1;
  }
}

function unblockRect(r: Rect) {
  const x0 = Math.max(0, Math.floor(r.x / TILE));
  const y0 = Math.max(0, Math.floor(r.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.floor((r.x + r.w) / TILE));
  const y1 = Math.min(MAP_H - 1, Math.floor((r.y + r.h) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) solid[y * MAP_W + x] = 0;
  }
}

function buildCollision() {
  // West river (WindClan border)
  blockRect({ x: 0, y: t(68), w: t(4), h: WORLD_H - t(68) });
  // East river (RiverClan border)
  blockRect({ x: t(144), y: t(48), w: t(8), h: WORLD_H - t(48) });
  // Thunderpath center line is fine to walk; block nothing on it.
  // Map borders
  blockRect({ x: 0, y: 0, w: t(2), h: WORLD_H });
  blockRect({ x: 0, y: 0, w: WORLD_W, h: t(2) });
  blockRect({ x: WORLD_W - t(2), y: 0, w: t(2), h: WORLD_H });
  blockRect({ x: 0, y: WORLD_H - t(2), w: WORLD_W, h: t(2) });
  // Deep border forest walls (outside the walkable ring)
  blockRect({ x: 0, y: t(40), w: t(4), h: WORLD_H - t(40) });

  // ThunderClan camp wall ring (gap at south entrance)
  const steps = 72;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (deg > 68 && deg < 112) continue;
    const wx = CAMP_CENTER.x + Math.cos(a) * CAMP_RADIUS;
    const wy = CAMP_CENTER.y + Math.sin(a) * CAMP_RADIUS;
    blockRect({ x: wx - 20, y: wy - 20, w: 40, h: 40 });
  }

  for (const o of allObjects) {
    if (!o.solid) continue;
    blockRect({ x: o.x - o.w / 2 + 4, y: o.y - o.h / 2 + 4, w: o.w - 8, h: o.h - 8 });
  }
  for (const tr of trees) {
    blockRect({ x: tr.x - 12, y: tr.y - 10, w: 24, h: 20 });
  }

  // --- openings so every territory is reachable ---
  // Stepping stones across the west river
  unblockRect({ x: 0, y: t(56), w: t(5), h: t(2) });
  unblockRect({ x: 0, y: t(99), w: t(5), h: t(2) });
  // Stepping stones across the east river
  unblockRect({ x: t(144), y: t(89), w: t(9), h: t(2.5) });
  unblockRect({ x: t(144), y: t(129), w: t(9), h: t(2.5) });
  // ShadowClan <-> ThunderClan across the Thunderpath (trail gap)
  unblockRect({ x: t(87), y: t(42), w: t(6), h: t(6) });
  // Tallpines -> Twolegplace
  unblockRect({ x: t(88), y: t(126), w: t(5), h: t(6) });
  // Twolegplace <-> farm along the road
  unblockRect({ x: t(102), y: t(146), w: t(6), h: t(8) });
  // RiverClan camp river-bank access
  unblockRect({ x: t(152), y: t(88), w: t(4), h: t(4) });
}

// ---------------------------------------------------------------------------
// Areas (discovery + minimap)
// ---------------------------------------------------------------------------

export const areas: AreaDef[] = [
  { id: "camp", name: "ThunderClan Camp", rect: { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 } },
  { id: "thunderpath", name: "The Thunderpath", rect: { x: 0, y: t(42), w: WORLD_W, h: t(4) } },
  { id: "river", name: "The River", rect: { x: 0, y: t(68), w: t(5), h: WORLD_H - t(68) } },
  { id: "east-river", name: "The River", rect: { x: t(144), y: t(48), w: t(9), h: WORLD_H - t(48) } },
  { id: "sunningrocks", name: "Sunningrocks", rect: { x: t(4) + TC_OX, y: t(34) + TC_OY, w: t(8), h: t(13) } },
  { id: "sycamore", name: "Great Sycamore", rect: { x: t(15) + TC_OX, y: t(35) + TC_OY, w: t(10), h: t(10) } },
  { id: "owltree", name: "Owl Tree", rect: { x: t(52) + TC_OX, y: t(39) + TC_OY, w: t(9), h: t(8) } },
  { id: "snakerocks", name: "Snakerocks", rect: { x: t(61) + TC_OX, y: t(13) + TC_OY, w: t(11), h: t(10) } },
  { id: "tallpines", name: "Tallpines", rect: { x: t(5) + TC_OX, y: t(64) + TC_OY, w: t(44), h: WORLD_H - (t(64) + TC_OY) } },
  { id: "sandy", name: "Sandy Hollow", rect: { x: t(25) + TC_OX, y: t(57) + TC_OY, w: t(13), h: t(11) } },
  { id: "fourtrees", name: "Fourtrees", rect: { x: t(13) + TC_OX, y: t(61) + TC_OY, w: t(12), h: t(12) } },
  { id: "windclan-camp", name: "WindClan Camp", rect: { x: t(12), y: t(76), w: t(16), h: t(16) } },
  { id: "moor", name: "The Moor", rect: { x: 0, y: t(40), w: t(48), h: WORLD_H - t(40) } },
  { id: "riverclan-camp", name: "RiverClan Camp", rect: { x: t(162), y: t(88), w: t(16), h: t(14) } },
  { id: "riverclan-territory", name: "RiverClan Territory", rect: { x: t(152), y: t(40), w: t(40), h: WORLD_H - t(40) } },
  { id: "shadowclan-camp", name: "ShadowClan Camp", rect: { x: t(88), y: t(12), w: t(16), h: t(14) } },
  { id: "shadowclan-territory", name: "ShadowClan Territory", rect: { x: t(46), y: 0, w: t(100), h: t(40) } },
  { id: "marsh", name: "The Marshes", rect: { x: t(108), y: t(6), w: t(34), h: t(30) } },
  { id: "twolegplace", name: "Twolegplace", rect: { x: t(46), y: t(128), w: t(58), h: WORLD_H - t(128) } },
  { id: "farm", name: "The Farm", rect: { x: t(104), y: t(136), w: t(40), h: t(36) } },
  { id: "highstones", name: "Highstones", rect: { x: t(18), y: t(38), w: t(16), h: t(10) } },
];

export function areaAt(x: number, y: number): AreaDef | null {
  // prefer the most specific (smallest) matching area
  let best: AreaDef | null = null;
  for (const a of areas) {
    if (x >= a.rect.x && x < a.rect.x + a.rect.w && y >= a.rect.y && y < a.rect.y + a.rect.h) {
      if (!best || a.rect.w * a.rect.h < best.rect.w * best.rect.h) best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// NPCs — Into the Wild cast + other Clan leaders (schedule slots are absolute)
// ---------------------------------------------------------------------------

export const npcs: NPCDef[] = [
  {
    id: "bluestar", name: "Bluestar", role: "Leader", clan: "thunderclan", wander: false,
    fur: "#9fb2c8", furDark: "#7c8fa8", eye: "#5b8fd6",
    home: { x: cc.x + t(1.4), y: cc.y - t(5.4) },
    schedule: [
      { h: 6, x: cc.x + t(1.4), y: cc.y - t(5.4), activity: "sitting on Tallrock's base" },
      { h: 10, x: cc.x - t(3), y: cc.y - t(2), activity: "watching the camp" },
      { h: 14, x: cc.x + t(1.4), y: cc.y - t(5.4) },
      { h: 20, x: cc.x + t(1.2), y: cc.y - t(6.2), activity: "retiring to her den" },
    ],
    lines: [
      "You have come to the right place, Rusty. I have watched you from the Twoleg gardens — you hunt like a warrior already.",
      "The Clan is small but proud. If you join us, you will train from moonhigh to dawn, and give your life to ThunderClan if you must.",
      "Fire alone can save our Clan. I have not shared that prophecy with the others — keep it between us for now.",
      "Tonight, you will be given your apprentice name before StarClan. From this moment, you will be known as Firepaw.",
    ],
  },
  {
    id: "lionheart", name: "Lionheart", role: "Warrior", clan: "thunderclan", wander: true,
    fur: "#d9a441", furDark: "#b3822c", eye: "#d98f2b",
    home: { x: cc.x + t(3), y: cc.y + t(6.8) },
    schedule: [
      { h: 7, x: cc.x - t(1), y: cc.y + t(10), activity: "leading the dawn patrol" },
      { h: 11, x: t(33) + TC_OX, y: t(60) + TC_OY, activity: "hunting in the forest" },
      { h: 16, x: cc.x + t(3), y: cc.y + t(6.8) },
      { h: 21, x: cc.x + t(4.6), y: cc.y + t(5.4), activity: "sleeping in the warriors' den" },
    ],
    lines: [
      "You'll need more than courage to survive out here, kittypet. Watch how a real warrior takes down prey.",
      "The warrior code asks more of us than any Twoleg ever could. We defend the Clan with our lives.",
      "Tigerclaw and I found ShadowClan scent past the Thunderpath this morning. Stay close to camp.",
    ],
  },
  {
    id: "tigerclaw", name: "Tigerclaw", role: "Deputy", clan: "thunderclan", wander: true,
    fur: "#6b4a2f", furDark: "#4e3421", eye: "#c98a1e",
    home: { x: cc.x + t(5), y: cc.y + t(4.4) },
    schedule: [
      { h: 6, x: cc.x - t(1), y: cc.y + t(10), activity: "organizing patrols" },
      { h: 9, x: t(64) + TC_OX, y: t(20) + TC_OY, activity: "checking Snakerocks" },
      { h: 13, x: cc.x + t(5), y: cc.y + t(4.4) },
      { h: 22, x: cc.x + t(4.6), y: cc.y + t(5.4) },
    ],
    lines: [
      "A kittypet? Bluestar must be mouse-brained to bring that into camp.",
      "If you fight like you hunt, you may last a moon. If not — the elders' den always needs fresh bedding.",
      "Stay out of my way, kit. ThunderClan has no room for half-hearted warriors.",
    ],
  },
  {
    id: "whitestorm", name: "Whitestorm", role: "Warrior", clan: "thunderclan", wander: true,
    fur: "#e8e6e0", furDark: "#c9c6bd", eye: "#d9b23a",
    home: { x: cc.x - t(4), y: cc.y + t(1) },
    schedule: [
      { h: 8, x: cc.x - t(4), y: cc.y + t(1) },
      { h: 12, x: t(8) + TC_OX, y: t(42) + TC_OY, activity: "sunning on Sunningrocks" },
      { h: 17, x: cc.x - t(4), y: cc.y + t(1) },
    ],
    lines: [
      "Do not mind Tigerclaw. He judges every cat by their first scrap.",
      "I was named for the storm that raged the night I was born. Strength and patience — both matter here.",
      "When you are ready, I will show you the borders: the river, Fourtrees, and the Thunderpath beyond.",
    ],
  },
  {
    id: "spottedleaf", name: "Spottedleaf", role: "Medicine cat", clan: "thunderclan", wander: false,
    fur: "#c98d5a", furDark: "#a56a3d", eye: "#d9973a",
    home: { x: cc.x + t(7.2), y: cc.y - t(2.2) },
    lines: [
      "Welcome, Rusty. I am Spottedleaf, medicine cat of ThunderClan. Mind the marigold — I need every leaf.",
      "A medicine cat shares tongues with StarClan every half-moon at the Moonstone. Our dreams carry their warnings.",
      "You smell of Twolegs, but your paws are steady. Perhaps StarClan has plans for you after all.",
      "If you find any cat injured on the territory, fetch me at once — cobweb stops the bleeding, poppy seed eases pain.",
    ],
  },
  {
    id: "graypaw", name: "Graypaw", role: "Apprentice", clan: "thunderclan", wander: true,
    fur: "#8f8f96", furDark: "#6f6f76", eye: "#d9c04a",
    home: { x: cc.x + t(7.4), y: cc.y + t(0.8) },
    schedule: [
      { h: 8, x: t(31) + TC_OX, y: t(62) + TC_OY, activity: "battle training at the Sandy Hollow" },
      { h: 12, x: cc.x - t(1.6), y: cc.y - t(1.2), activity: "eating from the fresh-kill pile" },
      { h: 15, x: cc.x + t(7.4), y: cc.y + t(0.8) },
      { h: 22, x: cc.x + t(8.6), y: cc.y + t(2.6), activity: "curled in the apprentices' den" },
    ],
    lines: [
      "You're the kittypet Bluestar brought back! I'm Graypaw — of ThunderClan. I've been an apprentice for two moons.",
      "Wait until you taste fresh-kill. A fat mouse from the forest beats dry pellets any day.",
      "Wanna train at the Sandy Hollow later? Dustpaw says I fight like a badger — which is a compliment... right?",
    ],
  },
  {
    id: "sandpaw", name: "Sandpaw", role: "Apprentice", clan: "thunderclan", wander: true,
    fur: "#e3c088", furDark: "#c19c5f", eye: "#7fae4e",
    home: { x: cc.x - t(4.6), y: cc.y - t(3.6) },
    schedule: [
      { h: 9, x: t(31) + TC_OX, y: t(63) + TC_OY, activity: "training at the Sandy Hollow" },
      { h: 14, x: cc.x - t(4.6), y: cc.y - t(3.6) },
      { h: 21, x: cc.x + t(8.6), y: cc.y + t(2.6) },
    ],
    lines: [
      "So you're the kittypet. You smell like Twolegs and… what is that? Pellets?",
      "Don't just stand there blinking. In ThunderClan we earn our place, paw by paw.",
      "Fine — you're not as hopeless as you look. Maybe I'll show you a hunting crouch. Maybe.",
    ],
  },
  {
    id: "dustpaw", name: "Dustpaw", role: "Apprentice", clan: "thunderclan", wander: true,
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#c98a1e",
    home: { x: cc.x + t(6.4), y: cc.y + t(3.4) },
    schedule: [
      { h: 8, x: t(31) + TC_OX, y: t(62.6) + TC_OY },
      { h: 13, x: t(56) + TC_OX, y: t(45) + TC_OY, activity: "daring cats to climb the Owl Tree" },
      { h: 22, x: cc.x + t(8.6), y: cc.y + t(2.6) },
    ],
    lines: [
      "A kittypet in camp. What's next, a badger leading patrols?",
      "Kittypets stay fat and lazy. You won't last a night patrol in leaf-bare.",
      "Tigerclaw says real warriors prove themselves in battle. Try to keep up if you can, kittypet.",
    ],
  },
  {
    id: "ravenpaw", name: "Ravenpaw", role: "Apprentice", clan: "thunderclan", wander: false,
    fur: "#2c2c30", furDark: "#1c1c20", eye: "#d9a83a", chest: "#e8e6e0",
    home: { x: cc.x + t(2.6), y: cc.y + t(3.2) },
    lines: [
      "Keep your voice down… Tigerclaw is watching. He doesn't like cats asking about Sunningrocks.",
      "I was there — at Sunningrocks, when Oakheart… no. I've said too much already.",
      "You're new, so you don't know to be afraid yet. Sometimes I wish I could be new again.",
    ],
  },
  {
    id: "yellowfang", name: "Yellowfang", role: "Stranger from ShadowClan", clan: "shadowclan", wander: false,
    fur: "#5c5c60", furDark: "#43434a", eye: "#e07b2a",
    home: { x: t(66) + TC_OX, y: t(20) + TC_OY },
    lines: [
      "What are you staring at, kit? Never seen a battle-scarred elder before?",
      "I don't belong to your Clan — and that's all you need to know. Now go, before Tigerclaw scents me.",
      "StarClan speaks in riddles, but hunger is simple. Leave the prey and no one gets scratched.",
    ],
  },
  {
    id: "smudge", name: "Smudge", role: "Kittypet friend", clan: "kittypet", wander: false,
    fur: "#9c9ca4", furDark: "#7c7c85", eye: "#5b8fd6",
    home: { x: t(74), y: t(142) },
    lines: [
      "Rusty? Is that you? You look… wild. Henry says the forest cats eat bones and have fighting claws!",
      "Come back to Twolegplace before dark, Rusty. The forest isn't for house cats.",
      "I dreamed you were a fire blazing through the trees. Silly, right? …Right?",
    ],
  },
  // --- Twolegplace kittypets — a living neighborhood ---
  {
    id: "henry", name: "Henry", role: "Kittypet", clan: "kittypet", wander: true,
    fur: "#e3c088", furDark: "#c19c5f", eye: "#5b8fd6", pattern: "tabby",
    home: { x: t(64), y: t(143) },
    schedule: [
      { h: 8, x: t(64), y: t(143) },
      { h: 12, x: t(68), y: t(150), activity: "sunning on the garden wall" },
      { h: 17, x: t(64), y: t(143) },
    ],
    lines: [
      "Henry's the name. I once jumped the fence in ONE leap — ask anyone on this street.",
      "Forest cats? Rubbish. The wildest thing out there is a fat pigeon.",
      "Twolegs put pellets in my bowl at dawn and dinner at six. What more could a cat want?",
    ],
  },
  {
    id: "marmalade", name: "Marmalade", role: "Kittypet", clan: "kittypet", wander: true,
    fur: "#d96b2f", furDark: "#b04f1d", eye: "#d9c04a", pattern: "tabby",
    home: { x: t(92), y: t(143) },
    schedule: [
      { h: 7, x: t(92), y: t(143) },
      { h: 11, x: t(88), y: t(150), activity: "patrolling the back fence" },
      { h: 18, x: t(92), y: t(143) },
    ],
    lines: [
      "I'm the top cat of this street. Every fence, every roof — mine.",
      "I saw a fox once. Chased it clean off MY porch. Well… it was walking away already.",
      "Smudge says you ran off to the forest. You've got bees in your brain, friend.",
    ],
  },
  {
    id: "princess", name: "Princess", role: "Kittypet", clan: "kittypet", wander: false,
    fur: "#e8e6e0", furDark: "#c9c6bd", eye: "#4fae6e", chest: "#f4e9d8",
    home: { x: t(70), y: t(152) },
    lines: [
      "Oh! You startled me. I was watching the birds on the fence.",
      "My Twolegs brush me every day. I'm far too refined for forest adventures.",
      "You know Smudge? Sweet tom. He's always talking about his friend who left.",
    ],
  },
  {
    id: "biscuit", name: "Biscuit", role: "Kittypet", clan: "kittypet", wander: true,
    fur: "#c98d5a", furDark: "#a56a3d", eye: "#c98a1e", pattern: "bicolor", chest: "#f4e9d8",
    home: { x: t(58), y: t(161) },
    schedule: [
      { h: 9, x: t(58), y: t(161) },
      { h: 13, x: t(62), y: t(152), activity: "napping in the flowerbed" },
      { h: 19, x: t(58), y: t(161) },
    ],
    lines: [
      "Zzz… wha—? Oh. Hello. I was chasing a mouse in my dream.",
      "The sunniest spot on this street is MY flowerbed. I share it. Sometimes.",
      "Have you tried the crumbs Twolegs drop at their eating-place? A delicacy.",
    ],
  },
  {
    id: "ginger", name: "Ginger", role: "Kittypet", clan: "kittypet", wander: true,
    fur: "#e8963f", furDark: "#c2752a", eye: "#7fae4e",
    home: { x: t(84), y: t(161) },
    schedule: [
      { h: 8, x: t(84), y: t(161) },
      { h: 12, x: t(78), y: t(150), activity: "walking the main street" },
      { h: 20, x: t(84), y: t(161) },
    ],
    lines: [
      "I walk the whole street twice a day. A cat needs her exercise.",
      "Don't scratch the fences — the Twolegs paint them every greenleaf.",
      "You smell like pine trees and… is that blood? You need a bath, dear.",
    ],
  },
  {
    id: "smokey", name: "Smokey", role: "Kittypet", clan: "kittypet", wander: true,
    fur: "#5c5c60", furDark: "#43434a", eye: "#d9a83a",
    home: { x: t(96), y: t(163) },
    schedule: [
      { h: 10, x: t(96), y: t(163) },
      { h: 15, x: t(90), y: t(150), activity: "sitting on a car roof" },
      { h: 21, x: t(96), y: t(163) },
    ],
    lines: [
      "Name's Smokey. I don't run for any cat — I sit, and things come to me.",
      "The rumbling nests sleep in their dens all day. Warmest spot in Twolegplace.",
      "Forest? Dark and full of claws, they say. I'll take my cushion, thanks.",
    ],
  },
  {
    id: "fluffy", name: "Fluffy", role: "Kittypet", clan: "kittypet", wander: false,
    fur: "#b8c4d6", furDark: "#93a3bb", eye: "#5b8fd6", tail: "fluffy",
    home: { x: t(84), y: t(145) },
    lines: [
      "Do you like my tail? My Twolegs say it's the fluffiest on the street.",
      "I'm not allowed past the gate. But I watch EVERYTHING from the window.",
      "Rusty used to live here, you know. Then one day — poof — warrior.",
    ],
  },
  // --- ThunderClan extras for a living camp ---
  {
    id: "halftail", name: "Halftail", role: "Elder", clan: "thunderclan", wander: false,
    fur: "#8a7a66", furDark: "#6d5f4e", eye: "#c9b23a",
    home: { x: cc.x - t(8.2), y: cc.y - t(1) },
    lines: [
      "Back in my day, apprentices learned to keep their tails down in the crouch. Lost mine to a Twoleg trap — mind the fences.",
      "A fire? Bah. Rain and badgers are the real enemies of a warrior.",
    ],
  },
  {
    id: "willowpelt", name: "Willowpelt", role: "Queen", clan: "thunderclan", wander: false,
    fur: "#b8c4d6", furDark: "#93a3bb", eye: "#7fae4e",
    home: { x: cc.x - t(7.4), y: cc.y + t(4.6) },
    lines: [
      "Mind your paws in the nursery, young one — the kits are sleeping.",
      "My kits will be warriors one day, and finer cats than any kittypet.",
    ],
  },
  {
    id: "darkstripe", name: "Darkstripe", role: "Warrior", clan: "thunderclan", wander: true,
    fur: "#3a3a40", furDark: "#26262c", eye: "#d9c04a",
    home: { x: cc.x + t(4.2), y: cc.y + t(6) },
    schedule: [
      { h: 9, x: t(42) + TC_OX, y: t(36) + TC_OY, activity: "walking the northern border" },
      { h: 14, x: cc.x + t(4.2), y: cc.y + t(6) },
      { h: 22, x: cc.x + t(4.6), y: cc.y + t(5.4) },
    ],
    lines: [
      "Tigerclaw is the finest deputy this Clan has ever had. Remember that, kittypet.",
      "The fresh-kill pile doesn't feed itself. Some of us work for our meals.",
    ],
  },
  // --- RiverClan ---
  {
    id: "crookedstar", name: "Crookedstar", role: "Leader", clan: "riverclan", wander: false,
    fur: "#a8875c", furDark: "#8a6c46", eye: "#5b8fd6",
    home: { x: rc.x, y: rc.y - t(4) },
    lines: [
      "Welcome to RiverClan, where every cat swims before it can walk. Mind you don't fall in — unless you can swim.",
      "The river gives us everything: fish, water, and a border no ThunderClan cat dares to cross.",
      "My jaw has been crooked since I was a kit. It never stopped me from becoming leader — and it won't stop you either.",
    ],
  },
  {
    id: "oakheart", name: "Oakheart", role: "Deputy", clan: "riverclan", wander: true,
    fur: "#8a6248", furDark: "#6d4c37", eye: "#7fae4e",
    home: { x: rc.x + t(4), y: rc.y + t(3) },
    schedule: [
      { h: 8, x: t(155) + 32, y: t(96), activity: "fishing at the reed bank" },
      { h: 14, x: rc.x + t(4), y: rc.y + t(3) },
      { h: 20, x: t(8) + TC_OX, y: t(42) + TC_OY, activity: "watching Sunningrocks from the bank" },
    ],
    lines: [
      "Sunningrocks belongs to RiverClan, whatever ThunderClan tells its apprentices.",
      "A RiverClan warrior fights wet and wins dry. ThunderClan never learns that.",
    ],
  },
  {
    id: "leopardfur", name: "Leopardfur", role: "Warrior", clan: "riverclan", wander: true,
    fur: "#d9a441", furDark: "#b3822c", eye: "#7fae4e",
    home: { x: rc.x - t(4), y: rc.y - t(2) },
    schedule: [
      { h: 10, x: t(158), y: t(116), activity: "fishing at the lake" },
      { h: 15, x: rc.x - t(4), y: rc.y - t(2) },
    ],
    lines: [
      "You crossed our river? Bold. Most cats from the forest won't even touch the water.",
      "Leopards swim, climb, and fight. So do I.",
    ],
  },
  {
    id: "silverstream", name: "Silverstream", role: "Warrior", clan: "riverclan", wander: true,
    fur: "#c9ced8", furDark: "#a5abbb", eye: "#5b8fd6", pattern: "tabby",
    home: { x: rc.x + t(2), y: rc.y + t(4) },
    schedule: [
      { h: 9, x: t(154), y: t(112), activity: "hunting fish in the shallows" },
      { h: 16, x: rc.x + t(2), y: rc.y + t(4) },
    ],
    lines: [
      "The river is beautiful at dawn, when the mist sits on it like a pelt.",
      "You smell of the forest. Try the fish — you'll never look at a mouse the same way.",
    ],
  },
  // --- WindClan ---
  {
    id: "tallstar", name: "Tallstar", role: "Leader", clan: "windclan", wander: false,
    fur: "#e8e6e0", furDark: "#c9c6bd", eye: "#2c2c30", pattern: "bicolor",
    home: { x: wc.x, y: wc.y - t(4) },
    lines: [
      "Welcome to WindClan. We run where other cats would lose their breath.",
      "The moor is open and the sky is wide. A WindClan cat trusts its legs above all.",
      "I have traveled farther than any Clan cat, and I still say: there is no place like the moor.",
    ],
  },
  {
    id: "mudclaw", name: "Mudclaw", role: "Deputy", clan: "windclan", wander: true,
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#c98a1e",
    home: { x: wc.x + t(4), y: wc.y + t(2) },
    schedule: [
      { h: 7, x: t(24), y: t(60), activity: "running the border markers" },
      { h: 13, x: wc.x + t(4), y: wc.y + t(2) },
      { h: 19, x: t(10), y: t(120), activity: "rabbit hunting on the open moor" },
    ],
    lines: [
      "ThunderClan cats sneak through trees. We cross the moor before you can blink.",
      "Rabbits are faster than any mouse. Keep your belly low and your legs ready.",
    ],
  },
  {
    id: "deadfoot", name: "Deadfoot", role: "Apprentice", clan: "windclan", wander: true,
    fur: "#5c5c60", furDark: "#43434a", eye: "#d9a83a",
    home: { x: wc.x - t(3), y: wc.y - t(1) },
    schedule: [
      { h: 8, x: wc.x - t(6), y: wc.y - t(6), activity: "racing practice" },
      { h: 15, x: wc.x - t(3), y: wc.y - t(1) },
    ],
    lines: [
      "One paw is twisted — doesn't slow me down. Race you to the border!",
      "Tallstar says the moor rewards the patient runner. I'd rather not be patient.",
    ],
  },
  {
    id: "barkface", name: "Barkface", role: "Medicine cat", clan: "windclan", wander: false,
    fur: "#8a7a66", furDark: "#6d5f4e", eye: "#7fae4e",
    home: { x: wc.x + t(5.2), y: wc.y - t(2) },
    lines: [
      "WindClan herbs grow where the wind strips the soil. Chamomile calms a cat better than any mouse.",
      "StarClan walks close on the moor. The Moonstone is just over the border, and its light never fades.",
    ],
  },
  // --- ShadowClan ---
  {
    id: "brokenstar", name: "Brokenstar", role: "Leader", clan: "shadowclan", wander: false,
    fur: "#6b4a2f", furDark: "#4e3421", eye: "#c96a1e",
    home: { x: sc.x, y: sc.y - t(4) },
    lines: [
      "This is ShadowClan territory, kittypet. The pines swallow intruders whole.",
      "My apprentices are made warriors before they are six moons old. Weakness is a choice.",
      "Tell your Bluestar: ShadowClan remembers every border they steal from us.",
    ],
  },
  {
    id: "blackfoot", name: "Blackfoot", role: "Deputy", clan: "shadowclan", wander: true,
    fur: "#e8e6e0", furDark: "#c9c6bd", eye: "#d9b23a", pattern: "bicolor",
    home: { x: sc.x + t(4), y: sc.y + t(2) },
    schedule: [
      { h: 8, x: t(110), y: t(20), activity: "patrolling the marshes" },
      { h: 14, x: sc.x + t(4), y: sc.y + t(2) },
    ],
    lines: [
      "You wandered far from the forest, little cat. The pines are ours.",
      "ShadowClan needs no friends. We take what we need.",
    ],
  },
  {
    id: "runningnose", name: "Runningnose", role: "Medicine cat", clan: "shadowclan", wander: false,
    fur: "#9c9ca4", furDark: "#7c7c85", eye: "#d9a83a",
    home: { x: sc.x - t(5), y: sc.y - t(1) },
    lines: [
      "My nose runs, but my visions run farther. StarClan is restless — they speak of a fire.",
      "Even Brokenstar's ShadowClan needs a medicine cat. Someone must read what the stars are saying.",
    ],
  },
  {
    id: "russetfur", name: "Russetfur", role: "Warrior", clan: "shadowclan", wander: true,
    fur: "#a8563a", furDark: "#84422a", eye: "#7fae4e",
    home: { x: sc.x - t(3), y: sc.y + t(3) },
    schedule: [
      { h: 9, x: t(88), y: t(30), activity: "hunting frogs in the pines" },
      { h: 15, x: sc.x - t(3), y: sc.y + t(3) },
    ],
    lines: [
      "Frogs and lizards — ShadowClan eats what the forest is too proud to touch.",
      "You crossed the Thunderpath alone? Monster-food for sure.",
    ],
  },
];

/** Player character — Rusty, newly named Firepaw (Story Mode). */
export const playerDef = {
  name: "Rusty",
  fur: "#d96b2f",
  furDark: "#b04f1d",
  eye: "#4fae6e",
  chest: "#f4e9d8",
};

// ---------------------------------------------------------------------------
// Prey spawn zones
// ---------------------------------------------------------------------------

export type PreyKind = "mouse" | "rabbit" | "squirrel" | "bird" | "fish" | "frog";

export const preyZones: { kind: PreyKind; rect: Rect; density: number }[] = [
  { kind: "mouse", rect: { x: t(50), y: t(46), w: t(92), h: t(96) }, density: 10 },
  { kind: "squirrel", rect: { x: t(52), y: t(48), w: t(88), h: t(60) }, density: 6 },
  { kind: "bird", rect: { x: t(50), y: t(44), w: t(94), h: t(100) }, density: 5 },
  { kind: "rabbit", rect: { x: 0, y: t(40), w: t(48), h: WORLD_H - t(40) }, density: 10 },
  { kind: "fish", rect: { x: t(144), y: t(48), w: t(48), h: WORLD_H - t(48) }, density: 8 },
  { kind: "frog", rect: { x: t(108), y: t(6), w: t(36), h: t(30) }, density: 7 },
  { kind: "mouse", rect: { x: t(104), y: t(136), w: t(40), h: t(36) }, density: 4 },
];

// ---------------------------------------------------------------------------
// Lore text for every interactable place
// ---------------------------------------------------------------------------

export const lore: Record<InteractableKind, { title: string; text: string }> = {
  "leader-den": {
    title: "The Leader's Den",
    text: "A narrow crack in Tallrock leads to a hidden den, soft with moss and lichen. Bluestar sleeps here, close to the sky, and shares tongues with StarClan every half-moon.",
  },
  "medicine-den": {
    title: "The Medicine Cat's Den",
    text: "A crevice in the rock, screened by a bramble. Cracks in the stone hold neat stores of herbs: marigold for wounds, catmint for greencough, poppy seeds for pain, cobweb to stop bleeding. A smooth stone beside it holds a pool of rainwater.",
  },
  "warriors-den": {
    title: "The Warriors' Den",
    text: "A dark, tangled thornbush near the camp entrance. Inside, moss-lined nests are packed tight — the first line of defense if the camp is ever attacked.",
  },
  "apprentices-den": {
    title: "The Apprentices' Den",
    text: "A bramble thicket beside the warriors' den, warm with the smell of young cats. Apprentices sleep here until they earn their warrior name.",
  },
  nursery: {
    title: "The Nursery",
    text: "A fallen bramble shelters the deepest, best-guarded den in camp, lined with feathers and moss. Queens raise their kits here until they are six moons old, safe from wind, rain, and raiding cats.",
  },
  "elders-den": {
    title: "The Elders' Den",
    text: "A fallen log draped in ivy. The elders who once fought for the Clan now rest here, and their stories of battles and prophecies are passed on to every new apprentice.",
  },
  "fresh-kill": {
    title: "Fresh-Kill Pile",
    text: "The Clan's catch is piled here for every cat to eat — warriors and elders first, then queens and kits. You take a piece of prey and eat your fill.",
  },
  tallrock: {
    title: "Tallrock",
    text: "A giant rock rises from the edge of the clearing. From its top the Clan leader calls meetings — 'Let all cats old enough to catch their own prey gather beneath the Tallrock!' — and new warriors are named.",
  },
  entrance: {
    title: "The Gorse Tunnel",
    text: "The only way into camp: a thorn-lined tunnel through dense gorse, invisible from outside. It has kept ThunderClan safe for countless seasons.",
  },
  "training-hollow": {
    title: "The Sandy Hollow",
    text: "A sandy clearing where apprentices learn to fight — the crouch, the pounce, the belly rake. The sand softens every fall, and old scars in the earth remember every practice battle.",
  },
  sunningrocks: {
    title: "Sunningrocks",
    text: "Smooth granite slabs warm in the sun beside the river. RiverClan has claimed them for seasons, and ThunderClan has fought and bled for every one of them.",
  },
  owltree: {
    title: "The Owl Tree",
    text: "A hollow oak where a wild owl nests. Apprentices dare each other to climb it — but every cat knows an owl's talons can carry off anything it can lift.",
  },
  snakerocks: {
    title: "Snakerocks",
    text: "Warm stones where prey is plentiful — and adders bask between the rocks. Every apprentice is warned: watch the shadows, listen for the rattle, and never put your paw where you cannot see.",
  },
  fourtrees: {
    title: "Fourtrees",
    text: "Four great oaks, one for each Clan, around a clearing swept bare by generations of Gatherings. On the full moon the Clans meet here in truce beneath the stars.",
  },
  sycamore: {
    title: "The Great Sycamore",
    text: "A towering sycamore whose branches reach over the river. Strong climbers can see all the way to RiverClan territory from its crown.",
  },
  tallpines: {
    title: "Tallpines",
    text: "A stretch of pine forest near Twolegplace. The soil is hard and bare, prey is scarce, and Twoleg monsters sometimes roar past. Only desperate hunters come here.",
  },
  thunderpath: {
    title: "The Thunderpath",
    text: "A hard, black path where Twoleg monsters race day and night. Beyond it lies ShadowClan territory. The stench of the monsters lingers long after they pass.",
  },
  river: {
    title: "The River",
    text: "A broad, slow river marking the border with RiverClan. Fish flash beneath the surface, and RiverClan cats swim like they were born in the water.",
  },
  moonstone: {
    title: "Mothermouth",
    text: "A cave mouth in the ring of Highstones. Deep inside, the Moonstone glows with the light of StarClan. Medicine cats come every half-moon to share dreams with their ancestors.",
  },
  twolegplace: {
    title: "Twolegplace",
    text: "Rows of Twoleg nests with soft cushions and food from a bowl — comfort, but never freedom. Every forest cat's story starts or ends here.",
  },
  farm: {
    title: "The Farm",
    text: "A big red barn full of hay, tended by a fat Twoleg and a cow that bellows at moonhigh. Barn mice are plentiful — if you don't mind the smell of cow.",
  },
  "windclan-camp": {
    title: "WindClan Camp",
    text: "A shallow scoop in the moor, ringed with gorse. The wind never stops singing here, and the camp is open to the sky — WindClan hides nothing.",
  },
  "riverclan-camp": {
    title: "RiverClan Camp",
    text: "A gravel hollow behind a wall of reeds, well-fed and well-watered. The smell of fish hangs over everything, and RiverClan cats think that's a compliment.",
  },
  "shadowclan-camp": {
    title: "ShadowClan Camp",
    text: "A gloomy hollow among the pines, sheltered from sight and from the sky. ShadowClan cats like it that way.",
  },
  highstones: {
    title: "Highstones",
    text: "A ring of bare stone hills where the land falls away and the sky seems close enough to touch. Mothermouth opens at their foot.",
  },
  lilypool: {
    title: "The Lily Pool",
    text: "A still pool ringed with lilies where medicine cats say StarClan's reflection is clearest.",
  },
  "border-marker": {
    title: "Border Marker",
    text: "A scent-marked stone that tells every passing cat: this is Clan land. Patrols renew the scent at sunhigh and moonhigh.",
  },
  herbs: {
    title: "Growing Herbs",
    text: "Leaves bright with health. A medicine cat could never have too many of these.",
  },
};

// ---------------------------------------------------------------------------
// Build once
// ---------------------------------------------------------------------------

seedScatter();
buildGroundMap();
buildCollision();
