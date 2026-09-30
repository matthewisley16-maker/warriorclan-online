// Patch 100 — multi-room floor-plan infrastructure in engine.ts:
//  1. InteriorPropStyle += tub/toilet/stove; InteriorDef prop.interact + rooms + stairs + groundFloor
//  2. RoomGeo += frontDoor + cellProps
//  3. WallSeg type + applyWallSegs + PLAN_WALLS registry + roomSized frontDoor param
//  4. ROOM_GEO += house-j/k/l + house-d-up
//  5. propPx cell-coordinate mode; defaultFurnitureAction export
//  6. Stair portals in movement + groundFloorId + walk-out gate + enterInterior
//  7. Room-name area labels + furniture nearby interact
// Every replacement is assertion-guarded: abort on anchor count != 1.
const fs = require("fs");
const p = "src/game/engine.ts";
let src = fs.readFileSync(p, "utf8");
let bad = 0;
function rep(oldS, newS) {
  const n = src.split(oldS).length - 1;
  if (n !== 1) {
    console.error(`ANCHOR FAIL (${n}x): ${oldS.slice(0, 90).replace(/\n/g, "\\n")}`);
    bad++;
    return;
  }
  src = src.replace(oldS, () => newS);
}

// ---------- 1. types ----------
rep(`type InteriorPropStyle =
  | "nest" | "herbs" | "stone" | "moss" | "plank" | "hay" | "bowl"
  | "vines" | "toy" | "carpet" | "lamp"
  | "sofa" | "chair" | "table" | "bed" | "cabinet" | "shelf" | "books"
  | "box" | "window" | "plant" | "post" | "blanket";`,
`type InteriorPropStyle =
  | "nest" | "herbs" | "stone" | "moss" | "plank" | "hay" | "bowl"
  | "vines" | "toy" | "carpet" | "lamp"
  | "sofa" | "chair" | "table" | "bed" | "cabinet" | "shelf" | "books"
  | "box" | "window" | "plant" | "post" | "blanket"
  | "tub" | "toilet" | "stove";

/** A named room zone on the room grid (inclusive cell bounds). */
interface RoomZone { name: string; x0: number; y0: number; x1: number; y1: number }
/** A walk-in stair portal between two floors (cells). */
interface StairPortal { x: number; y: number; w: number; h: number; toX: number; toY: number; target: string }`);

rep(`interface InteriorDef {
  id: string;
  name: string;
  /** wall layout in a 24x18 room of 32px cells; 1 = wall */
  walls: string[];
  props: { id: string; x: number; y: number; label: string; style: InteriorPropStyle }[];
  /** text shown when entering */
  desc: string;
  npcs?: string[]; // npc ids positioned here
}`,
`interface InteriorDef {
  id: string;
  name: string;
  /** wall layout in a 24x18 room of 32px cells; 1 = wall */
  walls: string[];
  props: { id: string; x: number; y: number; label: string; style: InteriorPropStyle; interact?: string }[];
  /** text shown when entering */
  desc: string;
  npcs?: string[]; // npc ids positioned here
  /** named rooms on the floor plan (the HUD shows "I am in the kitchen") */
  rooms?: RoomZone[];
  /** walk-in stair portals (physical floor changes — no teleporting UI) */
  stairs?: StairPortal[];
}`);

