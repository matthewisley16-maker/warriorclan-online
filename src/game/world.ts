// WarriorCatsRPG — world data for ThunderClan territory and the forest camp.
// Layout follows Into the Wild: a sandy hollow ringed by brambles, dens dug
// into natural formations, and the forest landmarks around the camp.

export const TILE = 32;
export const MAP_W = 96; // tiles
export const MAP_H = 84; // tiles
export const WORLD_W = MAP_W * TILE; // 3072
export const WORLD_H = MAP_H * TILE; // 2688

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type InteractableKind =
  | "leader-den" | "medicine-den" | "warriors-den" | "apprentices-den"
  | "nursery" | "elders-den" | "fresh-kill" | "tallrock" | "entrance"
  | "training-hollow" | "sunningrocks" | "owltree" | "snakerocks"
  | "fourtrees" | "sycamore" | "tallpines" | "thunderpath" | "river";

export type Style =
  | "rock" | "bramble" | "bush" | "log" | "tree" | "stump"
  | "fresh-kill" | "stone";

export interface WorldObject {
  id: string;
  x: number; // center, world units
  y: number;
  w: number;
  h: number;
  label?: string;
  interact?: InteractableKind;
  style: Style;
  solid?: boolean;
  /** visual size multiplier (collision stays near w/h) */
  scale?: number;
}

export interface NPCDef {
  id: string;
  name: string;
  role: string;
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  wander: boolean;
  home: Vec2;
  lines: string[];
}

export interface AreaDef {
  id: string;
  name: string;
  rect: Rect;
}

const t = (n: number) => n * TILE;

// ---------------------------------------------------------------------------
// Key regions
// ---------------------------------------------------------------------------

export const CAMP_CENTER: Vec2 = { x: t(41), y: t(46) };
export const CAMP_RADIUS = t(12.5);

/** Where new players appear — just south of the gorse tunnel. */
export const SPAWN: Vec2 = { x: t(41), y: t(59.5) };

export const clearZones: Rect[] = [
  { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 },
  { x: t(28), y: t(44), w: t(14), h: t(4) },   // west trail
  { x: t(39), y: t(55), w: t(5), h: t(12) },   // south trail
  { x: t(36), y: t(64), w: t(12), h: t(4) },   // south fork
  { x: t(41), y: t(38), w: t(5), h: t(9) },    // north trail
  { x: t(42), y: t(31), w: t(14), h: t(4) },   // NE trail
  { x: t(55), y: t(31), w: t(4), h: t(12) },   // east trail
  { x: t(26), y: t(58), w: t(11), h: t(9) },   // Sandy Hollow
  { x: t(14), y: t(62), w: t(10), h: t(10) },  // Fourtrees
  { x: t(52), y: t(40), w: t(8), h: t(6) },    // Owl Tree
  { x: t(62), y: t(14), w: t(9), h: t(8) },    // Snakerocks
  { x: t(16), y: t(36), w: t(8), h: t(8) },    // Great Sycamore
  { x: t(4), y: t(34), w: t(7), h: t(12) },    // Sunningrocks
  { x: t(42), y: t(68), w: t(4), h: t(4) },    // Smudge's garden fence corner
];

// ---------------------------------------------------------------------------
// Ground painting — coarse 8px cells painted grass/sand/water/stone/etc.
// ---------------------------------------------------------------------------

export type GroundKind =
  | "grass" | "sand" | "water" | "stone" | "paved" | "pine" | "dirt";

export const GROUND_CELL = 8;
export const GROUND_COLS = WORLD_W / GROUND_CELL; // 384
export const GROUND_ROWS = WORLD_H / GROUND_CELL; // 336