// ---------- 2/3. roomSized frontDoor + wall segments ----------
rep(`/** Wall rows for a w x h room with a door in the bottom wall. */
function roomSized(w: number, h: number, cave = false): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "1".repeat(w);
    if (y > 0 && y < h - 1) {
      row = "1" + "0".repeat(w - 2) + "1";
      if (cave) {
        // round the corners like a scooped-out den
        const indent = y === 1 || y === h - 2 ? 2 : 1;
        row = "1".repeat(indent + 1) + "0".repeat(w - 2 * (indent + 1)) + "1".repeat(indent + 1);
      }
    }
    rows.push(row);
  }
  // doorway: two-cell gap in the bottom wall
  const mid = Math.floor(w / 2) - 1;
  const bottom = rows[h - 1];
  rows[h - 1] = bottom.slice(0, mid) + "00" + bottom.slice(mid + 2);
  return rows;
}`,
`/** Wall rows for a w x h room with a door in the bottom wall. */
function roomSized(w: number, h: number, cave = false, frontDoor = true): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "1".repeat(w);
    if (y > 0 && y < h - 1) {
      row = "1" + "0".repeat(w - 2) + "1";
      if (cave) {
        // round the corners like a scooped-out den
        const indent = y === 1 || y === h - 2 ? 2 : 1;
        row = "1".repeat(indent + 1) + "0".repeat(w - 2 * (indent + 1)) + "1".repeat(indent + 1);
      }
    }
    rows.push(row);
  }
  if (frontDoor) {
    // doorway: two-cell gap in the bottom wall
    const mid = Math.floor(w / 2) - 1;
    const bottom = rows[h - 1];
    rows[h - 1] = bottom.slice(0, mid) + "00" + bottom.slice(mid + 2);
  }
  return rows;
}

/** An interior wall segment: horizontal (row y) or vertical (column x), with door gaps. */
type WallSeg =
  | { h: true; y: number; x0: number; x1: number; doors: number[] }
  | { h: false; x: number; y0: number; y1: number; doors: number[] };

/** Carve interior walls (with doorway gaps) into a room's wall grid. */
function applyWallSegs(rows: string[], segs: WallSeg[]): string[] {
  const out = [...rows];
  for (const s of segs) {
    if (s.h) {
      if (out[s.y] === undefined) continue;
      const chars = out[s.y].split("");
      for (let x = Math.max(1, s.x0); x <= Math.min(chars.length - 2, s.x1); x++) chars[x] = "1";
      for (const d of s.doors) {
        if (chars[d] !== undefined) chars[d] = "0";
        if (chars[d + 1] !== undefined) chars[d + 1] = "0";
      }
      out[s.y] = chars.join("");
    } else {
      for (let y = Math.max(1, s.y0); y <= Math.min(out.length - 2, s.y1); y++) {
        const row = out[y];
        if (row === undefined || row[s.x] === undefined) continue;
        const chars = row.split("");
        chars[s.x] = "1";
        out[y] = chars.join("");
      }
      for (const d of s.doors) {
        const row = out[d];
        if (row === undefined) continue;
        const chars = row.split("");
        chars[s.x] = "0";
        out[d] = chars.join("");
      }
    }
  }
  return out;
}

/**
 * Per-house floor plans: interior partition walls that turn each Twoleg home
 * into real, separate rooms (kitchen, bedrooms, bathroom...) connected by
 * doorways. Coordinates are cells; doors list gap starts (2 cells wide on
 * horizontal walls, 1 cell tall on vertical walls).
 */
const PLAN_WALLS: Record<string, WallSeg[]> = {
  // Rusty's family home (22x16): living / kitchen / dining / bedroom
  "rusty-house": [
    { h: true, y: 9, x0: 1, x1: 20, doors: [5, 15] },
    { h: false, x: 14, y0: 10, y1: 14, doors: [12] },
  ],
  // Smudge's small home (17x12): living / bedroom / kitchen
  "smudge-house": [
    { h: true, y: 6, x0: 1, x1: 15, doors: [4, 12] },
  ],
  // Henry's home (18x13): kitchen / living / bedroom / bathroom
  "henry-house": [
    { h: false, x: 10, y0: 1, y1: 6, doors: [3] },
    { h: true, y: 7, x0: 1, x1: 16, doors: [4, 12] },
  ],
  // Princess's cozy home (16x12): living / bedroom / kitchen
  "princess-house": [
    { h: true, y: 5, x0: 1, x1: 14, doors: [10] },
  ],
  // Marmalade's large home (21x15): kitchen / living / dining / bedroom
  "marmalade-house": [
    { h: false, x: 11, y0: 1, y1: 7, doors: [4] },
    { h: true, y: 8, x0: 1, x1: 19, doors: [5, 14] },
    { h: false, x: 11, y0: 9, y1: 13, doors: [11] },
  ],
  // Ginger's home (16x12): kitchen / living / bedroom
  "ginger-house": [
    { h: true, y: 5, x0: 1, x1: 14, doors: [5] },
  ],
  "house-a": [
    { h: true, y: 5, x0: 1, x1: 13, doors: [4] },
  ],
  // house-b (23x17): kitchen / living / dining / bedroom
  "house-b": [
    { h: false, x: 12, y0: 1, y1: 8, doors: [4] },
    { h: true, y: 9, x0: 1, x1: 21, doors: [5, 15] },
    { h: false, x: 12, y0: 10, y1: 15, doors: [12] },
  ],
  // house-c (18x13): living / bedroom / kitchen
  "house-c": [
    { h: true, y: 6, x0: 1, x1: 16, doors: [8] },
    { h: false, x: 9, y0: 7, y1: 11, doors: [9] },
  ],
  // house-d (20x15) GROUND floor: living / kitchen / entry / dining + stairs up
  "house-d": [
    { h: false, x: 12, y0: 1, y1: 13, doors: [3, 9] },
    { h: true, y: 7, x0: 1, x1: 11, doors: [5] },
  ],
  // house-d-up (20x15) UPstairs: landing / master bedroom / child's room / bathroom
  "house-d-up": [
    { h: false, x: 9, y0: 1, y1: 13, doors: [4, 10] },
    { h: true, y: 6, x0: 10, x1: 18, doors: [13] },
    { h: true, y: 10, x0: 10, x1: 18, doors: [15] },
  ],
  "house-e": [
    { h: false, x: 11, y0: 1, y1: 7, doors: [4] },
    { h: true, y: 8, x0: 1, x1: 19, doors: [5, 14] },
    { h: false, x: 11, y0: 9, y1: 13, doors: [11] },
  ],
  // house-j (18x13): kitchen / living / bedroom / bathroom
  "house-j": [
    { h: false, x: 9, y0: 1, y1: 6, doors: [3] },
    { h: true, y: 7, x0: 1, x1: 16, doors: [4, 12] },
  ],
  // house-k (19x14): living / bedroom / kitchen / study
  "house-k": [
    { h: true, y: 6, x0: 1, x1: 17, doors: [5, 13] },
    { h: false, x: 10, y0: 7, y1: 12, doors: [9] },
    { h: false, x: 14, y0: 7, y1: 12, doors: [10] },
  ],
  // house-l (20x15): living / kitchen / dining / bedroom
  "house-l": [
    { h: false, x: 9, y0: 1, y1: 7, doors: [3] },
    { h: true, y: 8, x0: 1, x1: 18, doors: [5, 13] },
    { h: false, x: 13, y0: 9, y1: 13, doors: [11] },
  ],
};`);