export const groundRegions: { kind: GroundKind; rect: Rect }[] = [
  { kind: "sand", rect: { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 } },
  { kind: "water", rect: { x: 0, y: t(28), w: t(4), h: WORLD_H - t(28) } }, // river, west border
  { kind: "paved", rect: { x: 0, y: t(2), w: WORLD_W, h: t(4) } },          // Thunderpath, north
  { kind: "stone", rect: { x: t(4), y: t(36), w: t(7), h: t(9) } },         // Sunningrocks
  { kind: "sand", rect: { x: t(27), y: t(59), w: t(9), h: t(7) } },         // Sandy Hollow
  { kind: "stone", rect: { x: t(63), y: t(15), w: t(7), h: t(6) } },        // Snakerocks
  { kind: "pine", rect: { x: t(6), y: t(66), w: t(42), h: WORLD_H - t(66) } }, // Tallpines, south
  { kind: "sand", rect: { x: t(17), y: t(65), w: t(8), h: t(7) } },         // Fourtrees clearing
];

/** Dirt trails (visual only). */
export const trailRects: Rect[] = [
  { x: t(30), y: t(47), w: t(12), h: t(2) },
  { x: t(41), y: t(55), w: t(2), h: t(11) },
  { x: t(37), y: t(65), w: t(12), h: t(2) },
  { x: t(42), y: t(38), w: t(2), h: t(9) },
  { x: t(42), y: t(31), w: t(14), h: t(2) },
  { x: t(55), y: t(31), w: t(2), h: t(12) },
];

const KIND_INDEX: Record<GroundKind, number> = {
  grass: 0, sand: 1, water: 2, stone: 3, paved: 4, pine: 5, dirt: 6,
};

/** Precomputed ground kind per cell. Built once at module init. */
export const groundMap: Uint8Array = new Uint8Array(GROUND_COLS * GROUND_ROWS);

function buildGroundMap() {
  const inRect = (x: number, y: number, r: Rect) =>
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  // default grass everywhere
  groundMap.fill(KIND_INDEX.grass);
  // regions in order; trails paint last so they cut through everything
  for (const reg of [...groundRegions]) {
    const k = KIND_INDEX[reg.kind];
    const x0 = Math.floor(reg.rect.x / GROUND_CELL);
    const y0 = Math.floor(reg.rect.y / GROUND_CELL);
    const x1 = Math.ceil((reg.rect.x + reg.rect.w) / GROUND_CELL);
    const y1 = Math.ceil((reg.rect.y + reg.rect.h) / GROUND_CELL);
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        const wx = cx * GROUND_CELL + GROUND_CELL / 2;
        const wy = cy * GROUND_CELL + GROUND_CELL / 2;
        if (inRect(wx, wy, reg.rect) && cy >= 0 && cy < GROUND_ROWS && cx >= 0 && cx < GROUND_COLS) {
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
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        if (cx >= 0 && cx < GROUND_COLS && cy >= 0 && cy < GROUND_ROWS) {
          groundMap[cy * GROUND_COLS + cx] = KIND_INDEX.dirt;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Objects — dens & features inside camp, then forest landmarks
// ---------------------------------------------------------------------------

const cc = CAMP_CENTER;

const campObjects: WorldObject[] = [
  {
    id: "tallrock",
    x: cc.x, y: cc.y - t(8.6), w: t(6), h: t(4.6),
    label: "Tallrock", interact: "tallrock", style: "rock", solid: true, scale: 1.5,
  },
  {
    id: "leader-den",
    x: cc.x + t(3.4), y: cc.y - t(6.8), w: t(2.2), h: t(2.2),
    label: "Leader's den", interact: "leader-den", style: "bramble", solid: true,
  },
  {
    id: "medicine-den",
    x: cc.x + t(8.2), y: cc.y - t(4.2), w: t(3.6), h: t(3),
    label: "Medicine cat's den", interact: "medicine-den", style: "bush", solid: true, scale: 1.2,
  },
  {
    id: "medicine-stone",
    x: cc.x + t(8.4), y: cc.y - t(1.2), w: t(1.6), h: t(1.2),
    label: "Stone with a pool of rainwater", style: "stone", solid: true,
  },
  {
    id: "nursery",
    x: cc.x - t(7.4), y: cc.y + t(4.2), w: t(4), h: t(3.2),
    label: "Nursery", interact: "nursery", style: "bramble", solid: true, scale: 1.2,
  },
  {
    id: "warriors-den",
    x: cc.x + t(4.6), y: cc.y + t(5.4), w: t(3.6), h: t(3),
    label: "Warriors' den", interact: "warriors-den", style: "bush", solid: true, scale: 1.2,
  },
  {
    id: "apprentices-den",
    x: cc.x + t(8.6), y: cc.y + t(2.6), w: t(3), h: t(2.6),
    label: "Apprentices' den", interact: "apprentices-den", style: "bramble", solid: true, scale: 1.15,
  },
  {
    id: "elders-den",
    x: cc.x - t(8.2), y: cc.y - t(1.6), w: t(4.4), h: t(2.4),
    label: "Elders' den", interact: "elders-den", style: "log", solid: true, scale: 1.2,
  },
  {
    id: "fresh-kill",
    x: cc.x - t(1.6), y: cc.y - t(1.2), w: t(1.8), h: t(1.4),
    label: "Fresh-kill pile", interact: "fresh-kill", style: "fresh-kill",
  },
  {
    id: "entrance",
    x: cc.x - t(0.5), y: cc.y + t(11.4), w: t(2.4), h: t(2),
    label: "Gorse tunnel", interact: "entrance", style: "bramble", scale: 1.2,
  },
];

const landmarkObjects: WorldObject[] = [
  {
    id: "sandy-hollow", x: t(31), y: t(62), w: t(3), h: t(2.6),
    label: "Sandy Hollow", interact: "training-hollow", style: "stump",
  },
  {
    id: "fourtrees", x: t(19), y: t(68), w: t(4), h: t(3),
    label: "Fourtrees", interact: "fourtrees", style: "tree", scale: 2,
  },
  {
    id: "great-rock", x: t(17), y: t(66), w: t(3), h: t(2.4),
    label: "Great Rock", style: "rock", solid: true, scale: 1.4,
  },
  {
    id: "owl-tree", x: t(56), y: t(43), w: t(4), h: t(3),
    label: "Owl Tree", interact: "owltree", style: "tree", scale: 2, solid: true,
  },
  {
    id: "snakerocks", x: t(66), y: t(18), w: t(4), h: t(2.8),
    label: "Snakerocks", interact: "snakerocks", style: "rock", scale: 1.6, solid: true,
  },
  {
    id: "sycamore", x: t(20), y: t(40), w: t(4), h: t(3),
    label: "Great Sycamore", interact: "sycamore", style: "tree", scale: 2, solid: true,
  },
  {
    id: "sunningrocks", x: t(7), y: t(40), w: t(4), h: t(2.6),
    label: "Sunningrocks", interact: "sunningrocks", style: "rock", scale: 1.6, solid: true,
  },
  {
    id: "tallpines", x: t(27), y: t(72), w: t(3.4), h: t(2.6),
    label: "Tallpines", interact: "tallpines", style: "stump", scale: 1.3,
  },
  {
    id: "thunderpath", x: t(42), y: t(4), w: t(4), h: t(2),
    label: "Thunderpath", interact: "thunderpath", style: "stone", scale: 1.2,
  },
  {
    id: "river", x: t(6), y: t(50), w: t(3), h: t(2),
    label: "The river", interact: "river", style: "stone", scale: 1.2,
  },
];

export const allObjects: WorldObject[] = [...campObjects, ...landmarkObjects];

// ---------------------------------------------------------------------------
// Deterministic scatter — trees, ferns, tufts, flowers
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
export const flora: { x: number; y: number; kind: "fern" | "tuft" | "flower"; tint: number }[] = [];
/** Visual brambles ringing the camp wall (matches collision ring). */
export const campWall: { x: number; y: number; r: number; tint: number }[] = [];

const rand = lcg(20260926);

function inAnyRect(x: number, y: number, rects: Rect[]) {
  return rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

function seedBorderTrees() {
  for (let gy = 2; gy < MAP_H - 2; gy += 2) {
    for (const gx of [0.6, 2.4, 4.2]) {
      trees.push({ x: t(gx) + rand() * 24, y: t(gy) + rand() * 44, r: 26, pine: false, tint: rand(), border: true });
    }
    for (const gx of [MAP_W - 0.6, MAP_W - 2.4, MAP_W - 4.2]) {
      trees.push({ x: t(gx) - rand() * 24, y: t(gy) + rand() * 44, r: 26, pine: false, tint: rand(), border: true });
    }
  }
  for (let gx = 2; gx < MAP_W - 2; gx += 2) {
    for (const gy of [0.6, 2.6]) {
      trees.push({ x: t(gx) + rand() * 44, y: t(gy) + rand() * 24, r: 26, pine: false, tint: rand(), border: true });
    }
    for (const gy of [MAP_H - 0.6, MAP_H - 2.6, MAP_H - 4.4]) {
      trees.push({ x: t(gx) + rand() * 44, y: t(gy) - rand() * 24, r: 26, pine: false, tint: rand(), border: true });
    }
  }
}

function seedForest() {
  const avoid: Rect[] = [...clearZones, ...trailRects];
  let count = 0;
  let attempts = 0;
  while (count < 170 && attempts < 5000) {
    attempts++;
    const x = t(5) + rand() * (WORLD_W - t(10));
    const y = t(6) + rand() * (WORLD_H - t(12));
    if (inAnyRect(x, y, avoid)) continue;
    const pineZone = groundRegions.some((g) => g.kind === "pine" && inAnyRect(x, y, [g.rect]));
    trees.push({ x, y, r: 24 + rand() * 10, pine: pineZone || rand() < 0.18, tint: rand() });
    count++;
  }

  attempts = 0;
  count = 0;
  while (count < 420 && attempts < 9000) {
    attempts++;
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    if (groundRegions.some((g) => (g.kind === "water" || g.kind === "paved" || g.kind === "stone") && inAnyRect(x, y, [g.rect]))) continue;
    if (inAnyRect(x, y, trailRects)) continue;
    if (Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < CAMP_RADIUS + 20) continue;
    flora.push({
      x, y,
      kind: rand() < 0.14 ? "flower" : rand() < 0.5 ? "fern" : "tuft",
      tint: rand(),
    });
    count++;
  }

  // camp wall brambles (visual ring with a gap at the south entrance)
  const steps = 46;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (deg > 62 && deg < 118) continue; // entrance gap
    campWall.push({
      x: CAMP_CENTER.x + Math.cos(a) * CAMP_RADIUS,
      y: CAMP_CENTER.y + Math.sin(a) * CAMP_RADIUS,
      r: 30 + rand() * 12,
      tint: rand(),
    });
  }
}

// ---------------------------------------------------------------------------
// Collision grid — 1 = blocked. Built once at module init.
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

function buildCollision() {
  // river: solid water on the west edge
  blockRect({ x: 0, y: t(28), w: t(4), h: WORLD_H - t(28) });
  // dense map borders
  blockRect({ x: 0, y: 0, w: t(4), h: t(28) });
  blockRect({ x: 0, y: 0, w: WORLD_W, h: t(2.5) });
  blockRect({ x: 0, y: 0, w: t(4), h: WORLD_H });
  blockRect({ x: WORLD_W - t(4), y: 0, w: t(4), h: WORLD_H });
  blockRect({ x: 0, y: WORLD_H - t(4), w: WORLD_W, h: t(4) });

  // camp wall ring with the south entrance gap
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
}

// ---------------------------------------------------------------------------
// Areas for the HUD location chip
// ---------------------------------------------------------------------------

export const areas: AreaDef[] = [
  { id: "camp", name: "ThunderClan Camp", rect: { x: CAMP_CENTER.x - CAMP_RADIUS, y: CAMP_CENTER.y - CAMP_RADIUS, w: CAMP_RADIUS * 2, h: CAMP_RADIUS * 2 } },
  { id: "thunderpath", name: "The Thunderpath", rect: { x: 0, y: 0, w: WORLD_W, h: t(6) } },
  { id: "river", name: "The River", rect: { x: 0, y: t(6), w: t(6), h: WORLD_H - t(6) } },
  { id: "sunningrocks", name: "Sunningrocks", rect: { x: t(4), y: t(34), w: t(8), h: t(13) } },
  { id: "sycamore", name: "Great Sycamore", rect: { x: t(15), y: t(35), w: t(10), h: t(10) } },
  { id: "owltree", name: "Owl Tree", rect: { x: t(52), y: t(39), w: t(9), h: t(8) } },
  { id: "snakerocks", name: "Snakerocks", rect: { x: t(61), y: t(13), w: t(11), h: t(10) } },
  { id: "tallpines", name: "Tallpines", rect: { x: t(5), y: t(64), w: t(44), h: WORLD_H - t(64) } },
  { id: "sandy", name: "Sandy Hollow", rect: { x: t(25), y: t(57), w: t(13), h: t(11) } },
  { id: "fourtrees", name: "Fourtrees", rect: { x: t(13), y: t(61), w: t(12), h: t(12) } },
];

export function areaAt(x: number, y: number): AreaDef | null {
  for (const a of areas) {
    if (x >= a.rect.x && x < a.rect.x + a.rect.w && y >= a.rect.y && y < a.rect.y + a.rect.h) {
      return a;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// NPCs — the ThunderClan cats as Rusty would meet them
// ---------------------------------------------------------------------------

export const npcs: NPCDef[] = [
  {
    id: "bluestar", name: "Bluestar", role: "Clan leader", wander: false,
    fur: "#9fb2c8", furDark: "#7c8fa8", eye: "#5b8fd6",
    home: { x: cc.x + t(1.4), y: cc.y - t(5.4) },
    lines: [
      "You have come to the right place, Rusty. I have watched you from the Twoleg gardens — you hunt like a warrior already.",
      "The Clan is small but proud. If you join us, you will train from moonhigh to dawn, and give your life to ThunderClan if you must.",
      "Fire alone can save our Clan. I have not shared that prophecy with the others — keep it between us for now.",
      "Tonight, you will be given your apprentice name before StarClan. From this moment, you will be known as Firepaw.",
    ],
  },
  {
    id: "lionheart", name: "Lionheart", role: "Warrior", wander: true,
    fur: "#d9a441", furDark: "#b3822c", eye: "#d98f2b",
    home: { x: cc.x + t(3), y: cc.y + t(6.8) },
    lines: [
      "You'll need more than courage to survive out here, kittypet. Watch how a real warrior takes down prey.",
      "The warrior code asks more of us than any Twoleg ever could. We defend the Clan with our lives.",
      "Tigerclaw and I found ShadowClan scent past the Thunderpath this morning. Stay close to camp.",
    ],
  },
  {
    id: "tigerclaw", name: "Tigerclaw", role: "Deputy", wander: true,
    fur: "#6b4a2f", furDark: "#4e3421", eye: "#c98a1e",
    home: { x: cc.x + t(5), y: cc.y + t(4.4) },
    lines: [
      "A kittypet? Bluestar must be mouse-brained to bring that into camp.",
      "If you fight like you hunt, you may last a moon. If not — the elders' den always needs fresh bedding.",
      "Stay out of my way, kit. ThunderClan has no room for half-hearted warriors.",
    ],
  },
  {
    id: "whitestorm", name: "Whitestorm", role: "Warrior", wander: true,
    fur: "#e8e6e0", furDark: "#c9c6bd", eye: "#d9b23a",
    home: { x: cc.x - t(4), y: cc.y + t(1) },
    lines: [
      "Do not mind Tigerclaw. He judges every cat by their first scrap.",
      "I was named for the storm that raged the night I was born. Strength and patience — both matter here.",
      "When you are ready, I will show you the borders: the river, Fourtrees, and the Thunderpath beyond.",
    ],
  },
  {
    id: "spottedleaf", name: "Spottedleaf", role: "Medicine cat", wander: false,
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
    id: "graypaw", name: "Graypaw", role: "Apprentice", wander: true,
    fur: "#8f8f96", furDark: "#6f6f76", eye: "#d9c04a",
    home: { x: cc.x + t(7.4), y: cc.y + t(0.8) },
    lines: [
      "You're the kittypet Bluestar brought back! I'm Graypaw — of ThunderClan. I've been an apprentice for two moons.",
      "Wait until you taste fresh-kill. A fat mouse from the forest beats dry pellets any day.",
      "Wanna train at the Sandy Hollow later? Dustpaw says I fight like a badger — which is a compliment... right?",
    ],
  },
  {
    id: "sandpaw", name: "Sandpaw", role: "Apprentice", wander: true,
    fur: "#e3c088", furDark: "#c19c5f", eye: "#7fae4e",
    home: { x: cc.x - t(4.6), y: cc.y - t(3.6) },
    lines: [
      "So you're the kittypet. You smell like Twolegs and… what is that? Pellets?",
      "Don't just stand there blinking. In ThunderClan we earn our place, paw by paw.",
      "Fine — you're not as hopeless as you look. Maybe I'll show you a hunting crouch. Maybe.",
    ],
  },
  {
    id: "dustpaw", name: "Dustpaw", role: "Apprentice", wander: true,
    fur: "#7a5b3a", furDark: "#5c4229", eye: "#c98a1e",
    home: { x: cc.x + t(6.4), y: cc.y + t(3.4) },
    lines: [
      "A kittypet in camp. What's next, a badger leading patrols?",
      "Kittypets stay fat and lazy. You won't last a night patrol in leaf-bare.",
      "Tigerclaw says real warriors prove themselves in battle. Try to keep up if you can, kittypet.",
    ],
  },
  {
    id: "ravenpaw", name: "Ravenpaw", role: "Apprentice", wander: false,
    fur: "#2c2c30", furDark: "#1c1c20", eye: "#d9a83a", chest: "#e8e6e0",
    home: { x: cc.x + t(2.6), y: cc.y + t(3.2) },
    lines: [
      "Keep your voice down… Tigerclaw is watching. He doesn't like cats asking about Sunningrocks.",
      "I was there — at Sunningrocks, when Oakheart… no. I've said too much already.",
      "You're new, so you don't know to be afraid yet. Sometimes I wish I could be new again.",
    ],
  },
  {
    id: "yellowfang", name: "Yellowfang", role: "Stranger from ShadowClan", wander: false,
    fur: "#5c5c60", furDark: "#43434a", eye: "#e07b2a",
    home: { x: t(66), y: t(20) },
    lines: [
      "What are you staring at, kit? Never seen a battle-scarred elder before?",
      "I don't belong to your Clan — and that's all you need to know. Now go, before Tigerclaw scents me.",
      "StarClan speaks in riddles, but hunger is simple. Leave the prey and no one gets scratched.",
    ],
  },
  {
    id: "smudge", name: "Smudge", role: "Kittypet friend", wander: false,
    fur: "#9c9ca4", furDark: "#7c7c85", eye: "#5b8fd6",
    home: { x: t(44), y: t(70) },
    lines: [
      "Rusty? Is that you? You look… wild. Henry says the forest cats eat bones and have fighting claws!",
      "Come back to Twolegplace before dark, Rusty. The forest isn't for house cats.",
      "I dreamed you were a fire blazing through the trees. Silly, right? …Right?",
    ],
  },
];

/** Player character — Rusty, newly named Firepaw. */
export const playerDef = {
  name: "Firepaw",
  fur: "#d96b2f",
  furDark: "#b04f1d",
  eye: "#4fae6e",
  chest: "#f4e9d8",
};

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
    text: "The Clan's catch is piled here for every cat to eat — warriors and elders first, then queens and kits. Mice, voles, the occasional starling. You take a mouse and eat your fill.",
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
    text: "A broad, slow river marking the border with RiverClan. Fish flash beneath the surface, and RiverClan cats swim like they were born in the water. ThunderClan cats stay on this bank.",
  },
};

// ---------------------------------------------------------------------------
// Build everything once
// ---------------------------------------------------------------------------

seedBorderTrees();
seedForest();
buildGroundMap();
buildCollision();