// ---------- 4. RoomGeo extension + new geos ----------
rep(`interface RoomGeo {
  w: number;
  h: number;
  cave: boolean;
  floor: [string, string, string]; // base, speckle, accent
  wall: [string, string]; // face, top edge
}`,
`interface RoomGeo {
  w: number;
  h: number;
  cave: boolean;
  floor: [string, string, string]; // base, speckle, accent
  wall: [string, string]; // face, top edge
  /** no front-door gap in the bottom wall (upper floors) */
  frontDoor?: boolean;
  /** props are authored directly in this room's cell coords */
  cellProps?: boolean;
}`);

rep(`  "moonstone-cave":   { w: 15, h: 12, cave: true,  floor: ["#5c5e66", "#50525a", "#686a72"], wall: ["#33343c", "#43454f"] },
};`,
`  "moonstone-cave":   { w: 15, h: 12, cave: true,  floor: ["#5c5e66", "#50525a", "#686a72"], wall: ["#33343c", "#43454f"] },
  // original floor-plan homes added by the house-interiors upgrade
  "house-j":          { w: 18, h: 13, cave: false, floor: ["#a87c50", "#9c724a", "#b4865a"], wall: ["#cec0a2", "#ded2b6"], cellProps: true },
  "house-k":          { w: 19, h: 14, cave: false, floor: ["#b48454", "#a87a4e", "#c0905e"], wall: ["#d4c4a4", "#e2d4b6"], cellProps: true },
  "house-l":          { w: 20, h: 15, cave: false, floor: ["#a2764a", "#966e44", "#ae8256"], wall: ["#c6b694", "#d6c8a8"], cellProps: true },
  "house-d-up":       { w: 20, h: 15, cave: false, frontDoor: false, floor: ["#b88a58", "#ac7e4e", "#c49662"], wall: ["#d8c8ac", "#e6d8be"], cellProps: true },
};`);

// ---------- 5. propPx cell mode + furniture defaults ----------
rep(`function propPx(
  roomId: string,
  prop: { x: number; y: number },
): { x: number; y: number } {
  const geo = ROOM_GEO[roomId];
  const gx = geo ? (prop.x / 24) * geo.w : prop.x;
  const gy = geo ? (prop.y / 18) * geo.h : prop.y;
  return { x: gx * 32 + 16, y: gy * 32 + 16 };
}`,
`function propPx(
  roomId: string,
  prop: { x: number; y: number },
): { x: number; y: number } {
  const geo = ROOM_GEO[roomId];
  if (geo?.cellProps) {
    // plan-authored rooms: props sit on exact cells (clamped inside the walls)
    const cx = Math.max(1, Math.min(geo.w - 2, prop.x));
    const cy = Math.max(1, Math.min(geo.h - 2, prop.y));
    return { x: cx * 32 + 16, y: cy * 32 + 16 };
  }
  const gx = geo ? (prop.x / 24) * geo.w : prop.x;
  const gy = geo ? (prop.y / 18) * geo.h : prop.y;
  return { x: gx * 32 + 16, y: gy * 32 + 16 };
}

/**
 * Furniture is interactive (spec: objects actually DO things). Every prop
 * style maps to a real cat action; per-prop overrides win.
 */
export function defaultFurnitureAction(style: string): string | undefined {
  switch (style) {
    case "bed": case "hay": case "moss": case "nest": case "blanket": return "f-sleep";
    case "sofa": case "carpet": return "f-lie";
    case "chair": case "plank": case "stone": return "f-sit";
    case "post": return "f-scratch";
    case "bowl": return "f-eat";
    case "tub": case "toilet": return "f-drink";
    case "stove": return "f-warm";
    case "window": return "f-look";
    case "box": return "f-hide";
    case "toy": return "f-play";
    case "plant": case "vines": case "herbs": case "books": case "shelf":
    case "cabinet": case "table": case "lamp": return "f-sniff";
    default: return undefined;
  }
}`);

// ---------- fit loop: frontDoor + plans ----------
rep(`// Fit every room's wall grid to its geometry (rounded cave dens, varied
// sizes) — the doorway gap stays centered in the bottom wall.
for (const room of Object.values(interiors)) {
  const geo = ROOM_GEO[room.id];
  if (geo) room.walls = roomSized(geo.w, geo.h, geo.cave);
}`,
`// Fit every room's wall grid to its geometry (rounded cave dens, varied
// sizes), then carve the floor plan's interior walls with their doorways.
// Upper floors (frontDoor: false) have a fully closed bottom wall.
for (const room of Object.values(interiors)) {
  const geo = ROOM_GEO[room.id];
  if (!geo) continue;
  let rows = roomSized(geo.w, geo.h, geo.cave, geo.frontDoor !== false);
  const plan = PLAN_WALLS[room.id];
  if (plan) rows = applyWallSegs(rows, plan);
  room.walls = rows;
}`);

// ---------- engine fields + enterInterior ----------
rep(`  private doorCooldownUntil = 0;`,
`  private doorCooldownUntil = 0;
  /** the room the player entered from outside (walk-out only works here) */
  private groundFloorId: string | null = null;
  /** stair-portal cooldown (prevents up/down ping-pong on one step) */
  private stairCooldownUntil = 0;`);

rep(`    // traffic is world-persistent: cars keep driving while the cat is indoors
    this.interiorId = id;
    const geo = ROOM_GEO[id];`,
`    // traffic is world-persistent: cars keep driving while the cat is indoors
    this.interiorId = id;
    this.groundFloorId = id; // walking out the front door works from here
    const geo = ROOM_GEO[id];`);

// ---------- movement: stairs + walk-out gate ----------
rep(`        const wall = room.walls[Math.min(room.walls.length - 1, cy)]?.[cx] === "1";
        if (!wall) {
          this.px = nx;
          this.py = ny;
        }
        // walk-out: step into the doorway gap at the bottom wall to leave —
        // no key press needed (mirrors the walk-in entrances outside)
        if (
          this.py > ((geo?.h ?? ROOM_H) - 2.1) * 32 + (this.swimming ? 90 : 0) &&
          Math.abs(this.px - gw / 2) < (this.swimming ? 100 : 40)
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }`,
`        const wall = room.walls[Math.min(room.walls.length - 1, cy)]?.[cx] === "1";
        if (!wall) {
          this.px = nx;
          this.py = ny;
        }
        // stair portals: walk onto the steps and you arrive on the other
        // floor — a real physical transition (the cat walks, no teleport UI)
        if (this.time > this.stairCooldownUntil) {
          for (const st of room.stairs ?? []) {
            const scx = Math.floor(this.px / 32);
            const scy = Math.floor(this.py / 32);
            if (scx >= st.x && scx < st.x + st.w && scy >= st.y && scy < st.y + st.h) {
              this.stairCooldownUntil = this.time + 0.9;
              this.interiorId = st.target;
              this.px = st.toX * 32 + 16;
              this.py = st.toY * 32 + 16;
              this.engineSfx("npcstep", { volume: 0.5, throttleMs: 400 });
              this.cb.onInteriorChange(this.interiorId);
              break;
            }
          }
        }
        // walk-out: step into the doorway gap at the bottom wall to leave —
        // no key press needed (mirrors the walk-in entrances outside).
        // Only the GROUND floor has a front door; upstairs you must walk down.
        if (
          this.interiorId === this.groundFloorId &&
          this.py > ((geo?.h ?? ROOM_H) - 2.1) * 32 + (this.swimming ? 90 : 0) &&
          Math.abs(this.px - gw / 2) < (this.swimming ? 100 : 40)
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }`);

// ---------- room names + furniture nearby ----------
rep(`    const areaName = this.interiorId
      ? interiors[this.interiorId]?.name ?? "Inside"
      : area?.name ?? "Warrior Territories";`,
`    const areaName = this.interiorId
      ? this.roomNameAt(interiors[this.interiorId], this.px, this.py)
      : area?.name ?? "Warrior Territories";`);

rep(`      const room = interiors[this.interiorId];
      for (const prop of room.props) {
        const pp = propPx(room.id, prop);
        const d = Math.hypot(pp.x - this.px, pp.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: prop.label };
        }
      }`,
`      const room = interiors[this.interiorId];
      for (const prop of room.props) {
        const pp = propPx(room.id, prop);
        const d = Math.hypot(pp.x - this.px, pp.y - this.py);
        if (d < bestD) {
          bestD = d;
          // furniture is interactive: E performs the real cat action
          near = {
            kind: "object",
            label: prop.label,
            interact: (prop.interact ?? defaultFurnitureAction(prop.style)) as unknown as InteractableKind,
          };
        }
      }`);

// ---------- furnitureAction + roomNameAt methods (before enterInterior) ----------
rep(`  enterInterior(id: string, fromObj?: { x: number; y: number; w: number; h: number; id?: string }) {`,
`  /** "I am in the kitchen": the room label for the player's current cell. */
  private roomNameAt(room: InteriorDef | undefined, px: number, py: number): string {
    if (!room) return "Inside";
    const cx = Math.floor(px / 32);
    const cy = Math.floor(py / 32);
    for (const z of room.rooms ?? []) {
      if (cx >= z.x0 && cx <= z.x1 && cy >= z.y0 && cy <= z.y1) return z.name;
    }
    return room.name;
  }

  /**
   * Interactive furniture (spec: objects actually do things). The cat
   * performs the REAL animation — never a text-only stub.
   */
  furnitureAction(kind: string): string | null {
    switch (kind) {
      case "f-sleep":
        this.setPose("sleep", 10);
        return "You curl up on the softness and drift into a warm doze.";
      case "f-lie":
        this.setPose("lie", 6);
        return "You flop down where it's soft and let your fur sink in.";
      case "f-sit":
        this.setPose("sit", 5);
        return "You settle in comfortably and tuck your paws under you.";
      case "f-groom":
        this.startEmote("groom");
        return "You groom the dust of the street off your fur.";
      case "f-eat":
        this.eat(25);
        this.engineSfx("eat", { volume: 0.6, throttleMs: 800 });
        return "Crunch, crunch. The Twolegs' bowl food isn't fresh-kill, but it fills the belly.";
      case "f-drink":
        this.drink();
        this.engineSfx("drink", { volume: 0.5, throttleMs: 800 });
        return "You lap up the cool water.";
      case "f-play":
        this.startEmote("play");
        return "You bat the toy around like true prey. Somewhere, a warrior would judge you.";
      case "f-look":
        this.startEmote("look");
        return "You watch the world move beyond the glass.";
      case "f-sniff":
        this.startEmote("sniff");
        return "You sniff carefully. Interesting. Twoleg-things smell of everything at once.";
      case "f-hide":
        this.setPose("crouch", 4);
        return "You squeeze inside. Nothing can see you now.";
      case "f-scratch":
        this.startEmote("scratch");
        return "You scratch that itch just right.";
      case "f-warm":
        this.setPose("lie", 6);
        return "The leftover warmth soaks into your fur.";
      default:
        return null;
    }
  }

  enterInterior(id: string, fromObj?: { x: number; y: number; w: number; h: number; id?: string }) {`);

fs.writeFileSync(p, src);
if (bad > 0) {
  console.error(`patch100 FAILED with ${bad} bad anchors — file NOT written`);
  process.exit(1);
}
console.log("patch100 OK — floor-plan infrastructure installed");
