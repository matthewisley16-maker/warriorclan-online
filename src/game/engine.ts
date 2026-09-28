// WarriorCatsRPG — canvas engine: renders the four-Clan world, simulates the
// player, NPC schedules, prey AI, day/night, weather, multiplayer remotes,
// emotes, and interior rooms.

import {
  allObjects,
  areaAt,
  areas,
  campWall,
  CAMP_CENTER,
  CAMP_RADIUS,
  flora,
  GROUND_CELL,
  GROUND_COLS,
  GROUND_ROWS,
  groundMap,
  isSolidPoint,
  npcs,
  preyZones,
  trees,
  type GroundKind,
  WORLD_H,
  WORLD_W,
  type InteractableKind,
  type NPCDef,
  type PreyKind,
} from "./world";
import { TP_Y, clearTraffic, drawTunnelPortal, drawVehicle, respawnBothDirections, trafficList, updateTraffic, vehicleLaneY } from "./traffic";
/** Render-path traffic timestep fallback (wired from the update loop below). */
let dt = 0.016;
import {
  drawBarn,
  drawCat,
  drawCave,
  drawFence,
  drawFlowerBed,
  drawFreshKillPile,
  drawHerbPatch,
  drawDenEntrance,
  drawHouse,
  drawPrey,
  drawReeds,
  drawTallRock,
  type CatPose,
  type CatSkin,
  type PreySprite,
} from "./draw";

export interface NearbyTarget {
  kind: "object" | "npc" | "prey" | "remote";
  label: string;
  interact?: InteractableKind;
  npcId?: string;
  interior?: string;
  preyId?: string;
  remoteUserId?: string;
}

export interface RemotePlayer {
  userId: string;
  catName: string;
  clan?: string;
  rank?: string;
  appearance: CatSkin;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  emote?: string;
  /** synchronized movement state: derived from velocity by the SENDER */
  movementState?: MovementState;
  /** synchronized animation state: idle/walk/crouch/sit/... (never frames) */
  animationState?: CatPose;
  // server authority metadata (ordering + staleness rejection)
  serverTick?: number;
  stateVersion?: number;
  lastProcessedInput?: number;
}

export type MovementState = "idle" | "walk" | "run" | "crouch";

interface RemoteRenderState {
  x: number;
  y: number;
  facing: number;
  /** pose to draw right now (state-driven — never a raw animation frame) */
  pose: CatPose;
  /** monotonic stamp of the newest server state folded into the buffer */
  serverTick: number;
  /** client-receive clock (ms) of the newest buffered server state */
  receivedAt: number;
  /** sliding window of recent valid server states, oldest first */
  buffer: RemoteStateSample[];
  /** anti-blink latch: keep "walk" briefly when movement state flickers */
  walkLatchUntil?: number;
  poseChangedAt?: number;
  /**
   * LOCAL animation clock (performance.now-based ms). Advances every frame at
   * a speed-matched cadence, so remote walk cycles run continuously and are
   * completely decoupled from packet arrival ("state → local animation").
   */
  animMs: number;
  /** measured interpolation speed (px/s) — drives animation cadence */
  lastSpeedPxS: number;
}

interface RemoteStateSample {
  x: number;
  y: number;
  facing: number;
  pose: CatPose;
  serverTick: number;
  /** SERVER wall-clock (Date.now) — packet jitter never touches the timeline */
  receivedAt: number;
}

// interpolation tuning (networking constants, not gameplay tuning)
const REMOTE_INTERP_DELAY_MS = 110; // render this far behind the newest packet
const REMOTE_HARD_SNAP_DIST = 90; // drift beyond this = real desync, glide fast
const REMOTE_BUFFER_MS = 600; // keep this much history for late packets
const REMOTE_EXTRAPOLATE_MS = 220; // coast on velocity at most this long
const REMOTE_MAX_EXTRAP = 26; // never coast farther than this (px)
const REMOTE_SNAP_DIST = 250; // larger desync = authoritative correction
const REMOTE_MAX_CATCHUP = 350; // max convergence speed px/s (anti rubber-band)
const REMOTE_SOFT_CATCHUP = 18; // timeline-follow rate (1/s), dt-scaled
const REMOTE_POSE_LATCH_MS = 450; // hold walk this long after movement stops

export interface ChatBubble {
  name: string;
  text: string;
  until: number;
  x: number;
  y: number;
  /** Which cat this bubble is attached to: "player" or a remote userId. */
  track?: string;
}

export interface GameCallbacks {
  onAreaChange: (name: string, id: string) => void;
  onNearby: (target: NearbyTarget | null) => void;
  onInteract: (target: NearbyTarget) => void;
  onMove: (x: number, y: number) => void;
  onPreyCaught: (kind: PreyKind) => void;
  onClock: (hour: number) => void;
  onWeatherChange: (w: WeatherKind) => void;
  onInteriorChange: (id: string | null) => void;
  /** Rare ambient NPC chatter when a cat is idling near the player. */
  onNpcIdle?: (name: string, line: string) => void;
  /** waypoint distance update: meters + tiles (1 tile = 6 m) + arrived flag */
  onWaypoint?: (info: { meters: number; tiles: number; arrived: boolean }) => void;
  /** The cat died (currently: hit by a car on the Thunderpath). */
  onDeath?: (cause: string, respawn: { x: number; y: number }) => void;
  /** Engine-originated sound (ambient mews, shakes, splashes, hits). */
  onSfx?: (name: import("./audio").EngineSfxName, opts: { volume?: number; throttleMs?: number }) => void;
}

export type WeatherKind =
  | "clear" | "cloudy" | "rain" | "heavy-rain" | "fog" | "storm" | "wind" | "snow";

const WEATHERS: WeatherKind[] = ["clear", "cloudy", "rain", "heavy-rain", "fog", "storm", "wind", "snow"];
const WEATHER_WEIGHTS: number[] = [26, 16, 12, 6, 8, 4, 16, 3];

// Ground palettes: [base, alt] per kind index, and night-dark multiplier.
const GROUND_COLORS: Record<number, [string, string]> = {
  0: ["#3f7d43", "#468749"], // grass
  1: ["#cbb27e", "#d4bc8a"], // sand
  2: ["#3d6f9e", "#467cab"], // water
  3: ["#8d8f93", "#97999e"], // stone
  4: ["#3a3d42", "#43464c"], // paved
  5: ["#35663c", "#3c7043"], // pine floor
  6: ["#96794f", "#a18457"], // dirt
  7: ["#7fa854", "#88b15c"], // moor
  8: ["#4a6350", "#526d59"], // marsh
  9: ["#b3a37c", "#bcaa86"], // riverbank
  10: ["#5c7d4a", "#648753"], // reeds
};

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 0xffffffff;
}

// Ground-kind indexes used for weather tinting (water & paved stay wet-looking).
const GROUND_WATER = 2;
const GROUND_PAVED = 4;

/** Darken/shift a hex color by a factor, for wet-ground tints. */
function tintHex(hex: string, f: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

interface EnvParticle {
  x: number; y: number; vx: number; vy: number; r: number; seed: number;
}

function pickWeather(): WeatherKind {
  const total = WEATHER_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WEATHERS.length; i++) {
    r -= WEATHER_WEIGHTS[i];
    if (r <= 0) return WEATHERS[i];
  }
  return "clear";
}

// ---------------------------------------------------------------------------
// Interiors
// ---------------------------------------------------------------------------

/** Prop styles available inside interior rooms. */
type InteriorPropStyle =
  | "nest" | "herbs" | "stone" | "moss" | "plank" | "hay" | "bowl"
  | "vines" | "toy" | "carpet" | "lamp"
  | "sofa" | "chair" | "table" | "bed" | "cabinet" | "shelf" | "books"
  | "box" | "window" | "plant" | "post" | "blanket";

interface InteriorDef {
  id: string;
  name: string;
  /** wall layout in a 24x18 room of 32px cells; 1 = wall */
  walls: string[];
  props: { id: string; x: number; y: number; label: string; style: InteriorPropStyle }[];
  /** text shown when entering */
  desc: string;
  npcs?: string[]; // npc ids positioned here
}

const ROOM_W = 24;
const ROOM_H = 18;

/** Wall rows for a w x h room with a door in the bottom wall. */
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
}

function emptyRoom(): string[] {
  return roomSized(ROOM_W, ROOM_H);
}

function roomWithDoor(doorSide: "bottom", doorX: number): string[] {
  return roomSized(ROOM_W, ROOM_H);
}

/** Per-interior geometry: floor size, shape and palette. */
interface RoomGeo {
  w: number;
  h: number;
  cave: boolean;
  floor: [string, string, string]; // base, speckle, accent
  wall: [string, string]; // face, top edge
}
const ROOM_GEO: Record<string, RoomGeo> = {
  // Clan dens — natural scooped shapes with earth/sand floors (book: sandy ravine)
  "tc-leader-den":    { w: 16, h: 12, cave: true,  floor: ["#8a7454", "#7c6748", "#6e5a3e"], wall: ["#4a3a28", "#5d4a33"] },
  "tc-medicine-den":  { w: 22, h: 16, cave: true,  floor: ["#7d6a4d", "#6f5e44", "#8a7757"], wall: ["#473723", "#5a4732"] },
  "tc-nursery":       { w: 18, h: 13, cave: true,  floor: ["#9a7f58", "#8a714c", "#a68a60"], wall: ["#4d3a24", "#61492e"] },
  "tc-warriors-den":  { w: 20, h: 15, cave: true,  floor: ["#846c48", "#76603f", "#907854"], wall: ["#423424", "#54432e"] },
  "tc-apprentices-den": { w: 14, h: 11, cave: true, floor: ["#8d7752", "#7d6a46", "#99825c"], wall: ["#463626", "#584631"] },
  "tc-elders-den":    { w: 17, h: 12, cave: false, floor: ["#8c7250", "#7d6444", "#9a805c"], wall: ["#4f3d26", "#63503a"] },
  "wc-warriors-den":  { w: 18, h: 13, cave: false, floor: ["#a5905c", "#968250", "#b19c66"], wall: ["#5d4c30", "#6f5b3c"] },
  "wc-nursery-room":  { w: 14, h: 11, cave: false, floor: ["#ab9662", "#9c8858", "#b7a26c"], wall: ["#604e32", "#725e40"] },
  "wc-elders-room":   { w: 13, h: 10, cave: false, floor: ["#a28d5a", "#937f52", "#ad9764"], wall: ["#5b4a2f", "#6d5a3b"] },
  "rc-warriors-den":  { w: 19, h: 14, cave: true,  floor: ["#6d6f52", "#5f6146", "#7a7c5c"], wall: ["#3c4634", "#4d5842"] },
  "rc-nursery-room":  { w: 14, h: 11, cave: true,  floor: ["#71735a", "#63654c", "#7c7e62"], wall: ["#3d4736", "#4e5944"] },
  "rc-elders-room":   { w: 13, h: 10, cave: false, floor: ["#6a6c50", "#5c5e44", "#757759"], wall: ["#3b4533", "#4c5741"] },
  "sc-warriors-den":  { w: 19, h: 14, cave: true,  floor: ["#4f4a38", "#443f30", "#5a5540"], wall: ["#2e2c20", "#3d3a2c"] },
  "sc-nursery-room":  { w: 14, h: 11, cave: true,  floor: ["#544e3a", "#494433", "#5e5842"], wall: ["#302e22", "#3f3c2e"] },
  "sc-elders-room":   { w: 13, h: 10, cave: true,  floor: ["#4a4534", "#3f3b2c", "#544f3c"], wall: ["#2d2b1f", "#3c392b"] },
  // Twoleg homes — wooden floors, walls to match; different sizes per house
  "rusty-house":      { w: 22, h: 16, cave: false, floor: ["#a8784e", "#9c6e46", "#b48458"], wall: ["#cfc0a4", "#e0d2b8"] },
  "smudge-house":     { w: 17, h: 12, cave: false, floor: ["#b08056", "#a4744d", "#bc8c60"], wall: ["#d8c8ac", "#e6d8be"] },
  "henry-house":      { w: 18, h: 13, cave: false, floor: ["#9c7048", "#8f6642", "#a87a50"], wall: ["#c6b494", "#d6c6a6"] },
  "princess-house":   { w: 16, h: 12, cave: false, floor: ["#c49a68", "#b78e5e", "#d0a672"], wall: ["#e2d4b8", "#efe3c9"] },
  "marmalade-house":  { w: 21, h: 15, cave: false, floor: ["#a07648", "#946d42", "#ac8252"], wall: ["#c8b694", "#d8c8a8"] },
  "ginger-house":     { w: 16, h: 12, cave: false, floor: ["#ac7e50", "#a0744a", "#b88a5a"], wall: ["#d0c0a0", "#ded0b2"] },
  "house-a":          { w: 15, h: 11, cave: false, floor: ["#a87c50", "#9c724a", "#b4865a"], wall: ["#cec0a2", "#ded2b6"] },
  "house-b":          { w: 23, h: 17, cave: false, floor: ["#a2764a", "#966e44", "#ae8256"], wall: ["#c6b694", "#d6c8a8"] },
  "house-c":          { w: 18, h: 13, cave: false, floor: ["#8c6844", "#805f3e", "#987250"], wall: ["#b4a484", "#c4b494"] },
  "house-d":          { w: 20, h: 15, cave: false, floor: ["#b48454", "#a87a4e", "#c0905e"], wall: ["#d4c4a4", "#e2d4b6"] },
  "house-e":          { w: 21, h: 15, cave: false, floor: ["#ae8052", "#a2764c", "#ba8c5c"], wall: ["#d2c2a2", "#e0d2b4"] },
  "rusty-living":     { w: 26, h: 19, cave: false, floor: ["#b08258", "#a4764c", "#bc8e60"], wall: ["#d8c8ac", "#e8dcc2"] },
  "house-f":          { w: 22, h: 16, cave: false, floor: ["#a87c50", "#9c724a", "#b4865a"], wall: ["#cec0a2", "#ded2b6"] },
  "house-g":          { w: 22, h: 17, cave: false, floor: ["#b08454", "#a47a4c", "#bc8e5e"], wall: ["#d4c4a4", "#e2d4b6"] },
  "house-h":          { w: 22, h: 15, cave: false, floor: ["#cfc7b8", "#c3bbaa", "#dbd3c4"], wall: ["#d0c0a0", "#ded0b2"] },
  "house-i":          { w: 20, h: 15, cave: false, floor: ["#a2764a", "#966e44", "#ae8256"], wall: ["#c6b694", "#d6c8a8"] },
  "barn":             { w: 24, h: 18, cave: false, floor: ["#96703f", "#8a6639", "#a27a46"], wall: ["#8a5a3a", "#9c6a46"] },
  "moonstone-cave":   { w: 15, h: 12, cave: true,  floor: ["#5c5e66", "#50525a", "#686a72"], wall: ["#33343c", "#43454f"] },
};

/**
 * Props are authored on a 24x18 design grid; remap them proportionally into
 * each room's real size so nothing lands inside a wall of a smaller room.
 */
function propPx(
  roomId: string,
  prop: { x: number; y: number },
): { x: number; y: number } {
  const geo = ROOM_GEO[roomId];
  const gx = geo ? (prop.x / 24) * geo.w : prop.x;
  const gy = geo ? (prop.y / 18) * geo.h : prop.y;
  return { x: gx * 32 + 16, y: gy * 32 + 16 };
}

export const interiors: Record<string, InteriorDef> = {
  "tc-leader-den": {
    id: "tc-leader-den",
    name: "The Leader's Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest", x: 12, y: 6, label: "Bluestar's moss nest", style: "nest" },
      { id: "moss1", x: 6, y: 10, label: "Soft lichen", style: "moss" },
      { id: "moss2", x: 18, y: 10, label: "Soft lichen", style: "moss" },
      { id: "ld-stone", x: 8, y: 5, label: "Smooth sitting stone", style: "stone" },
      { id: "ld-fern", x: 17, y: 4, label: "Ferns at the den mouth", style: "moss" },
      { id: "ld-moss3", x: 15, y: 11, label: "Fresh moss bedding", style: "moss" },
      { id: "ld-moss4", x: 9, y: 13, label: "Worn lichen", style: "moss" },
      { id: "ld-plank", x: 12, y: 14, label: "Worn rootway", style: "plank" },
      { id: "ld-herb", x: 20, y: 13, label: "Sprigs of catmint", style: "herbs" },
      { id: "ld-stone2", x: 4, y: 7, label: "Cracked stone", style: "stone" },
      { id: "ld-feather", x: 13, y: 3, label: "Feather from StarClan's wings", style: "moss" },
    ],
    desc: "A hidden den behind Tallrock, soft with moss and lichen. Starlight filters through a crack in the stone.",
    npcs: ["bluestar"],
  },
  "tc-medicine-den": {
    id: "tc-medicine-den",
    name: "The Medicine Cat's Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      // separate, labeled herb stores in stone crevices (book herbs)
      { id: "herb-marigold", x: 4, y: 4, label: "Marigold — for wounds", style: "herbs" },
      { id: "herb-catmint", x: 6, y: 4, label: "Catmint — for greencough", style: "herbs" },
      { id: "herb-poppy", x: 8, y: 4, label: "Poppy seeds — for pain", style: "herbs" },
      { id: "herb-cobweb", x: 4, y: 7, label: "Cobwebs — to stop bleeding", style: "moss" },
      { id: "herb-burdock", x: 6, y: 7, label: "Burdock root — for rat bites", style: "herbs" },
      { id: "herb-dock", x: 8, y: 7, label: "Dock — to soothe scratches", style: "herbs" },
      { id: "herb-horsetail", x: 4, y: 10, label: "Horsetail — for infections", style: "herbs" },
      { id: "herb-yarrow", x: 6, y: 10, label: "Yarrow — to expel poison", style: "herbs" },
      { id: "herb-comfrey", x: 8, y: 10, label: "Comfrey — for broken bones", style: "herbs" },
      { id: "herb-chamomile", x: 10, y: 7, label: "Chamomile — for strength", style: "herbs" },
      { id: "herb-feverfew", x: 10, y: 10, label: "Feverfew — for headaches", style: "herbs" },
      { id: "herb-drying", x: 18, y: 4, label: "Herbs drying in the cracks", style: "vines" },
      { id: "herb-storage", x: 20, y: 6, label: "Moss-lined storage crevice", style: "moss" },
      { id: "pool", x: 17, y: 8, label: "Pool of rainwater", style: "stone" },
      { id: "patient-nest", x: 13, y: 4, label: "Patient's nest", style: "nest" },
      { id: "patient-nest-2", x: 16, y: 13, label: "Second patient's nest", style: "nest" },
      { id: "nest", x: 13, y: 11, label: "Spottedleaf's nest", style: "nest" },
      { id: "md-fern", x: 3, y: 13, label: "Ferns shading the entrance", style: "moss" },
      { id: "md-stone", x: 20, y: 10, label: "Flat mixing stone", style: "stone" },
      { id: "md-root", x: 6, y: 13, label: "Roots threading the wall", style: "vines" },
    ],
    desc: "A crevice in the rock, screened by a bramble. Cracks in the stone hold neat stores of herbs — marigold, catmint, poppy seed, cobweb. A smooth pool reflects the sky.",
    npcs: ["spottedleaf"],
  },
  "tc-nursery": {
    id: "tc-nursery",
    name: "The Nursery",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 7, label: "Willowpelt's nest, freshly lined", style: "nest" },
      { id: "nest2", x: 15, y: 7, label: "Brindleface's flattened nest", style: "nest" },
      { id: "nest3", x: 11, y: 12, label: "Frostfur's nest, moss heaped high", style: "nest" },
      { id: "nest4", x: 17, y: 12, label: "Speckletail's worn nest", style: "nest" },
      { id: "kit-moss", x: 9, y: 13, label: "Kits' moss-ball pile", style: "moss" },
      { id: "kit-toy", x: 19, y: 7, label: "A stray bundle of moss for the kits", style: "moss" },
      { id: "feathers", x: 18, y: 12, label: "Feathers and moss for lining", style: "moss" },
      { id: "feathers-2", x: 6, y: 4, label: "Soft pigeon feathers", style: "moss" },
      { id: "bramble", x: 12, y: 3, label: "Protective bramble screen", style: "plank" },
      { id: "fern", x: 5, y: 10, label: "Ferns for warmth", style: "moss" },
    ],
    desc: "The deepest, best-guarded den in camp, lined with feathers and moss. Kits tumble over their sleeping mothers.",
    npcs: ["willowpelt"],
  },
  "tc-warriors-den": {
    id: "tc-warriors-den",
    name: "The Warriors' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 7, y: 6, label: "Lionheart's neatly arranged nest", style: "nest" },
      { id: "nest2", x: 12, y: 6, label: "Tigerclaw's nest, tightly packed", style: "nest" },
      { id: "nest3", x: 17, y: 6, label: "Whitestorm's nest, feathers on top", style: "nest" },
      { id: "nest4", x: 7, y: 11, label: "Darkstripe's flattened nest", style: "nest" },
      { id: "nest5", x: 17, y: 11, label: "Longtail's half-made nest", style: "nest" },
      { id: "nest6", x: 12, y: 14, label: "Spare nest, freshly mossed", style: "nest" },
      { id: "wd-moss-cache", x: 5, y: 14, label: "Stack of spare moss", style: "moss" },
      { id: "wd-twigs", x: 20, y: 13, label: "Twigs woven in the walls", style: "vines" },
      { id: "wd-stone", x: 20, y: 4, label: "Stone propping the thorns", style: "stone" },
      { id: "wd-leaf", x: 4, y: 4, label: "Fallen leaves in the corner", style: "moss" },
      { id: "wd-feather", x: 14, y: 9, label: "A starling feather", style: "moss" },
      { id: "wd-root", x: 9, y: 9, label: "Root crossing the floor", style: "vines" },
    ],
    desc: "A dark, tangled thornbush. Inside, moss-lined nests are packed tight — the first line of defense if the camp is attacked.",
    npcs: ["lionheart", "tigerclaw"],
  },
  "tc-apprentices-den": {
    id: "tc-apprentices-den",
    name: "The Apprentices' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 9, y: 7, label: "Graypaw's untidy nest", style: "nest" },
      { id: "nest2", x: 14, y: 7, label: "Sandpaw's neat nest", style: "nest" },
      { id: "nest3", x: 11, y: 12, label: "Dustpaw's nest, moss everywhere", style: "nest" },
      { id: "nest4", x: 16, y: 12, label: "Ravenpaw's nest, hidden in the corner", style: "nest" },
      { id: "ad-moss", x: 5, y: 11, label: "Stolen moss pile (Dustpaw)", style: "moss" },
      { id: "ad-twigs", x: 19, y: 5, label: "Practice pounce twigs", style: "plank" },
      { id: "ad-feather", x: 6, y: 4, label: "Feather for a game of catch", style: "moss" },
      { id: "ad-leaf", x: 20, y: 10, label: "Crisped leaves, never cleared", style: "moss" },
      { id: "ad-stone", x: 12, y: 9, label: "Stones the apprentices stack", style: "stone" },
    ],
    desc: "A bramble thicket, warm with the smell of young cats. The apprentices' moss nests are never tidy.",
    npcs: ["graypaw", "sandpaw"],
  },
  "tc-elders-den": {
    id: "tc-elders-den",
    name: "The Elders' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 8, label: "Halftail's nest, worn thin", style: "nest" },
      { id: "nest2", x: 16, y: 8, label: "Smallear's nest, perfectly molded", style: "nest" },
      { id: "nest3", x: 12, y: 13, label: "Patchpelt's nest by the entrance", style: "nest" },
      { id: "ivy", x: 12, y: 5, label: "Ivy-draped walls", style: "vines" },
      { id: "ed-moss", x: 6, y: 12, label: "Fresh moss, the apprentices' duty", style: "moss" },
      { id: "ed-stone", x: 19, y: 12, label: "Stone for aching joints", style: "stone" },
      { id: "ed-leaves", x: 5, y: 5, label: "Old dry leaves in the corners", style: "moss" },
      { id: "ed-root", x: 18, y: 4, label: "Roots of the fallen log", style: "vines" },
      { id: "ed-tick", x: 14, y: 10, label: "Mouse-bile for ticks", style: "herbs" },
    ],
    desc: "A fallen log draped in ivy. The elders swap stories of battles and prophecies, and complain about the damp.",
    npcs: ["halftail"],
  },
  // ---------------------------------------------------------------------------
  // Other Clan dens — each reflects its Clan's environment and the first book.
  // ---------------------------------------------------------------------------
  // WindClan: open moor — gorse, heather, wide sky. Airy, wind-swept dens.
  "wc-warriors-den": {
    id: "wc-warriors-den",
    name: "WindClan Warriors' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 6, label: "Tallstar's nest, wind-dried moss", style: "nest" },
      { id: "nest2", x: 13, y: 6, label: "Mudclaw's tight-packed nest", style: "nest" },
      { id: "nest3", x: 18, y: 6, label: "Deadfoot's nest, heather-lined", style: "nest" },
      { id: "nest4", x: 8, y: 11, label: "Runningwind's nest, never slept in", style: "nest" },
      { id: "wcd-heather", x: 18, y: 11, label: "Heather sprigs for bedding", style: "moss" },
      { id: "wcd-moss", x: 5, y: 14, label: "Spare moor-moss", style: "moss" },
      { id: "wcd-stone", x: 20, y: 4, label: "Flat stone for pelts", style: "stone" },
      { id: "wcd-leaf", x: 4, y: 4, label: "Wind-blown leaves in the corner", style: "moss" },
    ],
    desc: "A shallow scoop ringed by gorse. Wind combs through the heather-lined nests day and night.",
    npcs: ["tallstar"],
  },
  "wc-nursery-room": {
    id: "wc-nursery-room",
    name: "WindClan Nursery",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 7, label: "A WindClan queen's heather nest", style: "nest" },
      { id: "nest2", x: 16, y: 7, label: "Second nest, wool-soft lining", style: "nest" },
      { id: "wcn-moss", x: 12, y: 12, label: "Dried grass for lining", style: "moss" },
      { id: "wcn-flower", x: 6, y: 12, label: "Chamomile for strength", style: "herbs" },
      { id: "wcn-stone", x: 19, y: 12, label: "Sun-warmed stone", style: "stone" },
      { id: "wcn-leaf", x: 5, y: 4, label: "Moor grass in the walls", style: "vines" },
    ],
    desc: "An open heather-shaded hollow, warm with sun and the milk-scent of nursing kits.",
    npcs: [],
  },
  "wc-elders-room": {
    id: "wc-elders-room",
    name: "WindClan Elders' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 8, label: "A WindClan elder's shallow nest", style: "nest" },
      { id: "nest2", x: 16, y: 9, label: "Worn nest, repaired many times", style: "nest" },
      { id: "wce-moss", x: 12, y: 12, label: "Fresh moss from the moor", style: "moss" },
      { id: "wce-tick", x: 6, y: 5, label: "Mouse-bile for ticks", style: "herbs" },
      { id: "wce-stone", x: 19, y: 5, label: "Warm stone for stiff joints", style: "stone" },
    ],
    desc: "A low gorse chamber where old runners trade stories of borders and battles.",
    npcs: ["barkface"],
  },
  // RiverClan: cool, damp, green-lit dens with reed screens and shell-littered floors
  "rc-warriors-den": {
    id: "rc-warriors-den",
    name: "RiverClan Warriors' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 6, label: "Crookedstar's nest, dry reeds", style: "nest" },
      { id: "nest2", x: 13, y: 6, label: "Blackclaw's nest, shells pressed in", style: "nest" },
      { id: "nest3", x: 18, y: 6, label: "Leopardfur's nest, braided rushes", style: "nest" },
      { id: "nest4", x: 8, y: 11, label: "Heavystep's nest by the reed wall", style: "nest" },
      { id: "rcd-reed", x: 18, y: 11, label: "Woven reed screen", style: "vines" },
      { id: "rcd-shell", x: 5, y: 14, label: "Dried shells and river pebbles", style: "stone" },
      { id: "rcd-drift", x: 20, y: 4, label: "Smooth driftwood perch", style: "plank" },
      { id: "rcd-moss", x: 4, y: 4, label: "Riverbank moss", style: "moss" },
    ],
    desc: "A dry chamber behind the reed beds. The floor is scattered with shells; the river murmurs beyond the wall.",
    npcs: ["crookedstar"],
  },
  "rc-nursery-room": {
    id: "rc-nursery-room",
    name: "RiverClan Nursery",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 7, label: "A queen's nest lined with willow fluff", style: "nest" },
      { id: "nest2", x: 16, y: 7, label: "Second nest, feather-soft", style: "nest" },
      { id: "rcn-reed", x: 12, y: 12, label: "Reed lining, freshly woven", style: "vines" },
      { id: "rcn-stone", x: 6, y: 12, label: "Warm river stone", style: "stone" },
      { id: "rcn-bowl", x: 19, y: 12, label: "Splash-pool for kits", style: "bowl" },
      { id: "rcn-leaf", x: 5, y: 4, label: "Draped reeds at the entrance", style: "vines" },
    ],
    desc: "A sheltered den among the reeds, always faintly damp and cool, safe from the river's floods.",
    npcs: [],
  },
  "rc-elders-room": {
    id: "rc-elders-room",
    name: "RiverClan Elders' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 8, label: "An elder's reed-woven nest", style: "nest" },
      { id: "nest2", x: 16, y: 8, label: "Deep nest, patched with sedge", style: "nest" },
      { id: "rce-shell", x: 12, y: 12, label: "Shells collected over seasons", style: "stone" },
      { id: "rce-tick", x: 6, y: 5, label: "Mouse-bile store", style: "herbs" },
      { id: "rce-stone", x: 19, y: 5, label: "Sun-baked stone", style: "stone" },
    ],
    desc: "A quiet reed hall where old fisher-cats gossip about the river's moods.",
    npcs: [],
  },
  // ShadowClan: cold pine hollow — needle beds, pine-root walls, marsh damp
  "sc-warriors-den": {
    id: "sc-warriors-den",
    name: "ShadowClan Warriors' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 6, label: "Brokenstar's nest, bracken and pine", style: "nest" },
      { id: "nest2", x: 13, y: 6, label: "Blackfoot's nest, packed hard", style: "nest" },
      { id: "nest3", x: 18, y: 6, label: "A warrior's nest in pine needles", style: "nest" },
      { id: "nest4", x: 8, y: 11, label: "Nest under the root shelf", style: "nest" },
      { id: "scd-root", x: 18, y: 11, label: "Pine roots arching the roof", style: "vines" },
      { id: "scd-needle", x: 5, y: 14, label: "Pine-needle bedding store", style: "moss" },
      { id: "scd-stone", x: 20, y: 4, label: "Cold standing stone", style: "stone" },
      { id: "scd-branch", x: 4, y: 4, label: "Fallen pine branch", style: "plank" },
    ],
    desc: "A hollow beneath gnarled pine roots. Pine needles rustle; the dark gives ShadowClan cats comfort.",
    npcs: ["brokenstar"],
  },
  "sc-nursery-room": {
    id: "sc-nursery-room",
    name: "ShadowClan Nursery",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 7, label: "A queen's nest in dried bracken", style: "nest" },
      { id: "nest2", x: 16, y: 7, label: "Second nest, deep and dark", style: "nest" },
      { id: "scn-needle", x: 12, y: 12, label: "Pine-needle lining", style: "moss" },
      { id: "scn-leaf", x: 6, y: 12, label: "Draped brambles for privacy", style: "vines" },
      { id: "scn-stone", x: 19, y: 12, label: "Flat stone for kits to play on", style: "stone" },
      { id: "scn-herb", x: 5, y: 4, label: "Marigold sprigs, a gift from the medicine den", style: "herbs" },
    ],
    desc: "A bramble-hid den in the pine hollow, warm in its darkness and fiercely guarded.",
    npcs: [],
  },
  "sc-elders-room": {
    id: "sc-elders-room",
    name: "ShadowClan Elders' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 8, label: "An elder's nest, generations old", style: "nest" },
      { id: "nest2", x: 16, y: 8, label: "Nest lined with marsh moss", style: "nest" },
      { id: "sce-root", x: 12, y: 12, label: "Roots of the old pine above", style: "vines" },
      { id: "sce-tick", x: 6, y: 5, label: "Mouse-bile for ticks", style: "herbs" },
      { id: "sce-stone", x: 19, y: 5, label: "Moss-cushioned stone", style: "stone" },
    ],
    desc: "A dim shelter beneath a leaning pine. Old ShadowClan cats mutter of marshes and old feuds.",
    npcs: [],
  },
  "moonstone-cave": {
    id: "moonstone-cave",
    name: "Mothermouth",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "stone", x: 12, y: 5, label: "The Moonstone", style: "stone" },
      { id: "moss1", x: 4, y: 9, label: "Damp stone", style: "moss" },
      { id: "moss2", x: 20, y: 9, label: "Damp stone", style: "moss" },
    ],
    desc: "Deep under Highstones, a single crystal burns with cold silver light. StarClan is close here.",
    npcs: [],
  },
  "rusty-house": {
    id: "rusty-house",
    name: "Rusty's Twoleg Nest",
    walls: roomWithDoor("bottom", 12),
    props: [
      // living room + kitchen + hallway in one small nest
      { id: "rh-carpet", x: 12, y: 9, label: "Worn rug by the fire", style: "carpet" },
      { id: "rh-sofa", x: 17, y: 7, label: "Twoleg sleeping-soft (sofa)", style: "sofa" },
      { id: "rh-chair", x: 7, y: 5, label: "Twoleg perch (chair)", style: "chair" },
      { id: "rh-table", x: 12, y: 5, label: "Twoleg eating-table", style: "table" },
      { id: "rh-lamp", x: 19, y: 12, label: "Glowing lamp", style: "lamp" },
      { id: "rh-counter", x: 5, y: 10, label: "Kitchen counter", style: "cabinet" },
      { id: "bowl", x: 6, y: 8, label: "Your food bowl", style: "bowl" },
      { id: "bowl2", x: 8, y: 8, label: "Water bowl", style: "bowl" },
      { id: "rh-toy", x: 14, y: 12, label: "A woolly mouse toy", style: "toy" },
      { id: "rh-toy2", x: 10, y: 13, label: "Rolling twoleg ball", style: "toy" },
      { id: "rh-cushion", x: 15, y: 10, label: "Soft cushion", style: "blanket" },
      { id: "rh-books", x: 19, y: 4, label: "Twoleg leaf-clusters (books)", style: "books" },
      { id: "rh-window", x: 4, y: 13, label: "Sunny window ledge", style: "window" },
    ],
    desc: "Warm, soft, and safe — and unbearably small. The Twolegs are out; the garden door is open.",
    npcs: [],
  },
  "smudge-house": {
    id: "smudge-house",
    name: "Smudge's Cozy Home",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "sh-carpet", x: 12, y: 8, label: "Thick soft carpet", style: "carpet" },
      { id: "sh-bed", x: 12, y: 5, label: "Smudge's plush cat bed", style: "nest" },
      { id: "sh-bowl", x: 7, y: 7, label: "Food bowl, always full", style: "bowl" },
      { id: "sh-bowl2", x: 9, y: 7, label: "Fresh water bowl", style: "bowl" },
      { id: "sh-toy", x: 15, y: 9, label: "Feather wand toy", style: "toy" },
      { id: "sh-toy2", x: 16, y: 11, label: "Catnip mouse", style: "toy" },
      { id: "sh-toy3", x: 9, y: 12, label: "Jingly ball", style: "toy" },
      { id: "sh-sofa", x: 18, y: 6, label: "Twoleg sofa", style: "sofa" },
      { id: "sh-lamp", x: 5, y: 12, label: "Warm reading lamp", style: "lamp" },
      { id: "sh-window", x: 19, y: 13, label: "Window over the garden", style: "window" },
    ],
    desc: "Smudge's Twolegs dote on him. Toys everywhere, a plush bed, and the best view of the garden.",
    npcs: [],
  },
  "henry-house": {
    id: "henry-house",
    name: "Henry's House",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hh-bed", x: 8, y: 5, label: "Henry's large cat bed", style: "nest" },
      { id: "hh-post", x: 16, y: 6, label: "Tall scratching post", style: "post" },
      { id: "hh-bowl", x: 7, y: 9, label: "Food bowl", style: "bowl" },
      { id: "hh-bowl2", x: 9, y: 9, label: "Water bowl", style: "bowl" },
      { id: "hh-toy", x: 13, y: 11, label: "Springy toy", style: "toy" },
      { id: "hh-toy2", x: 15, y: 12, label: "Crinkle ball", style: "toy" },
      { id: "hh-carpet", x: 11, y: 8, label: "Hearth rug", style: "carpet" },
      { id: "hh-shelf", x: 19, y: 5, label: "Twoleg shelf of curious objects", style: "shelf" },
      { id: "hh-table", x: 6, y: 13, label: "Kitchen table", style: "table" },
      { id: "hh-lamp", x: 20, y: 12, label: "Corner lamp", style: "lamp" },
    ],
    desc: "Henry's Twolegs keep a tidy house with a scratching post he is too dignified to use.",
    npcs: [],
  },
  "princess-house": {
    id: "princess-house",
    name: "Princess's Sunny House",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "ph-window", x: 12, y: 4, label: "Wide sunny windowsill", style: "window" },
      { id: "ph-bed", x: 12, y: 6, label: "Princess's cushioned bed", style: "nest" },
      { id: "ph-plant", x: 6, y: 5, label: "Houseplants (not for eating)", style: "moss" },
      { id: "ph-plant2", x: 18, y: 5, label: "Fern on a stand", style: "moss" },
      { id: "ph-bowl", x: 8, y: 10, label: "Porcelain food bowl", style: "bowl" },
      { id: "ph-bowl2", x: 10, y: 10, label: "Porcelain water bowl", style: "bowl" },
      { id: "ph-carpet", x: 13, y: 10, label: "Pale delicate carpet", style: "carpet" },
      { id: "ph-shelf", x: 19, y: 9, label: "Shelves of twoleg ornaments", style: "shelf" },
      { id: "ph-toy", x: 16, y: 12, label: "A single dignified toy", style: "toy" },
      { id: "ph-chair", x: 6, y: 12, label: "Upholstered chair", style: "chair" },
    ],
    desc: "Bright, quiet, and full of sun. Princess's Twolegs keep an immaculate, gentle home.",
    npcs: [],
  },
  "marmalade-house": {
    id: "marmalade-house",
    name: "Marmalade's House",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "mh-bed", x: 10, y: 6, label: "Marmalade's worn barn-style bed", style: "nest" },
      { id: "mh-blanket", x: 14, y: 6, label: "Piled blankets", style: "blanket" },
      { id: "mh-box", x: 17, y: 8, label: "A twoleg box (his favorite)", style: "box" },
      { id: "mh-box2", x: 19, y: 10, label: "Another box (also his)", style: "box" },
      { id: "mh-bowl", x: 6, y: 8, label: "Food bowl, licked clean", style: "bowl" },
      { id: "mh-bowl2", x: 8, y: 8, label: "Water bowl", style: "bowl" },
      { id: "mh-toy", x: 12, y: 11, label: "Chewed toy mouse", style: "toy" },
      { id: "mh-toy2", x: 9, y: 13, label: "Ball under the table", style: "toy" },
      { id: "mh-table", x: 12, y: 9, label: "Heavy wooden table", style: "table" },
      { id: "mh-counter", x: 5, y: 12, label: "Kitchen counter to spy from", style: "cabinet" },
      { id: "mh-lamp", x: 19, y: 13, label: "Kitchen lamp", style: "lamp" },
    ],
    desc: "A big, busy kitchen-house. Marmalade rules it from the top of the table and naps in boxes.",
    npcs: [],
  },
  "ginger-house": {
    id: "ginger-house",
    name: "Ginger's House",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "gh-bed", x: 8, y: 6, label: "Ginger's traveling basket bed", style: "nest" },
      { id: "gh-carpet", x: 12, y: 9, label: "Bright patterned rug", style: "carpet" },
      { id: "gh-bowl", x: 7, y: 10, label: "Food bowl", style: "bowl" },
      { id: "gh-bowl2", x: 9, y: 10, label: "Water bowl", style: "bowl" },
      { id: "gh-toy", x: 14, y: 7, label: "Dangling feather toy", style: "toy" },
      { id: "gh-toy2", x: 16, y: 12, label: "Stuffed fish", style: "toy" },
      { id: "gh-books", x: 19, y: 5, label: "Stacked twoleg scrolls (books)", style: "books" },
      { id: "gh-sofa", x: 17, y: 8, label: "Long sofa", style: "sofa" },
      { id: "gh-lamp", x: 5, y: 5, label: "Hallway lamp", style: "lamp" },
      { id: "gh-window", x: 4, y: 12, label: "Front-window perch", style: "window" },
    ],
    desc: "A well-walked house with a view of the whole street — Ginger patrols it twice a day.",
    npcs: [],
  },
  // ---------------------------------------------------------------------------
  // Twoleg house archetypes A-E. Genuinely different floor plans and
  // furnishings — House A: snug living room + kitchen nook; B: large lounge,
  // separate bedrooms; C: cluttered old house, storage; D: kittypet-focused;
  // E: hallway + two bedrooms + sunroom. No two layouts match.
  // ---------------------------------------------------------------------------
  "house-a": {
    id: "house-a",
    name: "A Snug Twoleg Nest",
    walls: roomWithDoor("bottom", 12),
    props: [
      // small living room (west) with a hearth
      { id: "ha-rug", x: 7, y: 8, label: "Round braided rug", style: "carpet" },
      { id: "ha-armchair", x: 4, y: 5, label: "Worn armchair", style: "chair" },
      { id: "ha-lamp", x: 4, y: 10, label: "Floor lamp", style: "lamp" },
      { id: "ha-books", x: 20, y: 4, label: "Twoleg leaf-clusters (books)", style: "books" },
      // tiny kitchen nook (northeast)
      { id: "ha-counter", x: 18, y: 5, label: "Kitchen counter", style: "cabinet" },
      { id: "ha-counter2", x: 20, y: 7, label: "Cupboard with clinking dishes", style: "cabinet" },
      { id: "ha-bowl", x: 16, y: 6, label: "Kittypet food bowl", style: "bowl" },
      { id: "ha-bowl2", x: 17, y: 7, label: "Water bowl", style: "bowl" },
      // kittypet corner
      { id: "ha-bed", x: 12, y: 6, label: "Cushioned cat bed by the warmth", style: "nest" },
      { id: "ha-toy", x: 10, y: 11, label: "Lost ball under the table", style: "toy" },
      { id: "ha-table", x: 12, y: 11, label: "Small eating-table", style: "table" },
      { id: "ha-window", x: 8, y: 13, label: "Window over the yard", style: "window" },
    ],
    desc: "A small, warm nest. Twoleg scents of toast and laundry; a kettle ticks on the counter.",
    npcs: [],
  },
  "house-b": {
    id: "house-b",
    name: "A Grand Twoleg Nest",
    walls: roomWithDoor("bottom", 12),
    props: [
      // large lounge (center-south)
      { id: "hb-sofa", x: 7, y: 10, label: "Long velvet sofa", style: "sofa" },
      { id: "hb-sofa2", x: 17, y: 12, label: "Matching loveseat", style: "sofa" },
      { id: "hb-table", x: 12, y: 10, label: "Low table with a twoleg picture-box (TV)", style: "table" },
      { id: "hb-rug", x: 12, y: 11, label: "Huge soft rug", style: "carpet" },
      { id: "hb-lamp", x: 5, y: 13, label: "Standing lamp", style: "lamp" },
      { id: "hb-shelf", x: 20, y: 4, label: "Shelves of ornaments", style: "shelf" },
      // bedroom corner (northwest)
      { id: "hb-bed", x: 4, y: 4, label: "Twoleg sleeping-nest (bed)", style: "bed" },
      { id: "hb-blanket", x: 6, y: 5, label: "Heaped blankets", style: "blanket" },
      { id: "hb-drawer", x: 8, y: 4, label: "Wooden drawers", style: "cabinet" },
      // kitchen strip (northeast)
      { id: "hb-counter", x: 16, y: 4, label: "Polished counter", style: "cabinet" },
      { id: "hb-cabinet", x: 20, y: 7, label: "Tall cabinet", style: "cabinet" },
      { id: "hb-bowl", x: 14, y: 6, label: "Food bowl", style: "bowl" },
      { id: "hb-bowl2", x: 15, y: 7, label: "Water bowl", style: "bowl" },
      { id: "hb-toy", x: 10, y: 8, label: "Cat tunnel of crinkly paper", style: "toy" },
    ],
    desc: "A big family nest — two sofas, a picture-box, and endless warm smells from the kitchen.",
    npcs: [],
  },
  "house-c": {
    id: "house-c",
    name: "An Old Twoleg Nest",
    walls: roomWithDoor("bottom", 12),
    props: [
      // cluttered storage feel: boxes everywhere, old furniture
      { id: "hc-box", x: 5, y: 5, label: "Stacked cardboard boxes", style: "box" },
      { id: "hc-box2", x: 6, y: 7, label: "Box with a cat-sized hole", style: "box" },
      { id: "hc-box3", x: 19, y: 5, label: "More boxes, dust on top", style: "box" },
      { id: "hc-chair", x: 12, y: 5, label: "Broken-backed chair", style: "chair" },
      { id: "hc-dresser", x: 4, y: 11, label: "Scuffed old dresser", style: "cabinet" },
      { id: "hc-rug", x: 12, y: 9, label: "Faded threadbare rug", style: "carpet" },
      { id: "hc-cabinet", x: 20, y: 9, label: "Paint-peeling cabinet", style: "cabinet" },
      { id: "hc-bowl", x: 8, y: 12, label: "Chipped food bowl", style: "bowl" },
      { id: "hc-bowl2", x: 9, y: 13, label: "Stained water bowl", style: "bowl" },
      { id: "hc-lamp", x: 18, y: 12, label: "Flickering corner lamp", style: "lamp" },
      { id: "hc-plant", x: 16, y: 6, label: "Leggy houseplant, half-wild", style: "moss" },
    ],
    desc: "A quiet old nest full of boxes and dust-shapes. Something small rustles behind the dresser.",
    npcs: [],
  },
  "house-d": {
    id: "house-d",
    name: "A Kittypet's Paradise",
    walls: roomWithDoor("bottom", 12),
    props: [
      // completely cat-focused home
      { id: "hd-tower", x: 6, y: 5, label: "Floor-to-ceiling cat tree", style: "post" },
      { id: "hd-post", x: 9, y: 4, label: "Second scratching post (well used)", style: "post" },
      { id: "hd-bed", x: 12, y: 5, label: "Round quilted cat bed", style: "nest" },
      { id: "hd-bed2", x: 18, y: 6, label: "Window-hammock bed", style: "nest" },
      { id: "hd-toy", x: 8, y: 8, label: "Pompoms in a basket", style: "toy" },
      { id: "hd-toy2", x: 15, y: 8, label: "Feather teaser on a stick", style: "toy" },
      { id: "hd-toy3", x: 17, y: 11, label: "Wind-up mouse", style: "toy" },
      { id: "hd-bowl", x: 5, y: 11, label: "Raised food bowl stand", style: "bowl" },
      { id: "hd-bowl2", x: 7, y: 12, label: "Water fountain, always running", style: "bowl" },
      { id: "hd-blanket", x: 12, y: 12, label: "Pile of fleece blankets", style: "blanket" },
      { id: "hd-sofa", x: 18, y: 13, label: "Sofa with a cat-shaped dent", style: "sofa" },
      { id: "hd-lamp", x: 4, y: 8, label: "Sunset-colored lamp", style: "lamp" },
    ],
    desc: "Every corner belongs to the cats here — towers, hammocks, a running water fountain, toys underfoot.",
    npcs: [],
  },
  "house-e": {
    id: "house-e",
    name: "A Sunny Twoleg Nest",
    walls: roomWithDoor("bottom", 12),
    props: [
      // hallway + two bedrooms + sunroom layout
      { id: "he-runner", x: 12, y: 9, label: "Long hallway runner rug", style: "carpet" },
      { id: "he-bed", x: 5, y: 4, label: "First bedroom's bed", style: "bed" },
      { id: "he-nightstand", x: 8, y: 5, label: "Nightstand with a ticking clock", style: "cabinet" },
      { id: "he-bed2", x: 5, y: 12, label: "Second bedroom's bed", style: "bed" },
      { id: "he-drawer", x: 8, y: 13, label: "Drawers of folded twoleg pelts", style: "cabinet" },
      // sunroom (east)
      { id: "he-window", x: 19, y: 4, label: "Sunroom glass, warm with light", style: "window" },
      { id: "he-window2", x: 20, y: 7, label: "Another wide pane", style: "window" },
      { id: "he-plant", x: 17, y: 5, label: "Potted fern", style: "moss" },
      { id: "he-plant2", x: 19, y: 10, label: "Tall palm in a clay pot", style: "moss" },
      { id: "he-chair", x: 16, y: 8, label: "Wicker sun chair", style: "chair" },
      { id: "he-bowl", x: 11, y: 6, label: "Food bowl by the hallway", style: "bowl" },
      { id: "he-bowl2", x: 13, y: 7, label: "Water bowl", style: "bowl" },
      { id: "he-lamp", x: 10, y: 11, label: "Hall lamp", style: "lamp" },
    ],
    desc: "A bright nest with a glass sunroom. Dust motes drift over two bedrooms and a warm hallway.",
    npcs: [],
  },
  // --- Twoleg interiors added in the world-scale upgrade: every house on
  // Smudge's street now has its own intentional floor plan (props are on the
  // 24x18 design grid and remap proportionally per room). ---
  "rusty-living": {
    id: "rusty-living",
    name: "Rusty's Front Room",
    desc: "Sunlight through lace curtains, a worn armchair, and a curled mat by the door.",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "rl-carpet", x: 11, y: 9, label: "Worn rug by the fire", style: "carpet" },
      { id: "rl-sofa", x: 5, y: 6, label: "Twoleg sleeping-soft (sofa)", style: "sofa" },
      { id: "rl-chair", x: 8, y: 5, label: "Twoleg perch", style: "chair" },
      { id: "rl-table", x: 12, y: 5, label: "Twoleg eating-table", style: "table" },
      { id: "rl-cabinet", x: 17, y: 4, label: "Tall cabinet", style: "cabinet" },
      { id: "rl-lamp", x: 21, y: 5, label: "Glowing lamp", style: "lamp" },
      { id: "rl-blanket", x: 9, y: 14, label: "A curled sleeping mat", style: "blanket" },
      { id: "rl-toy", x: 15, y: 15, label: "A woolly mouse toy", style: "toy" },
      { id: "rl-bowl", x: 19, y: 13, label: "Food bowl", style: "bowl" },
      { id: "rl-plant", x: 22, y: 12, label: "Houseplant", style: "plant" },
    ],
  },
  "house-f": {
    id: "house-f",
    name: "Twoleg Living Room",
    desc: "A soft sofa faces a flickering box, and a rug warms the wooden floor.",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hf-sofa", x: 4, y: 6, label: "Soft sofa", style: "sofa" },
      { id: "hf-carpet", x: 10, y: 8, label: "Patterned rug", style: "carpet" },
      { id: "hf-lamp", x: 16, y: 4, label: "Standing lamp", style: "lamp" },
      { id: "hf-shelf", x: 20, y: 7, label: "Bookshelf", style: "shelf" },
      { id: "hf-box", x: 7, y: 12, label: "Cardboard box", style: "box" },
      { id: "hf-plant", x: 21, y: 13, label: "Houseplant", style: "plant" },
    ],
  },
  "house-g": {
    id: "house-g",
    name: "Twoleg Bedroom",
    desc: "A tall bed, a snoring Twoleg shape under blankets, and a wardrobe to hide behind.",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hg-bed", x: 4, y: 4, label: "Twoleg sleeping-nest", style: "bed" },
      { id: "hg-cabinet", x: 17, y: 4, label: "Wardrobe", style: "cabinet" },
      { id: "hg-lamp", x: 11, y: 13, label: "Bedside lamp", style: "lamp" },
      { id: "hg-box", x: 6, y: 14, label: "Storage box", style: "box" },
      { id: "hg-plant", x: 19, y: 12, label: "Houseplant", style: "plant" },
    ],
  },
  "house-h": {
    id: "house-h",
    name: "Twoleg Kitchen",
    desc: "Cold floor tiles, a towering cold box, and a bowl that smells faintly of fish.",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hh-cabinet-1", x: 3, y: 4, label: "Kitchen counter", style: "cabinet" },
      { id: "hh-cabinet-2", x: 9, y: 4, label: "Kitchen counter", style: "cabinet" },
      { id: "hh-coldbox", x: 18, y: 4, label: "The humming cold box", style: "cabinet" },
      { id: "hh-bowl-1", x: 12, y: 9, label: "Water bowl", style: "bowl" },
      { id: "hh-bowl-2", x: 20, y: 12, label: "Food bowl", style: "bowl" },
      { id: "hh-plant", x: 4, y: 12, label: "Window plant", style: "plant" },
    ],
  },
  "house-i": {
    id: "house-i",
    name: "Twoleg Study",
    desc: "Tall shelves of paper-filled leaves and a warm lamp burning late.",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hi-shelf-1", x: 3, y: 4, label: "Tall bookshelf", style: "shelf" },
      { id: "hi-shelf-2", x: 9, y: 4, label: "Tall bookshelf", style: "shelf" },
      { id: "hi-books", x: 15, y: 5, label: "Stack of books", style: "books" },
      { id: "hi-chair", x: 10, y: 10, label: "Reading chair", style: "chair" },
      { id: "hi-lamp", x: 17, y: 12, label: "Desk lamp", style: "lamp" },
    ],
  },
  barn: {
    id: "barn",
    name: "The Farm Barn",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hay1", x: 6, y: 6, label: "Hay bales, stacked high", style: "hay" },
      { id: "hay2", x: 18, y: 6, label: "Hay bales, cow-warm", style: "hay" },
      { id: "hay3", x: 12, y: 12, label: "Warm hay pile for sleeping", style: "hay" },
      { id: "hay4", x: 9, y: 10, label: "Loose straw scatter", style: "hay" },
      { id: "plank", x: 16, y: 11, label: "Twoleg workbench", style: "table" },
      { id: "bn-box", x: 5, y: 12, label: "Feed sacks", style: "box" },
      { id: "bn-bowl", x: 15, y: 5, label: "The farm cat's water bowl", style: "bowl" },
      { id: "bn-rider", x: 8, y: 4, label: "Barn rafters with pigeon nests", style: "vines" },
    ],
    desc: "The barn breathes warm hay and cow. Mice rustle between the bales. A safe place for any cat willing to share.",
    npcs: [],
  },
};

// Fit every room's wall grid to its geometry (rounded cave dens, varied
// sizes) — the doorway gap stays centered in the bottom wall.
for (const room of Object.values(interiors)) {
  const geo = ROOM_GEO[room.id];
  if (geo) room.walls = roomSized(geo.w, geo.h, geo.cave);
}

// ---------------------------------------------------------------------------
// Prey
// ---------------------------------------------------------------------------

/** Prey lifecycle: alive → dying (brief death pose) → removed from the world. */
type PreyPhase = "alive" | "dying" | "removed";

interface PreyState {
  id: string;
  kind: PreyKind;
  x: number;
  y: number;
  home: { x: number; y: number };
  tx: number;
  ty: number;
  facing: 1 | -1;
  fleeing: boolean;
  waitUntil: number;
  seed: number;
  phase: PreyPhase;
  /** engine time at which a dying prey despawns (removed → filtered out) */
  deadUntil: number;
}

const PREY_FLEE_DIST = 90;
const PREY_CATCH_DIST = 16;
// Fewer prey overall — and none spawn inside camps (see campPreyExclusion).
const PREY_MAX = 38;

// ---------------------------------------------------------------------------
// NPC schedule resolution
// ---------------------------------------------------------------------------

interface NPCState {
  def: NPCDef;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  pose: CatPose;
  waitUntil: number;
  phase: number;
  lastScheduleHour: number;
}

function scheduleTarget(def: NPCDef, hour: number): { x: number; y: number } | null {
  if (!def.schedule || def.schedule.length === 0) return null;
  let slot = def.schedule[0];
  for (const s of def.schedule) {
    if (hour >= s.h) slot = s;
  }
  return { x: slot.x, y: slot.y };
}

// ---------------------------------------------------------------------------
// The GameCanvas class
// ---------------------------------------------------------------------------

const PLAYER_HALF_W = 11;
const PLAYER_HALF_H = 8;

// --- environmental upgrades -------------------------------------------------
// Ground detail scatter (deterministic): litter, stones, soil patches and
// wildflowers sampled from the GROUND map, drawn under everything.
type GroundDecoKind = "litter" | "stone" | "soil" | "flower";
const groundDeco: { x: number; y: number; kind: GroundDecoKind; a: number; s: number }[] = [];
const GROUND_KIND_LABELS: Record<number, GroundKind> = {
  0: "grass", 1: "sand", 2: "water", 3: "stone", 4: "paved", 5: "pine",
  6: "dirt", 7: "moor", 8: "marsh", 9: "riverbank", 10: "reeds",
};
function groundKindAtIdx(idx: number): GroundKind {
  return GROUND_KIND_LABELS[idx] ?? "grass";
}
(function buildGroundDeco() {
  if (groundDeco.length) return;
  let seed = 1234567;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * WORLD_W;
    const y = rnd() * WORLD_H;
    const kind = groundKindAtIdx(groundMap[Math.floor(y / GROUND_CELL) * GROUND_COLS + Math.floor(x / GROUND_CELL)] ?? 0);
    if (kind === "water" || kind === "paved") continue;
    const r = rnd();
    const decoKind: GroundDecoKind = kind === "stone" ? (r < 0.7 ? "stone" : "litter")
      : r < 0.46 ? "litter" : r < 0.72 ? "soil" : r < 0.88 ? "stone" : "flower";
    groundDeco.push({ x, y, kind: decoKind, a: rnd() * Math.PI * 2, s: 0.6 + rnd() * 0.8 });
  }
})();

// --- swimming ---------------------------------------------------------------
// Deep water replaces walking with a swim state: different speed, bobbing
// sprite, ripple rings — no invisible walls at intended swim entrances.
const SWIM_SPEED = 88; // px/s: between walk (165) and sneak (80)
const SWIM_BOB_HZ = 2.1;
const WALK_SPEED = 165;
const RUN_SPEED = 250;
const SNEAK_SPEED = 80;

// Touch/Space 2D hop — a cosmetic sprite lift only; movement, collision and
// the existing walk/pose animation are untouched (same cat, same animations).
const HOP_DURATION = 0.5; // seconds of air time
const HOP_HEIGHT = 18; // px lift at the apex
const GAME_HOUR_START = 8; // start in the morning
const GAME_DAY_SECONDS = 600; // 10 real minutes per in-game day

export class GameCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: GameCallbacks;
  private raf = 0;
  private lastTime = 0;
  private time = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  private px = 0;
  private py = 0;
  private prevPx = 0;
  private prevPy = 0;
  private pxFacing: 1 | -1 = 1;
  private pPose: CatPose = "walk";
  private poseUntil = 0;
  private pEmote: string | null = null;
  private emoteUntil = 0;
  private swimming = false; // deep-water movement state
  /** wet-coat timer (performance.now ms) — drives shake-off animations */
  private wetnessUntil = 0;
  private lastShakeAt = -9999;
  /** car-death state: input frozen while the death overlay is up */
  private dead = false;
  /** survival needs (hunger/energy/health) */
  private _needs = new SurvivalNeeds();
  /** ambient NPC mew throttle */
  private lastNpcMewAt = 0;

  private camX = 0;
  private camY = 0;
  private scale = 1.15;
  private userScale = 1;

  private keys = new Set<string>();
  private paused = false;

  private npcStates: NPCState[] = [];
  private prey: PreyState[] = [];

  private lastArea = "";
  private lastNearby: NearbyTarget | null = null;

  // --- shared input state: touch buttons feed the SAME keys pipeline the
  // keyboard uses, so PC and mobile run one movement system and the same
  // animations. ---
  private touchDx = 0;
  private touchDy = 0;
  private crouchHeld = false; // touch crouch is a toggle; keyboard is a hold
  private hopT = -1; // active 2D hop timer (<0 = grounded)
  private lastWaypointEmit = 0;
  private lastMoveEmit = 0;
  private destroyed = false;

  // clock & weather
  private dayTime = (GAME_HOUR_START / 24) * GAME_DAY_SECONDS;
  private lastHour = -1;
  private weather: WeatherKind = "clear";
  private weatherUntil = 60;
  /** smoothed atmospheric mix, 0..1 per effect */
  private env = { rain: 0, fog: 0, wind: 0, dark: 0 };
  private raindrops: { x: number; y: number; v: number }[] = [];
  private fogOffset = 0;
  /** ambient dust/firefly particles */
  private motes: EnvParticle[] = [];

  // multiplayer remotes (set by React) — rendered positions are interpolated
  // toward the latest SERVER state (smooth movement, no packet-snap)
  public remotes = new Map<string, RemotePlayer>();
  /**
   * Render state per remote cat: an interpolation buffer of recent SERVER
   * states plus the derived on-screen position/pose. Positions are never
   * taken raw from packets — they are interpolated between buffered states,
   * briefly extrapolated when packets run late, and snapped only on a large
   * authoritative correction.
   */
  private remoteRender = new Map<string, RemoteRenderState>();
  public bubbles: ChatBubble[] = [];

  // interiors
  private interiorId: string | null = null;
  private lastInterior: string | null = null;
  /** saved position to return to when leaving an interior */
  private exitPos: { x: number; y: number } | null = null;
  private huntedCount = 0;
  /** prevents instant re-enter when stepping back out through a doorway */
  private doorCooldownUntil = 0;
  /** re-armed once the player steps away from every doorway */
  private doorArmed = true;
  /** active waypoint in world px (set from the map's real tile coordinates) */
  private waypoint: { x: number; y: number } | null = null;
  private waypointArrived = false;
  private sneaking = false;
  private running = false;
  private pSpeed = 0; // live speed in px/s (drives pose + networking)

  constructor(canvas: HTMLCanvasElement, spawn: { x: number; y: number }, cb: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.cb = cb;
    this.px = spawn.x;
    this.py = spawn.y;
    this.camX = spawn.x;
    this.camY = spawn.y;
    this.npcStates = npcs.map((n) => ({
      def: n,
      x: n.home.x,
      y: n.home.y,
      tx: n.home.x,
      ty: n.home.y,
      facing: 1,
      pose: "walk",
      waitUntil: 0,
      phase: Math.random() * Math.PI * 2,
      lastScheduleHour: -1,
    }));
    this.spawnPrey(80);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.keys.clear();
      this.touchDx = 0;
      this.touchDy = 0;
      this.crouchHeld = false;
    }
  }

  /** Camera zoom, exposed so Settings can change view distance. */
  setCameraScale(s: number) {
    this.userScale = Math.min(1.6, Math.max(0.7, s));
    this.resize();
  }

  /** Touch D-pad: which directions are currently held (-1/0/1 per axis). */
  setTouchDir(dx: -1 | 0 | 1, dy: -1 | 0 | 1) {
    this.touchDx = dx;
    this.touchDy = dy;
  }

  /** Touch CROUCH toggle — activates the same sneak pipeline as holding C. */
  setTouchCrouch(on: boolean) {
    this.crouchHeld = on;
  }

  /** JUMP (touch button): the exact same hop Space triggers on PC. */
  touchJump() {
    this.startHop();
  }

  private startHop() {
    if (this.paused || this.hopT >= 0) return;
    this.hopT = 0;
  }

  /** Deep-water check at a world position (drives swim visuals/depth). */
  private waterAt(x: number, y: number): boolean {
    if (this.interiorId) return false;
    return groundKindAtIdx(groundMap[Math.floor(y / GROUND_CELL) * GROUND_COLS + Math.floor(x / GROUND_CELL)] ?? 0) === "water";
  }

  /** Mid-hop sprite lift in px (0 when grounded). */
  private hopLiftPx(): number {
    if (this.hopT < 0) return 0;
    const t = Math.min(1, this.hopT / HOP_DURATION);
    return Math.round(Math.sin(t * Math.PI) * HOP_HEIGHT);
  }

  /** True while the cat is mid-hop (drives the JUMP button's pressed state). */
  isHopping(): boolean {
    return this.hopT >= 0;
  }

  teleport(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.camX = x;
    this.camY = y;
    this.interiorId = null;
    this.doorCooldownUntil = this.time + 1.2;
    // traffic is NOT cleared here: the fleet is world-persistent, so cars
    // keep driving whether the player teleports, interacts or enters a den
    this.cb.onInteriorChange(null);
  }

  /** Bring the shared fleet back after a forced respawn near the road. */
  restoreTraffic() {
    clearTraffic();
    respawnBothDirections(this.time);
  }

  enterInterior(id: string, fromObj?: { x: number; y: number; w: number; h: number; id?: string }) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    // Anchor the exit to the WORLD object this interior belongs to. The E-key
    // path ("Enter <den>") passes no object, so look it up — without this the
    // exit spot is guessed from the entry position and can land in a wall.
    if (fromObj) this.enteredFrom = fromObj;
    else {
      const owner = allObjects.find((o) => o.interior === id);
      if (owner) this.enteredFrom = { id: owner.id, x: owner.x, y: owner.y, w: owner.w, h: owner.h };
    }
    // traffic is world-persistent: cars keep driving while the cat is indoors
    this.interiorId = id;
    const geo = ROOM_GEO[id];
    this.px = ((geo?.w ?? ROOM_W) / 2) * 32;
    this.py = ((geo?.h ?? ROOM_H) - 3) * 32;
    this.camX = this.px;
    this.camY = this.py;
    this.doorArmed = false;
    this.cb.onInteriorChange(id);
  }

  /** the world object whose interior we're inside (for safe exit placement) */
  private enteredFrom: { id?: string; x: number; y: number; w: number; h: number } | null = null;

  exitInterior() {
    if (!this.interiorId) return;
    this.interiorId = null;
    // Place the player at the nearest WALKABLE point outside the entrance
    // object's collision — never inside a wall (the old fixed +40px offset
    // could land inside solid dens, permanently trapping the player).
    if (this.exitPos) {
      let placed = false;
      if (this.enteredFrom) {
        const spot = this.findWalkableExitSpot(this.enteredFrom, this.enteredFrom.id);
        if (spot) {
          this.px = spot.x;
          this.py = spot.y;
          placed = true;
        }
      }
      if (!placed && this.enteredFrom) {
        // spiral out from the den's south face (in front of its door)
        const spot = this.nearestFreeSpot(this.enteredFrom.x, this.enteredFrom.y + this.enteredFrom.h / 2 + 12, 480);
        if (spot) {
          this.px = spot.x;
          this.py = spot.y;
          placed = true;
        }
      }
      if (!placed) {
        // guaranteed: spiral out from wherever we entered, however far it takes
        const spot = this.nearestFreeSpot(this.exitPos.x, this.exitPos.y, 800);
        if (spot) {
          this.px = spot.x;
          this.py = spot.y;
          placed = true;
        }
      }
      if (!placed) {
        // last resort: keep old position (never trap the player)
        this.px = this.exitPos.x;
        this.py = this.exitPos.y + 40;
      }
      this.camX = this.px;
      this.camY = this.py;
    }
    this.enteredFrom = null;
    this.doorArmed = false; // must step away before walking back in
    this.doorCooldownUntil = this.time + 1.2;
    this.cb.onInteriorChange(null);
  }

  /** True when the player's full body (half extents) fits at this point. */
  private bodyFitsAt(x: number, y: number): boolean {
    return (
      !isSolidPoint(x - PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x - PLAYER_HALF_W, y + PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y + PLAYER_HALF_H)
    );
  }

  /** True when this point sits in ANOTHER entrance's walk-in trigger. */
  private nearOtherDoor(c: { x: number; y: number }, selfId?: string): boolean {
    for (const o of allObjects) {
      if (!o.interior || !o.doorAt) continue;
      if (selfId && o.id === selfId) continue; // our own door is fine to stand at
      const dxp = o.x + o.doorAt.dx * 32;
      const dyp = o.y + o.h / 2 + o.doorAt.dy * 32;
      const th = o.solid ? Math.max(30, o.w * 0.28) : Math.max(20, o.w * 0.16);
      if (Math.hypot(dxp - c.x, dyp - c.y) < th + 12) return true;
    }
    return false;
  }

  /**
   * First free point on expanding rings around the entrance: south face (the
   * door) first, then the object center. Rings cover every direction so dens
   * hemmed in by walls/brambles still get a walkable exit on some side.
   */
  private findWalkableExitSpot(
    box: { x: number; y: number; w: number; h: number },
    selfId?: string,
  ): { x: number; y: number } | null {
    const origins = [
      { x: box.x, y: box.y + box.h / 2 }, // the doorway (south face)
      { x: box.x, y: box.y }, // the object center
    ];
    for (const org of origins) {
      for (let ring = 1; ring <= 12; ring++) {
        const rad = ring * 14;
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const c = { x: org.x + Math.cos(ang) * rad, y: org.y + Math.sin(ang) * rad };
          if (this.bodyFitsAt(c.x, c.y) && !this.nearOtherDoor(c, selfId)) return c;
        }
      }
    }
    return null;
  }

  /** Spiral search for the nearest point where the player body fits. */
  private nearestFreeSpot(x: number, y: number, maxR: number): { x: number; y: number } | null {
    if (this.bodyFitsAt(x, y) && !this.nearOtherDoor({ x, y })) return { x, y };
    for (let r = 10; r <= maxR; r += 10) {
      const steps = Math.max(8, Math.round((r / 10) * 4));
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2;
        const c = { x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r };
        if (this.bodyFitsAt(c.x, c.y) && !this.nearOtherDoor(c)) return c;
      }
    }
    return null;
  }

  private solidAt(x: number, y: number): boolean {
    // reuse the collision check used for movement
    return !this.canMoveTo(x, y);
  }

  /**
   * Pounce on prey: the ONLY way prey dies. Returns the prey kind if a live
   * prey was in pounce range (React awards the XP), null otherwise.
   */
  pounceAt(): string | null {
    let target: (typeof this.prey)[number] | null = null;
    let bestD = 64;
    for (const p of this.prey) {
      if (p.phase !== "alive") continue;
      const d = Math.hypot(p.x - this.px, p.y - this.py);
      if (d < bestD) {
        bestD = d;
        target = p;
      }
    }
    if (!target) return null;
    target.phase = "dying";
    target.fleeing = false;
    target.deadUntil = this.time + 0.55; // brief death pose, then despawn
    this.huntedCount++;
    this.cb.onPreyCaught(target.kind);
    return target.kind;
  }

  /** Set a waypoint from world tile coordinates (map spot * 32). */
  setWaypoint(tx: number, ty: number) {
    this.waypoint = { x: tx * 32, y: ty * 32 };
    this.waypointArrived = false;
  }

  clearWaypoint() {
    this.waypoint = null;
    this.waypointArrived = false;
    this.cb.onWaypoint?.({ meters: 0, tiles: 0, arrived: false });
  }

  get hasWaypoint() {
    return this.waypoint !== null;
  }

  addBubble(b: ChatBubble) {
    this.bubbles.push(b);
    if (this.bubbles.length > 12) this.bubbles.shift();
  }

  setEmote(emote: string | null) {
    this.pEmote = emote;
    this.emoteUntil = this.time + 3;
  }

  setPose(pose: CatPose, seconds = 4) {
    this.pPose = pose;
    this.poseUntil = this.time + seconds;
  }

  get isSneaking() {
    return this.sneaking;
  }

  /** Facing for HUD/minimap (1 = right, -1 = left). */
  get facing(): 1 | -1 {
    return this.pxFacing;
  }

  /** Remote players currently known (for the minimap). */
  get remoteList(): RemotePlayer[] {
    return [...this.remotes.values()];
  }

  /**
   * Current snapshot of THIS player for networking: position, direction, and
   * the synchronized movement/animation state. Game.tsx samples this every
   * heartbeat so remote cats see real motion (never the old hardcoded
   * facing:1 / moving:false), and remote poses stay state-driven.
   */
  /** Continuous animation clock (decoupled from pause freezes). */
  private animClock(): number {
    return performance.now() / 1000;
  }

  /**
   * Engine-side SFX bus. The React layer wires cb.onSfx to the AudioEngine;
   * if it is not connected (offline previews), this is a silent no-op.
   */
  engineSfx(name: EngineSfxName, opts: { volume?: number; throttleMs?: number } = {}) {
    this.cb.onSfx?.(name, opts);
  }

  /** Survival needs (hunger/energy/health) — UI reads, actions mutate. */
  get needs() {
    return this._needs;
  }

  /** Restore needs: eating fresh-kill, sleeping in dens, resting. */
  eat(amount = 30) {
    this._needs.hunger = Math.min(100, this._needs.hunger + amount);
    this._needs.health = Math.min(100, this._needs.health + 4);
  }
  drink() {
    this._needs.hunger = Math.min(100, this._needs.hunger + 6);
  }
  rest(amount = 55) {
    this._needs.energy = Math.min(100, this._needs.energy + amount);
    this._needs.health = Math.min(100, this._needs.health + 8);
  }

  /** Where the cat wakes up after dying (edge of the Thunderpath it died on). */
  private roadRespawnPoint(): { x: number; y: number } {
    const baseX = Math.max(200, Math.min(WORLD_W - 200, this.px));
    const baseY = TP_Y + 64; // south shoulder of the Thunderpath
    // never respawn inside a tree/rock: spiral out to the nearest free tile
    if (!isSolidPoint(baseX, baseY)) return { x: baseX, y: baseY };
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = baseX + dx * 32;
          const y = baseY + dy * 32;
          if (!isSolidPoint(x, y)) return { x, y };
        }
      }
    }
    return { x: baseX, y: baseY };
  }

  /** Car hit: freeze input, fade out, hand the choice to the UI. */
  startDeath(cause = "car") {
    if (this.dead) return;
    this.dead = true;
    this.keys.clear();
    this.touchDx = 0;
    this.touchDy = 0;
    this.crouchHeld = false;
    const respawn = this.roadRespawnPoint();
    this.cb.onDeath?.(cause, respawn);
  }

  /** Respawn at the road edge: needs partially restored, brief invulnerability. */
  respawn(at: { x: number; y: number }) {
    this._needs.hunger = Math.max(this._needs.hunger, 45);
    this._needs.energy = Math.max(this._needs.energy, 55);
    this._needs.health = Math.max(50, this._needs.health);
    this.dead = false;
    this.hopT = -1;
    this.wetnessUntil = 0;
    this.doorCooldownUntil = this.time + 1.2;
    this.teleport(at.x, at.y);
    this.restoreTraffic();
  }

  engineState(): {
    x: number; y: number; facing: 1 | -1; moving: boolean;
    movementState: MovementState; animationState: CatPose;
  } {
    // velocity > threshold => moving (spec: animation derives from movement)
    const moving = this.pSpeed > 8;
    if (this.swimming && moving) {
      // swimming is a first-class movement state (synced like walk/crouch)
      return {
        x: this.px,
        y: this.py,
        facing: this.pxFacing,
        moving: true,
        movementState: "walk",
        animationState: "swim",
      };
    }
    const movementState: MovementState = moving
      ? this.sneaking
        ? "crouch" // synchronized crouch: remote cats see the crouch pose
        : this.pSpeed > 205
          ? "run"
          : "walk"
      : "idle";
    const animationState: CatPose =
      moving ? (this.sneaking ? "crouch" : "walk")
        : !moving && this.time > this.poseUntil && this.pPose !== "walk" ? this.pPose : "sit";
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState,
    };
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.resize);
  }

  private onBlur = () => this.keys.clear();

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "e"].includes(k)) e.preventDefault();
    if ((k === "e" || k === "enter") && !this.paused) {
      const near = this.lastNearby;
      if (near) this.cb.onInteract(near);
      return;
    }
    if (k === " " && !this.paused) this.startHop(); // PC jump: same hop as the touch JUMP button
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.scale = this.userScale * (rect.width < 700 ? 0.85 : rect.width < 1100 ? 1.0 : 1.2);
  };

  private canMoveTo(x: number, y: number): boolean {
    if (this.interiorId) return true; // interiors use simple bounds
    return (
      !isSolidPoint(x - PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x - PLAYER_HALF_W, y + PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y + PLAYER_HALF_H)
    );
  }

  private spawnPrey(n: number) {
    let created = 0;
    let attempts = 0;
    while (created < n && attempts < n * 40) {
      attempts++;
      const zone = preyZones[Math.floor(Math.random() * preyZones.length)];
      const x = zone.rect.x + Math.random() * zone.rect.w;
      const y = zone.rect.y + Math.random() * zone.rect.h;
      if (isSolidPoint(x, y)) continue;
      // rivers/ponds are swimmable, not solid — keep prey on dry land
      if (groundKindAtIdx(groundMap[Math.floor(y / GROUND_CELL) * GROUND_COLS + Math.floor(x / GROUND_CELL)] ?? 0) === "water") continue;
      if (this.inCampExclusion(x, y)) continue;
      this.prey.push({
        id: `prey-${created}-${Date.now()}`,
        kind: zone.kind,
        x,
        y,
        home: { x, y },
        tx: x,
        ty: y,
        facing: Math.random() > 0.5 ? 1 : -1,
        fleeing: false,
        waitUntil: Math.random() * 3,
        seed: Math.random() * 1000,
        phase: "alive" as PreyPhase,
        deadUntil: 0,
      });
      created++;
    }
  }

  private respawnPreyTick() {
    const alive = this.prey.filter((p) => p.phase === "alive").length;
    if (alive < PREY_MAX * 0.6) {
      this.spawnPrey(Math.floor(PREY_MAX * 0.25));
    }
  }

  /** Camp rects — no prey spawns inside any Clan camp (camps are lived-in). */
  private static campExclusion: { x: number; y: number; r: number }[] | null = null;
  private inCampExclusion(x: number, y: number): boolean {
    if (!GameCanvas.campExclusion) {
      GameCanvas.campExclusion = areas
        .filter((a) => a.id === "camp" || a.id.endsWith("-camp"))
        .map((a) => ({
          x: a.rect.x + a.rect.w / 2,
          y: a.rect.y + a.rect.h / 2,
          r: Math.max(a.rect.w, a.rect.h) * 0.75,
        }));
      // Twolegplace is a tidy neighborhood — keep wild prey out of it.
      GameCanvas.campExclusion.push({ x: 75 * 32, y: 148 * 32, r: 30 * 32 });
    }
    return GameCanvas.campExclusion.some((c) => Math.hypot(x - c.x, y - c.y) < c.r);
  }

  // -------------------------------------------------------------------------

  private loop = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    if (this.paused !== this.lastPausedState) {
      this.lastPausedState = this.paused;
      if (this.paused) this.trafficPausedUntil = this.time + 0.75; // pause grace
    }
    if (!this.paused) {
      this.time += dt;
      this.dayTime = (this.dayTime + dt) % GAME_DAY_SECONDS;
    }
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private hour(): number {
    return Math.floor((this.dayTime / GAME_DAY_SECONDS) * 24);
  }

  /** Fractional hour for smooth sunrise/sunset gradients. */
  private hourF(): number {
    return (this.dayTime / GAME_DAY_SECONDS) * 24;
  }

  /**
   * Smooth night darkness with real dawn/dusk ramps (dark 21→5, golden
   * shoulders 19–21 and 5–7). Returns 0 (day) .. 1 (deep night).
   */
  private nightAlpha(): number {
    const h = this.hourF();
    if (h >= 21 || h < 5) return 1;
    if (h >= 19) return (h - 19) / 2; // sunset ramp
    if (h < 7) return (7 - h) / 2; // sunrise ramp
    return 0;
  }

  /** Warm sunrise/sunset glow strength, 0..1. */
  private goldenHour(): number {
    const h = this.hourF();
    if (h >= 18.5 && h < 20) return 1 - Math.abs(h - 19.25) / 0.75;
    if (h >= 6 && h < 7.5) return 1 - Math.abs(h - 6.75) / 0.75;
    return 0;
  }

  /** Deterministic moon brightness for the current night (0.3..1). */
  private moonPhase(): number {
    const day = Math.floor(this.dayTime / GAME_DAY_SECONDS);
    return 0.3 + ((day * 37) % 70) / 100;
  }

  /** Gust factor for wind-blown vegetation (0..1). */
  private windGust(): number {
    const g = Math.sin(this.time * 0.9) * Math.sin(this.time * 0.23 + 2);
    return Math.max(0, 0.55 + 0.45 * g);
  }

  /** traffic freezes while paused (pause menus, interiors, dialogue) */
  private trafficPausedUntil = 0;
  private lastPausedState = false;

  private update(dt: number) {
    // clock + weather callbacks
    const hr = this.hour();
    if (hr !== this.lastHour) {
      this.lastHour = hr;
      this.cb.onClock(hr);
    }
    if (this.time > this.weatherUntil) {
      this.weather = pickWeather();
      this.weatherUntil = this.time + 50 + Math.random() * 70;
      this.cb.onWeatherChange(this.weather);
    }

    // --- atmosphere: smoothly approach the targets of the current weather ---
    const envTarget =
      this.weather === "rain"
        ? { rain: 0.55, fog: 0.25, wind: 0.45, dark: 0.22 }
        : this.weather === "heavy-rain"
          ? { rain: 0.85, fog: 0.4, wind: 0.6, dark: 0.32 }
          : this.weather === "storm"
            ? { rain: 1, fog: 0.35, wind: 1, dark: 0.45 }
            : this.weather === "fog"
              ? { rain: 0, fog: 1, wind: 0.15, dark: 0.12 }
              : this.weather === "wind"
                ? { rain: 0, fog: 0.05, wind: 1, dark: 0.05 }
                : this.weather === "cloudy"
                  ? { rain: 0, fog: 0.12, wind: 0.3, dark: 0.14 }
                  : this.weather === "snow"
                    ? { rain: 0, fog: 0.3, wind: 0.35, dark: 0.16 }
                    : { rain: 0, fog: 0, wind: 0.12, dark: 0 };
    const ease = Math.min(1, dt * 0.5); // ~2s transition on weather changes
    this.env.rain += (envTarget.rain - this.env.rain) * ease;
    this.env.fog += (envTarget.fog - this.env.fog) * ease;
    this.env.wind += (envTarget.wind - this.env.wind) * ease;
    this.env.dark += (envTarget.dark - this.env.dark) * ease;

    // --- weather on the coat: rain/storm soak, dry-off in clear weather ---
    if (!this.interiorId) {
      if ((this.weather === "rain" || this.weather === "heavy-rain" || this.weather === "storm") && !this.swimming) {
        this.wetnessUntil = Math.max(this.wetnessUntil, performance.now() + 4000);
      } else if (this.weather === "clear" && !this.swimming && performance.now() > this.wetnessUntil) {
        // coat dries naturally; the timer only matters while wet
      }
    }

    // --- contextual idle: shake off water/snow, occasionally ---
    if (!this.paused && !this.dead && !this.swimming && this.pPose !== "walk" && this.pPose !== "crouch" && this.pPose !== "swim") {
      const nowPm = performance.now();
      const wet = nowPm < this.wetnessUntil;
      const snowy = this.weather === "snow";
      if (this.pSpeed <= 8 && this.time > this.poseUntil) {
        if (wet && nowPm - this.lastShakeAt > 9000 && Math.random() < dt * 0.35) {
          this.pPose = "shake";
          this.poseUntil = this.time + 0.55;
          this.lastShakeAt = nowPm;
          this.engineSfx("shake", { volume: 0.8, throttleMs: 1500 });
        } else if (snowy && nowPm - this.lastShakeAt > 11000 && Math.random() < dt * 0.2) {
          this.pPose = "shake";
          this.poseUntil = this.time + 0.45;
          this.lastShakeAt = nowPm;
        }
      }
    }

    // --- player movement ---
    let dx = 0;
    let dy = 0;
    if (!this.paused && !this.dead) {
      if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
      // touch D-pad feeds the same pipeline (two held buttons = diagonal)
      if (this.touchDx !== 0 || this.touchDy !== 0) {
        dx += this.touchDx;
        dy += this.touchDy;
      }
    }
    this.sneaking = this.keys.has("control") || this.keys.has("c") || this.crouchHeld;
    const running = this.keys.has("shift");
    this.running = running;
    // deep water (swimming) is slower than walking; shallow water stays walkable
    const swimmingNow = !this.interiorId && groundKindAtIdx(groundMap[Math.floor(this.py / GROUND_CELL) * GROUND_COLS + Math.floor(this.px / GROUND_CELL)] ?? 0) === "water";
    if (swimmingNow && !this.swimming) {
      // entered water: coat gets soaked + a splash
      this.wetnessUntil = performance.now() + 15000;
      this.engineSfx("splash", { volume: 0.9, throttleMs: 600 });
    } else if (!swimmingNow && this.swimming) {
      // just left the water: guaranteed one shake-off soon
      this.wetnessUntil = performance.now() + 15000;
      this.lastShakeAt = -9999;
    }
    this.swimming = swimmingNow;
    const speed = swimmingNow ? SWIM_SPEED : this.sneaking ? SNEAK_SPEED : running ? RUN_SPEED : WALK_SPEED;

    if (this.time > this.poseUntil && this.pPose !== "walk") this.pPose = "walk";

    const movingNow = dx !== 0 || dy !== 0;
    // Any movement input immediately breaks out of an emote pose so the
    // player can never get stuck sitting/sleeping/grooming.
    if (movingNow && this.pPose !== "walk") {
      this.pPose = "walk";
      this.poseUntil = 0;
    }
    // Swimming overrides land poses (its visual is drawn from pPose = "swim")
    if (this.swimming && movingNow && this.pPose !== "swim") {
      this.pPose = "swim";
      this.poseUntil = 0;
    } else if (!this.swimming && this.pPose === "swim") {
      this.pPose = "walk"; // smooth back to land movement on exit
    }
    // animation derives from movement (spec): sneak = CROUCH
    // (swim pose is managed above and never overridden by land poses)
    if (movingNow && !this.swimming) {
      if (this.sneaking && this.pPose !== "crouch") this.pPose = "crouch";
      else if (!this.sneaking && this.pPose === "crouch") this.pPose = "walk";
    } else if (!this.swimming && this.pPose === "crouch") {
      this.pPose = "sit"; // stopped: settle into the idle sit pose
    }
    this.pPose = movingNow && (this.pPose === "walk" || this.pPose === "crouch") ? this.pPose : this.pPose;
    if (movingNow && (this.pPose === "walk" || this.pPose === "crouch" || this.swimming)) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * speed * dt;
      dy = (dy / len) * speed * dt;
      if (dx !== 0) this.pxFacing = dx > 0 ? 1 : -1;

      if (this.interiorId) {
        const room = interiors[this.interiorId];
        const geo = ROOM_GEO[this.interiorId];
        const gw = (geo?.w ?? ROOM_W) * 32;
        const gh = (geo?.h ?? ROOM_H) * 32;
        const nx = Math.max(40, Math.min(gw - 40, this.px + dx));
        const ny = Math.max(40, Math.min(gh - 30, this.py + dy));
        // interior walls: grid check against the room's real wall rows
        const cx = Math.floor(nx / 32);
        const cy = Math.floor(ny / 32);
        const wall = room.walls[Math.min(room.walls.length - 1, cy)]?.[cx] === "1";
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
        }
      } else if (this.swimming) {
        // deep water: swim through (no land-collision checks), keep inside
        // the world bounds
        this.px = Math.max(8, Math.min(WORLD_W - 8, this.px + dx));
        this.py = Math.max(8, Math.min(WORLD_H - 8, this.py + dy));
      } else {
        if (this.canMoveTo(this.px + dx, this.py)) this.px += dx;
        if (this.canMoveTo(this.px, this.py + dy)) this.py += dy;
      }
    } else if (!movingNow && this.time > this.poseUntil) {
      // idle behaviors (never while floating in water — keep the swim pose)
      if (!this.swimming && Math.random() < 0.001) this.pPose = "sit";
    }

    // real velocity this frame: stop => idle pose (never walk-in-place)
    const movedX = this.px - (this.prevPx ?? this.px);
    const movedY = this.py - (this.prevPy ?? this.py);
    this.pSpeed = Math.hypot(movedX, movedY) / Math.max(dt, 1 / 120);
    this.prevPx = this.px;
    this.prevPy = this.py;

    // --- 2D hop timer (shared by Space on PC and the JUMP button on touch):
    // the sprite is LIFTED at draw time; the ground position never changes,
    // so collisions and the existing animations are untouched. ---
    if (this.hopT >= 0) {
      this.hopT += dt;
      if (this.hopT >= HOP_DURATION) this.hopT = -1;
    }
    if (this.time > this.poseUntil && !movingNow && this.pPose === "walk") {
      this.pPose = "sit"; // idle read: standing cats sit, animation stops
    }

    // camera
    const lerp = 1 - Math.pow(0.0001, dt);
    this.camX += (this.px - this.camX) * lerp;
    this.camY += (this.py - this.camY) * lerp;

    // --- NPC schedules + movement ---
    for (const n of this.npcStates) {
      const target = scheduleTarget(n.def, hr);
      if (target && hr !== n.lastScheduleHour) {
        n.tx = target.x;
        n.ty = target.y;
        n.lastScheduleHour = hr;
      }
      const dist = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (n.pose !== "walk" && this.time > n.waitUntil) n.pose = "walk";
      if (n.pose === "walk" && dist > 8) {
        const sp = 46 * dt;
        const ux = (n.tx - n.x) / (dist || 1);
        const uy = (n.ty - n.y) / (dist || 1);
        if (!isSolidPoint(n.x + ux * sp + Math.sign(ux) * 8, n.y)) n.x += ux * sp;
        if (!isSolidPoint(n.x, n.y + uy * sp + Math.sign(uy) * 8)) n.y += uy * sp;
        if (Math.abs(ux) > 0.2) n.facing = ux > 0 ? 1 : -1;
      } else if (n.pose === "walk" && dist <= 8) {
        // arrive: idle
        n.pose = Math.random() < 0.5 ? "sit" : "groom";
        n.waitUntil = this.time + 3 + Math.random() * 5;
      } else if (n.pose !== "walk" && n.def.wander && this.time > n.waitUntil) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 40 + Math.random() * 80;
        const nx = n.def.home.x + Math.cos(ang) * rad;
        const ny = n.def.home.y + Math.sin(ang) * rad;
        if (!isSolidPoint(nx, ny)) {
          n.tx = nx;
          n.ty = ny;
          n.pose = "walk";
        }
      }
      // ambient chatter: an idling cat nearby occasionally speaks
      if (
        this.cb.onNpcIdle &&
        n.pose !== "walk" &&
        !this.paused &&
        Math.random() < 0.0012 &&
        Math.hypot(n.x - this.px, n.y - this.py) < 200
      ) {
        this.cb.onNpcIdle(n.def.name, n.def.lines[Math.floor(Math.random() * n.def.lines.length)]);
      }
    }

    // --- chat bubbles: prune expired so they never linger or duplicate ---
    if (this.bubbles.length > 0) {
      const now = Date.now();
      this.bubbles = this.bubbles.filter((b) => b.until > now);
    }

    // --- remote interpolation: render inside a short buffer of SERVER states
    // (interpolate-at-a-delay), briefly extrapolate when a packet is late,
    // and snap only on a large authoritative correction. Old/duplicate
    // packets can never move a cat backward: each buffer sample carries the
    // server tick that produced it. ---
    for (const [uid, r] of this.remotes) {
      const nowMs = this.time * 1000;
      const wallMs = performance.now();
      // serverTick is a Date.now() stamp of the moment the server processed
      // the state — use it as the sample's timeline position
      const serverNowMs = (r as unknown as { serverTick?: number }).serverTick;
      let cur = this.remoteRender.get(uid);
      if (!cur) {
        // fresh snapshot (first sight or reconnect): start exactly at the
        // authoritative position — never reuse stale interpolation state
        const s = this.remoteStateOf(r, nowMs, serverNowMs);
        cur = { x: s.x, y: s.y, facing: s.facing, pose: s.pose, serverTick: s.serverTick, receivedAt: s.receivedAt, buffer: [s], animMs: wallMs % 100000, lastSpeedPxS: 0 };
        this.remoteRender.set(uid, cur);
        continue;
      }
      const tick = r.serverTick ?? 0;
      if (tick > cur.serverTick) {
        // a newer server state arrived: buffer it (bounded) and advance
        const s = this.remoteStateOf(r, nowMs, serverNowMs);
        const last = cur.buffer[cur.buffer.length - 1];
        if (last && Math.hypot(s.x - last.x, s.y - last.y) > REMOTE_SNAP_DIST) {
          // discontinuity: the cat teleported server-side (correction,
          // reconnect). Reset the timeline to the new truth and snap now.
          cur.buffer = [s];
          cur.x = s.x;
          cur.y = s.y;
          cur.pose = s.pose;
          cur.serverTick = tick;
          cur.receivedAt = s.receivedAt;
          cur.animMs = wallMs % 100000;
          continue;
        }
        // ignore out-of-order/duplicate samples (jitter protection)
        if (!last || s.receivedAt > last.receivedAt) {
          cur.buffer.push(s);
          while (cur.buffer.length > 6 || cur.buffer[cur.buffer.length - 1].receivedAt - cur.buffer[0].receivedAt > REMOTE_BUFFER_MS) {
            cur.buffer.shift();
            if (cur.buffer.length <= 1) break;
          }
        }
        cur.serverTick = tick;
        cur.receivedAt = s.receivedAt;
      }
      this.stepRemoteRender(cur, dt, wallMs);
    }
    for (const uid of [...this.remoteRender.keys()]) {
      if (!this.remotes.has(uid)) this.remoteRender.delete(uid);
    }

    // --- survival needs: slow, unobtrusive drain (paused-safe) ---
    if (!this.paused && !this.dead) {
      this.needs.drain(dt, this.sneaking, running, swimmingNow);
      if (this.needs.hunger <= 0) {
        this.needs.health = Math.max(0, this.needs.health - dt * 0.35);
      } else if (this.needs.hunger > 60 && this.needs.health < 100) {
        this.needs.health = Math.min(100, this.needs.health + dt * 0.4);
      }
      if (this.needs.energy <= 0) {
        // exhausted: no running on an empty tank
        this.running = false;
      }
    }
    // --- prey AI ---
    if (!this.paused && this.prey.length < PREY_MAX && Math.random() < 0.02) this.respawnPreyTick();

    // --- Thunderpath danger: cars HURT (road is lethal, as in the books) ---
    if (!this.paused && !this.dead && !this.interiorId && Math.abs(this.py - TP_Y) < 46 && this.pSpeed > 6) {
      const hit = trafficList().some((v) => {
        const vy = vehicleLaneY(v.dir);
        if (Math.abs(this.py - vy) > 16) return false;
        const L = v.kind === "car" ? 62 : v.kind === "truck" ? 96 : 150;
        return Math.abs(this.px - v.x) < L / 2 + 10;
      });
      if (hit) {
        this.engineSfx("hit", { volume: 1, throttleMs: 0 });
        this.startDeath("car");
      }
    }
    if (!this.interiorId) {
      for (const p of this.prey) {
        if (p.phase !== "alive") continue; // dying/dead prey: AI fully stopped
        const dToPlayer = Math.hypot(this.px - p.x, this.py - p.y);
        // flee from the player unless sneaking
        if (dToPlayer < PREY_FLEE_DIST && !this.sneaking) {
          p.fleeing = true;
          const ang = Math.atan2(p.y - this.py, p.x - this.px);
          const sp = (p.kind === "bird" || p.kind === "rabbit" ? 150 : 110) * dt;
          const nx = p.x + Math.cos(ang) * sp;
          const ny = p.y + Math.sin(ang) * sp;
          if (!isSolidPoint(nx, ny)) {
            p.x = nx;
            p.y = ny;
          } else {
            p.x += Math.cos(ang + Math.PI / 2) * sp;
            p.y += Math.sin(ang + Math.PI / 2) * sp;
          }
          if (ang > -Math.PI / 2 && ang < Math.PI / 2) p.facing = 1;
          else p.facing = -1;
        } else {
          p.fleeing = false;
          const d = Math.hypot(p.tx - p.x, p.ty - p.y);
          if (d < 4) {
            if (this.time > p.waitUntil) {
              const ang = Math.random() * Math.PI * 2;
              const rad = 10 + Math.random() * 40;
              p.tx = p.home.x + Math.cos(ang) * rad;
              p.ty = p.home.y + Math.sin(ang) * rad;
              p.waitUntil = this.time + 1 + Math.random() * 3;
            }
          } else {
            const sp = 30 * dt;
            const ux = (p.tx - p.x) / d;
            const uy = (p.ty - p.y) / d;
            p.x += ux * sp;
            p.y += uy * sp;
            if (Math.abs(ux) > 0.2) p.facing = ux > 0 ? 1 : -1;
          }
        }
        // NOTE: walking over prey does NOT kill it. Prey only dies when the
        // player deliberately pounces (press E on the "Pounce — <animal>"
        // prompt) via pounceAt(). Crouch-walking close keeps it calm.
      }
      // hard despawn: dying prey is removed from the active world entirely
      this.prey = this.prey.filter((p) => p.phase === "alive" || this.time < p.deadUntil);
    }

    // --- waypoint: distance + arrival (outside AND inside buildings) ---
    if (this.waypoint) {
      const dTiles = Math.hypot(this.waypoint.x - this.px, this.waypoint.y - this.py) / 32;
      const meters = Math.round(dTiles * 6);
      const arrived = !this.waypointArrived && dTiles <= 1.5; // ~9 m arrival radius
      if (arrived) this.waypointArrived = true;
      if (this.time - this.lastWaypointEmit > 0.25) {
        this.lastWaypointEmit = this.time;
        this.cb.onWaypoint?.({
          meters,
          tiles: Math.round(dTiles),
          arrived,
        });
      }
      if (arrived) {
        this.waypoint = null;
        this.cb.onWaypoint?.({ meters: 0, tiles: 0, arrived: true });
      }
    }

    // --- area + nearby detection ---
    const area = areaAt(this.px, this.py);
    const areaName = this.interiorId
      ? interiors[this.interiorId]?.name ?? "Inside"
      : area?.name ?? "Warrior Territories";
    if (areaName !== this.lastArea) {
      this.lastArea = areaName;
      this.cb.onAreaChange(areaName, this.interiorId ?? area?.id ?? "");
    }

    let near: NearbyTarget | null = null;
    let bestD = 88;
    if (!this.interiorId) {
      // walk-through entrances: step up to any doorway or den mouth and the
      // player walks straight in — no key needed. Re-entry is armed only
      // after stepping away, so exiting never bounces you back inside.
      let nearDoor: string | null = null;
      for (const o of allObjects) {
        if (!o.interior || !o.doorAt) continue;
        // door point: the doorway gap on the object's south face. Solid dens
        // (bushes/brambles/log piles) can't be walked into, so the trigger
        // radius extends OUTSIDE the collision box — walk up to the entrance
        // and you step in (E also works via the nearby prompt).
        const doorX = o.x + o.doorAt.dx * 32;
        const doorY = o.y + o.h / 2 + o.doorAt.dy * 32;
        const th = o.solid ? Math.max(30, o.w * 0.28) : Math.max(20, o.w * 0.16);
        if (Math.hypot(doorX - this.px, doorY - this.py) < th) {
          nearDoor = o.interior;
          break;
        }
      }
      if (!nearDoor) {
        this.doorArmed = true;
      } else if (this.doorArmed && !this.paused && this.time > this.doorCooldownUntil) {
        const doorObj = allObjects.find(
          (o) => o.interior === nearDoor && o.doorAt,
        );
        this.enterInterior(
          nearDoor,
          doorObj ? { id: doorObj.id, x: doorObj.x, y: doorObj.y, w: doorObj.w, h: doorObj.h } : undefined,
        );
      } else if (!this.doorArmed && this.time > this.doorCooldownUntil + 1.4) {
        // standing at a doorway for a moment re-arms it — predictable re-entry
        // without ever bouncing straight back after an exit
        this.doorArmed = true;
      }
      for (const o of allObjects) {
        if (o.detail) continue; // garnish never shows an interact prompt
        const d = Math.hypot(o.x - this.px, o.y - this.py);
        if (d < bestD) {
          bestD = d;
          // interior objects show "Enter <label>" and work with E as well as
          // the walk-in trigger
          near = {
            kind: "object",
            label: o.interior ? `Enter ${o.label ?? o.id}` : o.label ?? o.id,
            interact: o.interact,
            interior: o.interior,
          };
        }
      }
      for (const n of this.npcStates) {
        const d = Math.hypot(n.x - this.px, n.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "npc", label: n.def.name, npcId: n.def.id };
        }
      }
      // prey nearby (pounce!)
      for (const p of this.prey) {
        if (p.phase !== "alive") continue; // dead prey is not targetable
        const d = Math.hypot(p.x - this.px, p.y - this.py);
        if (d < 60 && d < bestD) {
          bestD = d;
          near = { kind: "prey", label: `Pounce — ${p.kind}`, preyId: p.id };
        }
      }
      // remote players
      for (const [, r] of this.remotes) {
        const d = Math.hypot(r.x - this.px, r.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "remote", label: r.catName, remoteUserId: r.userId };
        }
      }
    } else {
      const room = interiors[this.interiorId];
      for (const prop of room.props) {
        const pp = propPx(room.id, prop);
        const d = Math.hypot(pp.x - this.px, pp.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: prop.label };
        }
      }
      // NPCs inside (same stable in-room positions as the renderer)
      for (const npcId of room.npcs ?? []) {
        const n = this.npcStates.find((s) => s.def.id === npcId);
        if (!n) continue;
        const gw3 = ROOM_GEO[room.id]?.w ?? ROOM_W;
        const gh3 = ROOM_GEO[room.id]?.h ?? ROOM_H;
        const hx = 2.5 + hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (gw3 - 6);
        const hy = 2.5 + hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (gh3 - 6);
        const d = Math.hypot(hx * 32 + 16 - this.px, hy * 32 + 16 - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "npc", label: n.def.name, npcId: n.def.id };
        }
      }
      // exit door hint (walk-out is primary; E still works near the gap)
      const geoHint = ROOM_GEO[room.id];
      const gwx = ((geoHint?.w ?? ROOM_W) / 2) * 32;
      const ghy = ((geoHint?.h ?? ROOM_H) - 1) * 32;
      const doorD = Math.hypot(gwx - this.px, ghy - this.py);
      if (doorD < 70 && !near) {
        near = { kind: "object", label: "Leave the den", interact: "exit-interior" as unknown as InteractableKind };
      }
    }
    const changed =
      (near === null) !== (this.lastNearby === null) ||
      (near && this.lastNearby &&
        (near.label !== this.lastNearby.label || near.kind !== this.lastNearby.kind || near.preyId !== this.lastNearby.preyId));
    if (changed) {
      this.lastNearby = near;
      this.cb.onNearby(near);
    }

    if (this.time - this.lastMoveEmit > 0.2) {
      this.lastMoveEmit = this.time;
      this.cb.onMove(this.px, this.py);
    }

    if (this.emoteUntil && this.time > this.emoteUntil) {
      this.pEmote = null;
      this.emoteUntil = 0;
    }
  }

  // -------------------------------------------------------------------------

  private render() {
    const { ctx, canvas } = this;
    const cw = canvas.width / this.dpr;
    const ch = canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.interiorId ? "#1d1812" : "#2c4a30";
    ctx.fillRect(0, 0, cw, ch);

    if (this.interiorId) {
      this.renderInterior(cw, ch);
    } else {
      this.renderWorld(cw, ch);
    }

    // --- cinematic lighting stack (outdoors only — interiors are sheltered) ---
    const na = this.nightAlpha();
    const gold = this.goldenHour();
    const dark = this.env.dark;
    if (!this.interiorId) {
      // wet/rain darkening
      if (dark > 0.01) {
        ctx.fillStyle = `rgba(28, 36, 54, ${dark})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      // golden hour wash (sunrise 5–7, sunset 18.5–20)
      if (gold > 0.02 && na < 0.5) {
        ctx.fillStyle = `rgba(255, 166, 66, ${0.16 * gold * (1 - na)})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    // night: moonlight blue (never a flat black screen)
    if (na > 0) {
      const moon = this.moonPhase();
      ctx.fillStyle = `rgba(16, 22, 48, ${0.52 * na})`;
      ctx.fillRect(0, 0, cw, ch);
      if (moon > 0.55) {
        // bright moon: soft blue highlights + faint moon in the corner sky
        ctx.fillStyle = `rgba(150, 175, 235, ${0.1 * moon * na})`;
        ctx.fillRect(0, 0, cw, ch);
        const mg = ctx.createRadialGradient(cw * 0.85, ch * 0.12, 2, cw * 0.85, ch * 0.12, 46);
        mg.addColorStop(0, `rgba(235,240,255,${0.8 * na})`);
        mg.addColorStop(1, "rgba(235,240,255,0)");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(cw * 0.85, ch * 0.12, 46, 0, Math.PI * 2);
        ctx.fill();
      }
      // stars
      if (na > 0.5) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 46; i++) {
          const hx = hash2(i, 7);
          const hy = hash2(i, 13);
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * (0.5 + hx) + i));
          ctx.globalAlpha = (na - 0.5) * 2 * tw * 0.8;
          ctx.fillRect(hx * cw, hy * ch * 0.55, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
    }
    }
    // weather overlays (rain, fog, cloud cover) + ambient particles — outside only
    if (!this.interiorId) {
      this.renderWeather(cw, ch);
      this.drawMotes(cw, ch);
    }

    // vignette
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(10,16,10,0.34)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }

  private renderInterior(cw: number, ch: number) {
    const ctx = this.ctx;
    const room = interiors[this.interiorId!];
    if (!room) return;

    const geo = ROOM_GEO[room.id] ?? { w: ROOM_W, h: ROOM_H, cave: false, floor: ["#5a4632", "#50402c", "#66543a"], wall: ["#4a3826", "#5a4736"] };
    const RW = geo.w;
    const RH = geo.h;
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX, -this.camY);

    // dark surround beyond the room
    ctx.fillStyle = "#171310";
    ctx.fillRect(-800, -800, RW * 32 + 1600, RH * 32 + 1600);
    // floor in the room's own palette (base + mottled speckle + worn paths)
    ctx.fillStyle = geo.floor[0];
    ctx.fillRect(0, 0, RW * 32, RH * 32);
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const h = hash2(x, y);
        if (h > 0.72) {
          ctx.fillStyle = geo.floor[2];
          ctx.fillRect(x * 32, y * 32, 32, 32);
        } else if (h > 0.5) {
          ctx.fillStyle = geo.floor[1];
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x * 32, y * 32, 32, 32);
          ctx.globalAlpha = 1;
        }
        if (h < 0.06) {
          // sparse floor detail: pebbles / wood knots
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.beginPath();
          ctx.arc(x * 32 + hash2(x * 3, y) * 24 + 4, y * 32 + hash2(y * 3, x) * 24 + 4, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // walls with per-room color + lit top edge
    for (let y = 0; y < room.walls.length; y++) {
      for (let x = 0; x < room.walls[y].length; x++) {
        if (room.walls[y][x] === "1") {
          ctx.fillStyle = geo.wall[0];
          ctx.fillRect(x * 32, y * 32, 32, 32);
          ctx.fillStyle = geo.wall[1];
          ctx.fillRect(x * 32, y * 32, 32, 5);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(x * 32, y * 32 + 27, 32, 5);
        }
      }
    }
    // props (remapped into this room's real bounds)
    for (const prop of room.props) {
      const pp = propPx(room.id, prop);
      const x = pp.x;
      const y = pp.y;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      switch (prop.style) {
        case "sofa": this.drawSofa(x, y, 46, 24); break;
        case "chair": this.drawChair(x, y, 22, 20); break;
        case "table": this.drawTable(x, y, 40, 24); break;
        case "bed": this.drawBed(x, y, 44, 30); break;
        case "cabinet": this.drawCabinet(x, y, 34, 26); break;
        case "shelf": this.drawShelf(x, y, 40, 14); break;
        case "books": this.drawBooks(x, y, 26, 14); break;
        case "box": this.drawBox(x, y, 26, 18); break;
        case "window": this.drawWindow(x, y, 0, 0); break;
        case "plant": this.drawPlant(x, y, 0, 0); break;
        case "post": this.drawPost(x, y, 24, 34); break;
        case "blanket": this.drawBlanket(x, y, 30, 14); break;
        case "nest":
          ctx.fillStyle = "#8a7a5a";
          ctx.beginPath();
          ctx.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#a3936c";
          ctx.beginPath();
          ctx.ellipse(x, y - 2, 10, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "herbs":
          drawHerbPatch(ctx, x, y, this.time);
          break;
        case "stone":
          ctx.fillStyle = "#9fa1a6";
          ctx.beginPath();
          ctx.ellipse(x, y, 10, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          if (prop.id === "stone") {
            const g = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 26);
            g.addColorStop(0, "rgba(220,235,255,0.9)");
            g.addColorStop(1, "rgba(220,235,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y - 6, 26, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "moss":
          ctx.fillStyle = "#5f8f4e";
          ctx.beginPath();
          ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "plank":
          ctx.fillStyle = "#7a5b3a";
          ctx.fillRect(x - 14, y - 6, 28, 12);
          break;
        case "hay":
          ctx.fillStyle = "#c9a84a";
          ctx.beginPath();
          ctx.ellipse(x, y, 15, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a8873a";
          ctx.lineWidth = 1;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 4, y - 8);
            ctx.lineTo(x + i * 4, y + 8);
            ctx.stroke();
          }
          break;
        case "bowl":
          ctx.fillStyle = "#6a7d8a";
          ctx.beginPath();
          ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = prop.id === "bowl" ? "#a5714a" : "#7fa8c9";
          ctx.beginPath();
          ctx.ellipse(x, y - 1.5, 6.5, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "vines":
          // trailing roots / hanging greenery / drying herbs
          ctx.strokeStyle = "#4a6a3a";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x - 10, y - 10);
          ctx.quadraticCurveTo(x + Math.sin(this.time + x) * 3, y, x - 6, y + 10);
          ctx.moveTo(x + 8, y - 12);
          ctx.quadraticCurveTo(x + Math.cos(this.time + x) * 3, y - 2, x + 12, y + 8);
          ctx.stroke();
          ctx.fillStyle = "#56804a";
          ctx.beginPath();
          ctx.ellipse(x, y, 3, 2, 0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "toy": {
          // a proper yarn ball: wound threads, highlight, trailing string
          const ballR = 6.5;
          const ballC = prop.id;
          const hueShift = (ballC.charCodeAt(3) % 4) * 25;
          ctx.fillStyle = ["#c9607f", "#6f86c9", "#b0a13c", "#5aa07a"][Math.min(3, Math.floor(hueShift / 25))] ?? "#d977a0";
          ctx.beginPath();
          ctx.arc(x, y - 3, ballR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(40, 25, 35, 0.45)";
          ctx.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.ellipse(x, y - 3, ballR * (0.9 - k * 0.22), ballR * 0.38, (k * 55 + hueShift) * (Math.PI / 180), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(x - ballR * 0.35, y - 3 - ballR * 0.4, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle = "rgba(220,180,200,0.8)";
          ctx.beginPath();
          ctx.moveTo(x + ballR * 0.9, y - 1);
          ctx.quadraticCurveTo(x + ballR + 6, y + 4, x + ballR + 10, y - 2 + Math.sin(this.time * 2) * 1.5);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          break;
        }
        case "carpet":
          // household rug
          ctx.fillStyle = "rgba(150, 70, 60, 0.9)";
          ctx.beginPath();
          ctx.roundRect(x - 20, y - 14, 40, 28, 4);
          ctx.fill();
          ctx.strokeStyle = "rgba(220, 200, 170, 0.5)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(x - 16, y - 10, 32, 20, 3);
          ctx.stroke();
          break;
        case "lamp":
          // twoleg lamp with warm glow
          ctx.fillStyle = "#5a4a3a";
          ctx.fillRect(x - 2, y - 14, 4, 14);
          ctx.fillStyle = "#ffe9a8";
          ctx.beginPath();
          ctx.ellipse(x, y - 16, 8, 5, 0, Math.PI, 0);
          ctx.fill();
          {
            const lg = ctx.createRadialGradient(x, y - 16, 2, x, y - 16, 34);
            lg.addColorStop(0, "rgba(255, 230, 160, 0.3)");
            lg.addColorStop(1, "rgba(255, 230, 160, 0)");
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.arc(x, y - 16, 34, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
      }
    }
    // NPCs assigned to this room (drawn at a stable in-room spot; a stable
    // hash keeps each cat in its own corner instead of at world coords that
    // may sit outside the room)
    for (const npcId of room.npcs ?? []) {
      const n = this.npcStates.find((s) => s.def.id === npcId);
      if (!n) continue;
      const gw2 = geo?.w ?? ROOM_W;
      const gh2 = geo?.h ?? ROOM_H;
      const hx = 2.5 + hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (gw2 - 6);
      const hy = 2.5 + hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (gh2 - 6);
      const nxp = hx * 32 + 16;
      const nyp = hy * 32 + 16;
      drawCat(ctx, n.def, nxp, nyp, n.facing, n.pose === "walk" ? "sit" : n.pose, this.animClock(), n.phase);
      if (Math.random() < 0.0015 && performance.now() - this.lastNpcMewAt > 6000) {
        this.lastNpcMewAt = performance.now();
        this.engineSfx("mew", { volume: 0.5, throttleMs: 400 });
      }
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      const tw = ctx.measureText(n.def.name).width;
      ctx.beginPath();
      ctx.roundRect(nxp - tw / 2 - 6, nyp - 40, tw + 12, 17, 8);
      ctx.fill();
      ctx.fillStyle = "#f4f1e8";
      ctx.fillText(n.def.name, nxp, nyp - 28);
    }
    // player (lifted mid-hop; the cat sprite itself is unchanged)
    drawCat(ctx, this.playerSkin(), this.px, this.py - this.hopLiftPx(), this.pxFacing, this.pPose, this.animClock(), 0);
    // bubbles anchored to the player are drawn indoors too
    for (const b of this.bubbles) {
      if (b.track !== "player" || Date.now() > b.until) continue;
      ctx.font = "500 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      const tw = Math.min(220, ctx.measureText(b.text).width + 14);
      const lines = wrapText(ctx, b.text, 200);
      const bh = 16 + lines.length * 13;
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.beginPath();
      ctx.roundRect(this.px - tw / 2, this.py - 52 - bh, tw, bh, 9);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      lines.forEach((ln, i) => ctx.fillText(ln, this.px, this.py - 52 - bh + 16 + i * 13));
      ctx.fillStyle = "rgba(90,90,110,0.9)";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText(b.name, this.px, this.py - 50);
    }
    // exit door hint
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("↓ leave through the gap", (geo.w / 2) * 32, (geo.h - 0.4) * 32);

    ctx.restore();

    // warm interior lamp glow — sheltered from outside weather and night
    const glow = ctx.createRadialGradient(cw / 2, ch / 2, 60, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    glow.addColorStop(0, "rgba(255, 224, 160, 0.06)");
    glow.addColorStop(1, "rgba(60, 40, 20, 0.16)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);
  }

  private playerSkin(): CatSkin {
    return this.mySkin ?? { fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e", chest: "#f4e9d8", pattern: "solid" };
  }

  /** Set by React with the player's saved appearance. */
  public mySkin: CatSkin | null = null;

  private renderWorld(cw: number, ch: number) {
    const { ctx } = this;
    const halfW = cw / 2 / this.scale;
    const halfH = ch / 2 / this.scale;
    this.camX = Math.max(halfW, Math.min(WORLD_W - halfW, this.camX));
    this.camY = Math.max(halfH, Math.min(WORLD_H - halfH, this.camY));

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX, -this.camY);

    const viewL = this.camX - halfW - 40;
    const viewR = this.camX + halfW + 40;
    const viewT = this.camY - halfH - 40;
    const viewB = this.camY + halfH + 80;

    this.drawGround(viewL, viewT, viewR, viewB);
    this.drawGroundDeco(viewL, viewT, viewR, viewB);
    this.drawFlora(viewL, viewT, viewR, viewB);
    this.drawFallingLeaves(viewL, viewT, viewR, viewB);
    this.drawDepthBand(ctx, viewL, viewT, viewR, viewB);
    this.drawCloudShadows();

    type Entity = { y: number; draw: () => void };
    const ents: Entity[] = [];

    for (const tr of trees) {
      if (tr.x < viewL - 60 || tr.x > viewR + 60 || tr.y < viewT - 80 || tr.y > viewB + 60) continue;
      ents.push({ y: tr.y, draw: () => this.drawTree(tr.x, tr.y, tr.r, tr.pine, tr.tint) });
    }
    for (const b of campWall) {
      if (b.x < viewL - 60 || b.x > viewR + 60 || b.y < viewT - 60 || b.y > viewB + 60) continue;
      ents.push({
        y: b.y,
        draw: () => {
          ctx.fillStyle = "#4a3b28";
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#5f4c33";
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(b.x - 8 + i * 8, b.y - 4, b.r * 0.4, Math.PI * 0.2, Math.PI * 1.05);
            ctx.stroke();
          }
          ctx.fillStyle = "#33502f";
          ctx.beginPath();
          ctx.arc(b.x + Math.sin(b.tint * 9) * 6, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        },
      });
    }
    for (const o of allObjects) {
      if (o.x < viewL - 90 || o.x > viewR + 90 || o.y < viewT - 90 || o.y > viewB + 90) continue;
      const s = o.scale ?? 1;
      const w = o.w * s;
      const h = o.h * s;
      ents.push({
        y: o.y,
        draw: () => {
          switch (o.style) {
            case "tree": this.drawTree(o.x, o.y, Math.max(34, Math.min(84, (o.w + o.h) * 0.3)), false, hash2(Math.round(o.x), Math.round(o.y))); break;
            case "bramble": this.drawBramble(o.x, o.y, w, h); break;
            case "bush": this.drawBush(o.x, o.y, w, h); break;
            case "log": this.drawLog(o.x, o.y, w, h); break;
            case "rock": this.drawRock(o.x, o.y, w, h); break;
            case "stone": this.drawStone(o.x, o.y, w, h); break;
            case "fresh-kill": drawFreshKillPile(ctx, o.x, o.y); break;
            case "stump": this.drawStump(o.x, o.y, w * 0.45); break;
            case "tallrock-big": drawTallRock(ctx, o.x, o.y, w, h); break;
            case "house": drawHouse(ctx, o.x, o.y, w, h, { doorway: !!o.interior }); break;
            case "barn": drawBarn(ctx, o.x, o.y, w, h); break;
            case "fence": drawFence(ctx, o.x, o.y, w, h); break;
            case "cave": drawCave(ctx, o.x, o.y, w, h); break;
            case "reeds": drawReeds(ctx, o.x, o.y, w, h, this.time); break;
            case "flowerbed": drawFlowerBed(ctx, o.x, o.y, w, h); break;
            case "herbs": drawHerbPatch(ctx, o.x, o.y, this.time); break;
            case "nest": this.drawBush(o.x, o.y, w, h); break;
            case "prey-pile": drawFreshKillPile(ctx, o.x, o.y); break;
            // content-expansion styles
            case "feathers": this.drawFeathers(o.x, o.y, w, h); break;
            case "mudpatch": this.drawMudPatch(o.x, o.y, w, h); break;
            case "puddle": this.drawPuddle(o.x, o.y, w, h); break;
            case "driftwood": this.drawDriftwood(o.x, o.y, w, h); break;
            case "burrow": this.drawBurrow(o.x, o.y, w, h); break;
            case "mossball": this.drawMossBall(o.x, o.y, w, h); break;
            case "vines": this.drawVines(o.x, o.y, w, h); break;
            case "toy": this.drawToy(o.x, o.y, w, h); break;
            case "carpet": this.drawCarpet(o.x, o.y, w, h); break;
            case "lamp": this.drawLamp(o.x, o.y, w, h); break;
            case "plank": this.drawPlank(o.x, o.y, w, h); break;
            case "haybale": this.drawHaybale(o.x, o.y, w, h); break;
            case "fishing-spot": this.drawFishingSpot(o.x, o.y, w, h); break;
            case "door": this.drawDoor(o.x, o.y, w, h); break;
          }
          // detail objects are pure garnish — nothing extra to draw.
          // Never touch the ctx.save/restore stack here: an unbalanced restore
          // pops the camera transform and vanishes the world.
          void o.detail;
          // den entrance: an actual dark doorway arch (no floating dot)
          if (o.interior && !o.detail) {
            drawDenEntrance(ctx, o.x, o.y + h * 0.28, Math.max(26, w * 0.34));
          }
        },
      });
    }
    // prey (killed prey renders briefly in a death pose, then despawns)
    for (const p of this.prey) {
      if (p.phase === "removed" || (p.phase === "dying" && this.time > p.deadUntil)) continue;
      if (p.x < viewL || p.x > viewR || p.y < viewT || p.y > viewB) continue;
      ents.push({
        y: p.y,
        draw: () =>
          drawPrey(
            ctx,
            p.kind as PreySprite,
            p.x,
            p.y,
            p.facing,
            false,
            this.time,
            p.seed,
            p.phase === "dying",
          ),
      });
    }
    // NPCs
    for (const n of this.npcStates) {
      if (n.x < viewL - 60 || n.x > viewR + 60 || n.y < viewT - 60 || n.y > viewB + 60) continue;
      ents.push({
        y: n.y,
        draw: () => {
          drawCat(ctx, n.def, n.x, n.y, n.facing, n.pose, this.time, n.phase);
          const d = Math.hypot(n.x - this.px, n.y - this.py);
          if (d < 130) {
            ctx.font = "600 11px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            const tw = ctx.measureText(n.def.name).width;
            ctx.beginPath();
            ctx.roundRect(n.x - tw / 2 - 6, n.y - 40, tw + 12, 17, 8);
            ctx.fill();
            ctx.fillStyle = "#f4f1e8";
            ctx.fillText(n.def.name, n.x, n.y - 28);
          }
        },
      });
    }
    // remote players (interpolated render state: position + synchronized pose)
    for (const [, r] of this.remotes) {
      const rp = this.remoteRender.get(r.userId);
      if (!rp) continue;
      if (rp.x < viewL - 60 || rp.x > viewR + 60 || rp.y < viewT - 60 || rp.y > viewB + 60) continue;
      ents.push({
        y: rp.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y - (this.waterAt(rp.x, rp.y) ? 4 + Math.sin(this.time * SWIM_BOB_HZ * Math.PI * 2 + (r.userId.charCodeAt(0) % 10)) * 2 : 0),
            (rp.facing >= 0 ? 1 : -1) as 1 | -1,
            rp.pose,
            rp.animMs / 1000,
            (r.userId.charCodeAt(0) % 10),
          );
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          const label = r.catName;
          const sub = [r.clan, r.rank].filter(Boolean).map((s) => s!.charAt(0).toUpperCase() + s!.slice(1)).join(" · ");
          const tw = Math.max(ctx.measureText(label).width, sub ? ctx.measureText(sub).width * 1 : 0);
          ctx.fillStyle = "rgba(24,34,52,0.62)";
          ctx.beginPath();
          ctx.roundRect(rp.x - tw / 2 - 7, rp.y - 47, tw + 14, sub ? 29 : 17, 8);
          ctx.fill();
          ctx.fillStyle = "#dbe8ff";
          ctx.fillText(label, rp.x, rp.y - 35);
          if (sub) {
            ctx.font = "500 9px system-ui, sans-serif";
            ctx.fillStyle = "rgba(186, 208, 240, 0.95)";
            ctx.fillText(sub, rp.x, rp.y - 24);
          }
        },
      });
    }
    // player
    ents.push({
      y: this.py,
      draw: () => {
        // player (lifted mid-hop; the cat sprite itself is unchanged). In water
    // the cat sits lower (only head/back above the surface) with ripple rings.
    const pw = this.waterAt(this.px, this.py);
    if (pw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(viewL - 4, viewT - 4, viewR - viewL + 8, viewB - viewT + 8);
      ctx.clip();
      ctx.strokeStyle = "rgba(214, 236, 248, 0.5)";
      ctx.lineWidth = 1.4;
      const rr = 13 + Math.sin(this.time * SWIM_BOB_HZ * Math.PI * 2) * 2;
      ctx.beginPath();
      ctx.ellipse(this.px, this.py + 2, rr, rr * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawCat(
      ctx,
      { ...this.playerSkin(), size: (this.playerSkin().size ?? 1) * 1.05 },
      this.px,
      this.py - this.hopLiftPx() - (pw ? 4 + Math.sin(this.time * SWIM_BOB_HZ * Math.PI * 2) * 2 : 0),
      this.pxFacing,
      this.pPose,
      this.time,
      0,
    );
        if (this.pEmote) {
          ctx.font = "18px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(this.pEmote, this.px, this.py - 46);
        }
      },
    });

    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // Thunderpath traffic + tunnel portals (vehicles exist ONLY on the road;
    // they spawn inside a tunnel and vanish into the tunnel on the other side)
    if (this.time >= this.trafficPausedUntil && viewT < TP_Y + 200 && viewB > TP_Y - 320) {
      updateTraffic(dt, this.time);
      drawTunnelPortal(ctx, 6, -1);
      drawTunnelPortal(ctx, WORLD_W - 6, 1);
      for (const v of trafficList()) {
        if (v.x < viewL - 200 || v.x > viewR + 200) continue;
        drawVehicle(ctx, v);
      }
    }

    // waypoint beacon + directional arrow (world space, floats over the cat)
    if (this.waypoint) {
      const ang = Math.atan2(this.waypoint.y - this.py, this.waypoint.x - this.px);
      const t = this.time;
      const bob = Math.sin(t * 2.2) * 4;
      // floating beacon over the cat: ring + arrow pointing along `ang`
      const ax = this.px;
      const ay = this.py - 62 + bob;
      // soft glow disc
      const glow = ctx.createRadialGradient(ax, ay, 2, ax, ay, 26);
      glow.addColorStop(0, "rgba(255, 200, 80, 0.35)");
      glow.addColorStop(1, "rgba(255, 200, 80, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ax, ay, 26, 0, Math.PI * 2);
      ctx.fill();
      // rotating arrow — world direction, smooth, points behind the player too
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      const wob = Math.sin(t * 6) * 0.06;
      ctx.rotate(wob);
      ctx.fillStyle = "#ffc653";
      ctx.strokeStyle = "rgba(90, 55, 10, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // dotted guide line toward the target (first 90 px)
      ctx.strokeStyle = "rgba(255, 198, 83, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.px + Math.cos(ang) * 22, this.py - 8 + Math.sin(ang) * 22);
      ctx.lineTo(this.px + Math.cos(ang) * 110, this.py - 8 + Math.sin(ang) * 110);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // chat bubbles (world space, anchored to the cat they belong to)
    for (const b of this.bubbles) {
      if (Date.now() > b.until) continue;
      let bx = b.x;
      let by = b.y;
      if (b.track === "player") {
        // follow MY cat every frame
        bx = this.px;
        by = this.py;
      } else if (b.track) {
        // follow the remote cat (interpolated); drop if that player left
        const r = this.remoteRender.get(b.track) ?? this.remotes.get(b.track);
        if (!r) continue;
        bx = r.x;
        by = r.y;
      }
      ctx.font = "500 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      const tw = Math.min(220, ctx.measureText(b.text).width + 14);
      const lines = wrapText(ctx, b.text, 200);
      const bh = 16 + lines.length * 13;
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.beginPath();
      ctx.roundRect(bx - tw / 2, by - 52 - bh, tw, bh, 9);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      lines.forEach((ln, i) => ctx.fillText(ln, bx, by - 52 - bh + 16 + i * 13));
      ctx.fillStyle = "rgba(90,90,110,0.9)";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText(b.name, bx, by - 50);
    }

    this.drawLeaves();

    ctx.restore();
  }

  private drawGround(viewL: number, viewT: number, viewR: number, viewB: number) {
    const { ctx } = this;
    const c0 = Math.max(0, Math.floor(viewL / GROUND_CELL));
    const r0 = Math.max(0, Math.floor(viewT / GROUND_CELL));
    const c1 = Math.min(GROUND_COLS - 1, Math.ceil(viewR / GROUND_CELL));
    const r1 = Math.min(GROUND_ROWS - 1, Math.ceil(viewB / GROUND_CELL));

    const waterWave = Math.sin(this.time * 1.6) * 0.06;
    const shimmer = Math.sin(this.time * 2.1) * 0.04;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const kind = groundMap[r * GROUND_COLS + c];
        const h = hash2(c, r);
        const pair = GROUND_COLORS[kind] ?? GROUND_COLORS[0];
        ctx.fillStyle = h > (kind === 2 ? 0.5 - waterWave : 0.5) ? pair[0] : pair[1];
        ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL, GROUND_CELL + 0.5, GROUND_CELL + 0.5);
        if (kind === 2) {
          // water cells: depth shading + moving highlight ribbons
          const depth = hash2(c * 7, r * 3);
          ctx.fillStyle = depth > 0.6 ? "rgba(20, 60, 96, 0.35)" : "rgba(40, 90, 130, 0.22)";
          ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL, GROUND_CELL + 0.5, GROUND_CELL + 0.5);
          const bandY = r * GROUND_CELL + ((Math.sin(this.time * 1.3 + c * 0.9 + r * 0.4) * 0.5 + 0.5) * GROUND_CELL);
          ctx.fillStyle = `rgba(190, 225, 245, ${0.14 + shimmer})`;
          ctx.fillRect(c * GROUND_CELL, bandY, GROUND_CELL + 0.5, 2);
          // flow streaks: highlights drift consistently downstream (west->east)
          const flow = ((this.time * 14 + c * GROUND_CELL) % 96) / 96;
          ctx.fillStyle = "rgba(210, 236, 250, 0.13)";
          ctx.fillRect(c * GROUND_CELL + flow * GROUND_CELL, r * GROUND_CELL + 3, 5, 1.4);
          ctx.fillRect(c * GROUND_CELL + ((flow + 0.45) % 1) * GROUND_CELL, r * GROUND_CELL + GROUND_CELL - 5, 4, 1.2);
          // shoreline: soft sand lip + shallow rim where water meets land
          const above = groundMap[(r - 1) * GROUND_COLS + c] !== undefined ? groundMap[(r - 1) * GROUND_COLS + c] : 0;
          const below = groundMap[(r + 1) * GROUND_COLS + c] !== undefined ? groundMap[(r + 1) * GROUND_COLS + c] : 0;
          if (above !== 2) {
            ctx.fillStyle = "rgba(186, 200, 148, 0.5)";
            ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL, GROUND_CELL + 0.5, 2.4);
            ctx.fillStyle = "rgba(226, 240, 248, 0.3)";
            ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL + 2.4, GROUND_CELL + 0.5, 1.2);
          }
          if (below !== 2) {
            ctx.fillStyle = "rgba(186, 200, 148, 0.5)";
            ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL + GROUND_CELL - 2.4, GROUND_CELL + 0.5, 2.4);
            ctx.fillStyle = "rgba(226, 240, 248, 0.3)";
            ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL + GROUND_CELL - 3.6, GROUND_CELL + 0.5, 1.2);
          }
          // sparkle
          if (h > 0.93) {
            ctx.fillStyle = "rgba(235, 248, 255, 0.5)";
            ctx.fillRect(c * GROUND_CELL + 10, bandY - 6, 3, 1.5);
          }
        }
      }
    }

    // Thunderpath dashes (it spans the map at y = 42..46 tiles)
    const tpY = 44 * 32;
    if (viewT < tpY + 64 && viewB > tpY - 64) {
      ctx.fillStyle = "rgba(240,225,160,0.7)";
      for (let x = Math.floor(Math.max(0, viewL) / 80) * 80; x < Math.min(WORLD_W, viewR); x += 80) {
        ctx.fillRect(x, tpY - 2, 40, 4);
      }
    }

    // camp floor ring
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(CAMP_CENTER.x, CAMP_CENTER.y, CAMP_RADIUS - 6, 0, Math.PI * 2);
    ctx.stroke();

    // --- wet ground after/during rain: darker tint + puddles on flat kinds ---
    if (this.env.rain > 0.05 || this.env.fog > 0.6) {
      const wet = Math.min(1, this.env.rain * 1.3);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const kind = groundMap[r * GROUND_COLS + c];
          if (kind === GROUND_WATER) continue;
          const h = hash2(c * 3, r * 5);
          const px = c * GROUND_CELL;
          const py = r * GROUND_CELL;
          if (h < 0.14 * wet && (kind === GROUND_PAVED || h < 0.09 * wet)) {
            // puddle
            ctx.fillStyle = `rgba(120, 150, 185, ${0.28 * wet})`;
            ctx.beginPath();
            ctx.ellipse(px + 4 + h * 6, py + 4 + h * 8, 3.5 + h * 5, 2 + h * 3, h * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // overall damp sheen
      ctx.fillStyle = `rgba(40, 60, 90, ${0.12 * wet})`;
      ctx.fillRect(Math.max(0, viewL), Math.max(0, viewT), viewR - Math.max(0, viewL), viewB - Math.max(0, viewT));
    }
  }

  /** Soft cloud shadows drifting across the world (world-space). */
  /** Forest-floor litter: leaves, stones, soil patches, tiny flowers. */
  private drawGroundDeco(viewL: number, viewT: number, viewR: number, viewB: number) {
    const ctx = this.ctx;
    for (const d of groundDeco) {
      if (d.x < viewL - 12 || d.x > viewR + 12 || d.y < viewT - 12 || d.y > viewB + 12) continue;
      const kind = d.kind;
      const a = d.a;
      if (kind === "litter") {
        const tints = ["rgba(122, 96, 46, 0.55)", "rgba(150, 116, 58, 0.5)", "rgba(96, 118, 52, 0.45)"];
        ctx.fillStyle = tints[Math.floor(a * 3) % 3];
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.2 * d.s, 1.7 * d.s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (kind === "stone") {
        ctx.fillStyle = "rgba(128, 128, 124, 0.6)";
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 2.6 * d.s, 1.9 * d.s, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.ellipse(d.x - d.s * 0.7, d.y - d.s * 0.5, d.s * 0.9, d.s * 0.5, a, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "soil") {
        ctx.fillStyle = "rgba(92, 72, 46, 0.22)";
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 9 * d.s, 5.5 * d.s, a, 0, Math.PI * 2);
        ctx.fill();
        if (d.s > 1.05) {
          ctx.fillStyle = "rgba(70, 54, 34, 0.3)";
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(d.x + (i - 1) * 3.5 * d.s, d.y + (i % 2 ? 2 : -2) * d.s, 1.4, 1.4);
          }
        }
      } else {
        const petals = ["#e8dd8f", "#d8a2c8", "#eef2f4"][Math.floor(a * 3) % 3];
        ctx.fillStyle = petals;
        for (let i = 0; i < 4; i++) {
          const ang = a + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(d.x + Math.cos(ang) * 1.8 * d.s, d.y + Math.sin(ang) * 1.8 * d.s, 1.3 * d.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#c9a227";
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1 * d.s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Forest-depth band: darker, bluer background trees far above the camera. */
  private drawDepthBand(ctx: CanvasRenderingContext2D, viewL: number, viewT: number, viewR: number, viewB: number) {
    if (viewT > 520) return; // camera far from the top edge: nothing to draw
    const a = Math.min(0.45, Math.max(0.1, (520 - viewT) / 420));
    for (let x = Math.floor(viewL / 90) * 90; x < viewR + 90; x += 90) {
      const seed = hash2(x, 77);
      const tx = x + seed * 40;
      const th = 90 + seed * 80;
      const ty = viewT + 20 - th * (0.55 + seed * 0.4);
      ctx.fillStyle = "rgba(20, 42, 26, " + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(tx - 26, viewT + 30);
      ctx.quadraticCurveTo(tx - 20, ty + th * 0.4, tx, ty);
      ctx.quadraticCurveTo(tx + 20, ty + th * 0.4, tx + 26, viewT + 30);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Occasional falling leaves near the camera (world-space, sparse). */
  private drawFallingLeaves(viewL: number, viewT: number, viewR: number, viewB: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 10; i++) {
      const seed = hash2(i, 999);
      const px = viewL + ((seed * 9973 + this.time * (9 + seed * 8)) % (viewR - viewL));
      const py = viewT + ((seed * 6151 + this.time * (16 + seed * 12)) % (viewB - viewT));
      ctx.fillStyle = seed > 0.5 ? "rgba(150, 116, 58, 0.75)" : "rgba(96, 118, 52, 0.7)";
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.sin(this.time * 2 + i * 2.1) * 0.8 + seed * 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawCloudShadows() {
    // Only genuinely overcast skies cast cloud shadows — never a clear day
    // or a clear night (env.dark rises at night, so gate on the weather kind,
    // not darkness alone).
    if (this.weather === "clear") return;
    if (this.weather === "snow") return;
    if (this.env.dark < 0.06) return;
    if (this.env.rain > 0.4 || this.env.fog > 0.35) return; // rain/fog hide shadows
    const ctx = this.ctx;
    const t = this.time;
    for (let i = 0; i < 4; i++) {
      const cx = this.camX + ((i * 917 + t * 12 * (1 + i * 0.3)) % 1600) - 800;
      const cy = this.camY + ((i * 611 + Math.sin(t * 0.1 + i) * 300) % 900) - 450;
      const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 420);
      grad.addColorStop(0, `rgba(10, 20, 12, ${0.1 * this.env.dark})`);
      grad.addColorStop(1, "rgba(10, 20, 12, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 420, 240, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Ambient particles: pollen by day, fireflies at night, snowfall. */
  private drawMotes(cw: number, ch: number) {
    const ctx = this.ctx;
    const na = this.nightAlpha();
    if (this.motes.length === 0) {
      for (let i = 0; i < 40; i++) {
        this.motes.push({
          x: Math.random() * cw,
          y: Math.random() * ch,
          vx: (Math.random() - 0.5) * 10,
          vy: -3 - Math.random() * 6,
          r: 1 + Math.random() * 1.6,
          seed: Math.random() * 100,
        });
      }
    }
    const isSnow = this.weather === "snow";
    const firefly = na > 0.55;
    for (const m of this.motes) {
      if (isSnow) {
        // snow drifts down in screen space
        m.y += (24 + m.seed % 20) * 0.016;
        m.x += Math.sin(this.time * 1.4 + m.seed) * 0.6 + this.env.wind * 1.2;
        if (m.y > ch) { m.y = -4; m.x = Math.random() * cw; }
        if (m.x > cw) m.x = 0;
        if (m.x < 0) m.x = cw;
        ctx.fillStyle = "rgba(240, 246, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        m.x += (m.vx + this.env.wind * 14) * 0.016;
        m.y += m.vy * 0.016;
        if (m.y < -6) { m.y = ch + 6; m.x = Math.random() * cw; }
        if (m.x < -6) m.x = cw + 6;
        if (m.x > cw + 6) m.x = -6;
        const a = firefly ? 0.5 + 0.5 * Math.sin(this.time * 2.2 + m.seed) : 0.16;
        ctx.fillStyle = firefly ? `rgba(220, 255, 140, ${0.55 * a})` : `rgba(255, 244, 200, ${a})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFlora(viewL: number, viewT: number, viewR: number, viewB: number) {
    const { ctx } = this;
    const gust = 0.5 + this.env.wind * this.windGust();
    for (const f of flora) {
      if (f.x < viewL || f.x > viewR || f.y < viewT || f.y > viewB) continue;
      const sway = Math.sin(this.time * 1.8 + f.x * 0.05) * 1.2 * gust;
      const s = (f as { s?: number }).s ?? 1;
      switch (f.kind) {
        case "tuft": {
          ctx.strokeStyle = f.tint > 0.5 ? "#57964f" : "#4c8a47";
          ctx.lineWidth = 1.4;
          const h = 8 + f.tint * 6;
          ctx.beginPath();
          ctx.moveTo(f.x - 3 * s, f.y);
          ctx.quadraticCurveTo(f.x - 4 * s + sway, f.y - h * 0.6, f.x - 5 * s + sway, f.y - h);
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + sway * 0.5, f.y - h - 2);
          ctx.moveTo(f.x + 3 * s, f.y);
          ctx.quadraticCurveTo(f.x + 4 * s + sway, f.y - h * 0.6, f.x + 5 * s + sway, f.y - h * 0.8);
          ctx.stroke();
          break;
        }
        case "fern": {
          ctx.strokeStyle = f.tint > 0.5 ? "#3e7a41" : "#356d38";
          ctx.lineWidth = 1.2;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(f.x, f.y);
            ctx.quadraticCurveTo(f.x + i * 4 * s + sway, f.y - 8 * s, f.x + i * 7 * s + sway, f.y - 13 * s);
            ctx.stroke();
          }
          break;
        }
        case "flower": {
          ctx.strokeStyle = "#4c8a47";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + sway, f.y - 8);
          ctx.stroke();
          ctx.fillStyle = f.tint > 0.5 ? "#e5c95c" : f.tint > 0.25 ? "#d977a0" : "#c96a5a";
          ctx.beginPath();
          ctx.arc(f.x + sway, f.y - 10, 2.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "mushroom": {
          // tiny mushrooms on the damp forest floor
          ctx.fillStyle = "#e8e0d0";
          ctx.fillRect(f.x - 1 * s, f.y - 4 * s, 2 * s, 4 * s);
          ctx.fillStyle = f.tint > 0.5 ? "#b5654a" : "#c98a5a";
          ctx.beginPath();
          ctx.ellipse(f.x, f.y - 4.5 * s, 2.6 * s, 1.7 * s, 0, Math.PI, 0);
          ctx.fill();
          break;
        }
        case "leaves": {
          // scattered fallen leaves
          ctx.fillStyle = f.tint > 0.5 ? "rgba(160,130,60,0.55)" : "rgba(130,110,50,0.5)";
          for (let i = 0; i < 3; i++) {
            const lx = f.x + (i - 1) * 5 * s;
            ctx.beginPath();
            ctx.ellipse(lx, f.y + i * 2 - 2, 3 * s, 1.5 * s, f.tint * 3 + i, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "roots": {
          // tree root flare
          ctx.strokeStyle = "rgba(90,70,48,0.85)";
          ctx.lineWidth = 2.2 * s;
          ctx.beginPath();
          ctx.moveTo(f.x - 6 * s, f.y + 2);
          ctx.quadraticCurveTo(f.x - 2 * s, f.y - 3 * s, f.x, f.y);
          ctx.quadraticCurveTo(f.x + 3 * s, f.y - 2 * s, f.x + 6 * s, f.y + 2);
          ctx.stroke();
          break;
        }
        case "stones": {
          // small stone cluster with moss
          ctx.fillStyle = "#83857f";
          ctx.beginPath();
          ctx.ellipse(f.x - 3 * s, f.y, 3.4 * s, 2.2 * s, 0, 0, Math.PI * 2);
          ctx.ellipse(f.x + 3.4 * s, f.y + 1, 2.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#95978d";
          ctx.beginPath();
          ctx.ellipse(f.x - 3.6 * s, f.y - 1.4 * s, 1.8 * s, 1.1 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          if (f.tint > 0.55) {
            ctx.fillStyle = "rgba(95,143,78,0.7)";
            ctx.beginPath();
            ctx.ellipse(f.x + 3 * s, f.y - 0.6, 1.8 * s, 0.9 * s, 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case "log": {
          // small fallen log, mossy side up
          ctx.fillStyle = "rgba(0,0,0,0.16)";
          ctx.beginPath();
          ctx.ellipse(f.x, f.y + 2.4, 11 * s, 3.4 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#66503a";
          ctx.beginPath();
          ctx.roundRect(f.x - 10 * s, f.y - 3.6 * s, 20 * s, 6 * s, 3 * s);
          ctx.fill();
          ctx.fillStyle = "#7a6248";
          ctx.beginPath();
          ctx.ellipse(f.x + 10 * s, f.y - 0.6 * s, 1.8 * s, 3 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(95,143,78,0.75)";
          ctx.beginPath();
          ctx.ellipse(f.x - 3 * s, f.y - 3.6 * s, 4.4 * s, 1.2 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
  }

  private leaves: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  private drawLeaves() {
    const { ctx } = this;
    if (this.weather === "wind" || this.weather === "storm") {
      if (this.leaves.length < 26) {
        for (let i = this.leaves.length; i < 26; i++) {
          this.leaves.push({
            x: this.camX + (Math.random() - 0.5) * 1200,
            y: this.camY + (Math.random() - 0.5) * 800,
            vx: -40 - Math.random() * 40,
            vy: 10 + Math.random() * 16,
            r: Math.random() * Math.PI * 2,
          });
        }
      }
    } else if (this.leaves.length < 12) {
      for (let i = this.leaves.length; i < 12; i++) {
        this.leaves.push({
          x: this.camX + (Math.random() - 0.5) * 1200,
          y: this.camY + (Math.random() - 0.5) * 800,
          vx: -14 - Math.random() * 18,
          vy: 8 + Math.random() * 10,
          r: Math.random() * Math.PI * 2,
        });
      }
    }
    ctx.fillStyle = "rgba(214, 178, 96, 0.5)";
    for (const l of this.leaves) {
      l.x += l.vx * 0.016;
      l.y += l.vy * 0.016;
      l.r += 0.02;
      if (l.x < this.camX - 700) l.x = this.camX + 700;
      if (l.y > this.camY + 500) l.y = this.camY - 500;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.r);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderWeather(cw: number, ch: number) {
    const { ctx } = this;
    const t = this.time;

    // ---- rain / storm / heavy-rain (proportional to env.rain) ----
    if (this.env.rain > 0.02) {
      const target = Math.round(this.env.rain * (this.env.rain > 0.7 ? 170 : 90));
      while (this.raindrops.length < target) {
        this.raindrops.push({ x: Math.random() * cw, y: Math.random() * ch, v: 480 + Math.random() * 320 });
      }
      if (this.raindrops.length > target) this.raindrops.length = target;
      const slant = 40 + this.env.wind * 90;
      ctx.strokeStyle = `rgba(178, 198, 228, ${0.3 + 0.25 * this.env.rain})`;
      ctx.lineWidth = 1;
      for (const d of this.raindrops) {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - slant * 0.02, d.y + 12);
        ctx.stroke();
        if (!this.paused) {
          d.y += d.v * 0.016;
          d.x -= slant * 0.016;
          if (d.y > ch) {
            d.y = -10;
            d.x = Math.random() * (cw + 60);
          }
        }
      }
      // splash ripples along the bottom of the screen
      ctx.strokeStyle = `rgba(200, 215, 235, ${0.25 * this.env.rain})`;
      for (let i = 0; i < 6; i++) {
        const hx = hash2(i, Math.floor(t * 6)) * cw;
        const hy = ch - 6 - hash2(i, Math.floor(t * 6) + 40) * 18;
        ctx.beginPath();
        ctx.ellipse(hx, hy, 3 + hash2(i, 3) * 4, 1.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- snow ----
    if (this.weather === "snow") {
      ctx.fillStyle = "rgba(235, 242, 250, 0.9)";
      for (let i = 0; i < 60; i++) {
        const hx = (hash2(i, 3) * cw + Math.sin(t * 0.7 + i) * 30 + this.env.wind * 60) % cw;
        const hy = (hash2(i, 9) * ch + t * (26 + (i % 7) * 9)) % ch;
        ctx.beginPath();
        ctx.arc(hx, hy, 1.3 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(235, 242, 250, 0.08)";
      ctx.fillRect(0, 0, cw, ch);
    }

    // ---- fog: layered ground mist that drifts like real fog ----
    // Several stacked horizontal bands, each a wide soft ribbon with an
    // irregular top edge (drawn with overlapping wide rounded strokes, not
    // circles), slowly sliding sideways and thinning toward the sky.
    if (this.env.fog > 0.03) {
      const f = this.env.fog;
      // vertical wash: thicker at the ground, clear sky above
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, `rgba(204, 212, 220, ${0.05 * f})`);
      g.addColorStop(0.55, `rgba(206, 214, 222, ${0.16 * f})`);
      g.addColorStop(1, `rgba(210, 218, 224, ${0.3 * f})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      // drifting mist bands
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const depth = i / (bands - 1); // 0 = far/high, 1 = near/low
        const speed = 14 + depth * 30;
        const y = ch * (0.34 + depth * 0.6) + Math.sin(t * 0.22 + i * 1.7) * 12;
        const h = ch * (0.1 + depth * 0.13);
        const alpha = (0.05 + 0.1 * depth) * f;
        // each band is a chain of wide, soft horizontal lobes
        const lobes = 6;
        const period = (cw + 520) / lobes;
        ctx.fillStyle = `rgba(212, 219, 226, ${alpha})`;
        for (let L = -1; L < lobes + 1; L++) {
          const lx = ((t * speed + L * period + i * 137) % (cw + 520)) - 260;
          const lh = h * (0.7 + 0.3 * Math.sin(t * 0.5 + L * 2.1 + i));
          ctx.beginPath();
          ctx.ellipse(lx, y, period * 0.72, lh, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // faint mist threads close to the ground for texture
      ctx.strokeStyle = `rgba(216, 222, 228, ${0.07 * f})`;
      ctx.lineWidth = 8;
      for (let i = 0; i < 4; i++) {
        const wy = ch * (0.78 + i * 0.05);
        const wx = ((t * (26 + i * 9)) % (cw + 400)) - 200;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 120, wy - 8, wx + 260, wy);
        ctx.stroke();
      }
    }

    // ---- wind streaks ----
    if (this.env.wind > 0.55) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + 0.05 * this.env.wind})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const wy = (hash2(i, 21) * ch + t * 130 * (0.6 + hash2(i, 5))) % ch;
        const wx = (t * (170 + i * 26)) % (cw + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 40, wy - 4, wx + 90, wy);
        ctx.stroke();
      }
    }

    // ---- overcast / storm darkening ----
    if (this.env.dark > 0.02) {
      ctx.fillStyle =
        this.weather === "storm"
          ? `rgba(18, 26, 44, ${0.16 * this.env.dark})`
          : `rgba(60, 80, 110, ${0.14 * this.env.dark})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    // lightning flash
    if (this.weather === "storm" && Math.random() < 0.004) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(0, 0, cw, ch);
    }
    void this.fogOffset;
  }

  // prop draw helpers (kept local so world.ts stays data-only)
  /**
   * Stylized trees: oak / pine / birch (species chosen per-tree via tint).
   * Layered foliage clusters with highlights, tapered trunk with bark
   * texture, root flare, and shadow — readable and lush, never a blob.
   */
  private drawTree(x: number, y: number, r: number, pine: boolean, tint: number) {
    const ctx = this.ctx;
    const sway = Math.sin(this.time * 1.1 + x * 0.03) * (1 + this.env.wind * this.windGust() * 6);
    const s = tint; // 0..1 variation seed
    // shadow
    ctx.fillStyle = "rgba(10, 20, 12, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 5, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    const species = pine ? "pine" : s < 0.18 ? "birch" : "oak";
    const trunkH = r * (species === "pine" ? 0.95 : 0.62);

    // root flare
    ctx.fillStyle = "#4c3b28";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.22, y - 2);
    ctx.quadraticCurveTo(x - r * 0.34, y + 3, x - r * 0.44, y + 6);
    ctx.lineTo(x + r * 0.44, y + 6);
    ctx.quadraticCurveTo(x + r * 0.34, y + 3, x + r * 0.22, y - 2);
    ctx.closePath();
    ctx.fill();

    // trunk (tapered) + bark strokes
    ctx.fillStyle = species === "birch" ? "#d8d3c4" : "#5d4a33";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.12, y - trunkH);
    ctx.quadraticCurveTo(x - r * 0.09, y - trunkH * 0.4, x - r * 0.14, y - 2);
    ctx.lineTo(x + r * 0.14, y - 2);
    ctx.quadraticCurveTo(x + r * 0.09, y - trunkH * 0.4, x + r * 0.12, y - trunkH);
    ctx.closePath();
    ctx.fill();
    if (species === "birch") {
      ctx.fillStyle = "rgba(60,60,56,0.55)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - r * 0.1 + (i % 2) * 4, y - trunkH + 8 + i * 10, 6 + (i % 2) * 3, 2);
      }
    } else {
      ctx.strokeStyle = "rgba(40,28,16,0.4)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const bx = x - r * 0.06 + i * r * 0.06;
        ctx.beginPath();
        ctx.moveTo(bx, y - 4);
        ctx.quadraticCurveTo(bx + 2, y - trunkH * 0.5, bx - 1, y - trunkH + 6);
        ctx.stroke();
      }
    }
    // a branch reaching out (oak only)
    if (species === "oak") {
      ctx.strokeStyle = "#54432e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.05, y - trunkH * 0.72);
      ctx.quadraticCurveTo(x + r * 0.4, y - trunkH * 0.95, x + r * 0.62, y - trunkH * 1.05);
      ctx.stroke();
    }

    ctx.save();
    // layered sway: the canopy drifts a little further than the trunk's
    // lean, so trees bend subtly instead of rigidly sliding sideways
    ctx.translate(sway, Math.sin(this.time * 1.1 + x * 0.03 + 1.3) * 0.4 * (1 + this.env.wind * 2));
    if (species === "pine") {
      // layered boughs, darkest at the bottom
      const layers = 4;
      for (let i = layers; i >= 1; i--) {
        const ly = y - trunkH * (1 - i / (layers + 1)) - r * 0.18;
        const lw = r * (0.4 + i * 0.2);
        const lh = r * 0.7;
        ctx.fillStyle = i % 2 === 0 ? "#2b5734" : "#34683f";
        ctx.beginPath();
        ctx.moveTo(x - lw, ly);
        ctx.quadraticCurveTo(x - lw * 0.4, ly - lh * 0.7, x, ly - lh);
        ctx.quadraticCurveTo(x + lw * 0.4, ly - lh * 0.7, x + lw, ly);
        ctx.closePath();
        ctx.fill();
        // rim light on each bough
        ctx.strokeStyle = "rgba(140, 200, 130, 0.28)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - lw * 0.75, ly - lh * 0.28);
        ctx.quadraticCurveTo(x, ly - lh * 0.92, x + lw * 0.75, ly - lh * 0.28);
        ctx.stroke();
      }
    } else {
      // canopy: layered clusters, light from upper-left
      const leafA = species === "birch" ? "#6fae5c" : s > 0.5 ? "#4a8a4c" : "#417f45";
      const leafB = species === "birch" ? "#84c06a" : "#4f9852";
      const leafC = species === "birch" ? "#9ed07d" : "#5daa5d";
      const cy = y - trunkH - r * 0.34;
      const clusters: [number, number, number][] = [
        [-r * 0.52, r * 0.08, r * 0.5],
        [r * 0.5, r * 0.02, r * 0.52],
        [-r * 0.22, -r * 0.3, r * 0.56],
        [r * 0.28, -r * 0.26, r * 0.54],
        [0, -r * 0.06, r * 0.62],
      ];
      for (const [dx, dy, cr] of clusters) {
        ctx.fillStyle = leafA;
        ctx.beginPath();
        ctx.arc(x + dx, cy + dy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
      // mid tone
      ctx.fillStyle = leafB;
      ctx.beginPath();
      ctx.arc(x - r * 0.16, cy - r * 0.2, r * 0.42, 0, Math.PI * 2);
      ctx.arc(x + r * 0.26, cy - r * 0.14, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      // highlight
      ctx.fillStyle = leafC;
      ctx.beginPath();
      ctx.arc(x - r * 0.1, cy - r * 0.42, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      // scattered leaf dabs for texture
      ctx.fillStyle = "rgba(255,255,240,0.12)";
      for (let i = 0; i < 5; i++) {
        const lx = x - r * 0.6 + hash2(i, Math.floor(x)) * r * 1.2;
        const ly = cy - r * 0.5 + hash2(i, Math.floor(y)) * r * 0.9;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 2.6, 1.4, hash2(i, 3) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawBramble(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.42, w * 0.62, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a4632";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.55, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6e573c";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x - w * 0.2 + i * w * 0.14, y - h * 0.08, w * 0.3, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
    }
    ctx.fillStyle = "#241c12";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.12, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBush(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const s = Math.abs(Math.sin(x * 0.53 + y * 0.21));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.4, w * 0.6, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark under-layer
    ctx.fillStyle = s > 0.5 ? "#2f5c3a" : "#356340";
    ctx.beginPath();
    ctx.arc(x - w * 0.26, y - h * 0.08, w * 0.36, 0, Math.PI * 2);
    ctx.arc(x + w * 0.26, y - h * 0.08, w * 0.36, 0, Math.PI * 2);
    ctx.arc(x, y - h * 0.3, w * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // mid layer
    ctx.fillStyle = s > 0.5 ? "#3d7248" : "#437a4d";
    ctx.beginPath();
    ctx.arc(x - w * 0.16, y - h * 0.26, w * 0.3, 0, Math.PI * 2);
    ctx.arc(x + w * 0.2, y - h * 0.22, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // highlights (light from upper-left)
    ctx.fillStyle = "#549159";
    ctx.beginPath();
    ctx.arc(x - w * 0.12, y - h * 0.4, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(140, 200, 130, 0.35)";
    ctx.beginPath();
    ctx.arc(x - w * 0.3, y - h * 0.18, w * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // berry dots on some bushes
    if (s > 0.72) {
      ctx.fillStyle = "#b5484a";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x - w * 0.2 + i * w * 0.2, y - h * (0.15 + (i % 2) * 0.2), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLog(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.58, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a5138";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - h * 0.32, w, h * 0.64, h * 0.32);
    ctx.fill();
    ctx.fillStyle = "#7d6144";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - h * 0.32, w, h * 0.28, h * 0.28);
    ctx.fill();
    ctx.fillStyle = "#4f7a43";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x - w * 0.3 + i * w * 0.3, y + h * 0.05, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRock(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const s = Math.abs(Math.sin(x * 0.37 + y * 0.11));
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.4, w * 0.58, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    // base body: irregular faceted silhouette (two variants)
    ctx.fillStyle = s > 0.5 ? "#84868c" : "#8d8f94";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y + h * 0.32);
    ctx.lineTo(x - w * 0.42, y - h * 0.14);
    ctx.lineTo(x - w * (0.18 + s * 0.1), y - h * 0.48);
    ctx.lineTo(x + w * (0.12 + s * 0.08), y - h * 0.52);
    ctx.lineTo(x + w * 0.4, y - h * 0.16);
    ctx.lineTo(x + w * 0.5, y + h * 0.32);
    ctx.closePath();
    ctx.fill();
    // lit facet
    ctx.fillStyle = "#a3a5aa";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y - h * 0.14);
    ctx.lineTo(x - w * (0.18 + s * 0.1), y - h * 0.48);
    ctx.lineTo(x + w * (0.12 + s * 0.08), y - h * 0.52);
    ctx.lineTo(x + w * 0.05, y - h * 0.05);
    ctx.closePath();
    ctx.fill();
    // crack
    ctx.strokeStyle = "rgba(40,42,48,0.5)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y - h * 0.4);
    ctx.lineTo(x + w * 0.02, y - h * 0.12);
    ctx.lineTo(x + w * 0.16, y + h * 0.18);
    ctx.stroke();
    // moss patch on some rocks
    if (s > 0.55) {
      ctx.fillStyle = "rgba(96, 142, 84, 0.75)";
      ctx.beginPath();
      ctx.ellipse(x - w * 0.24, y - h * 0.3, w * 0.16, h * 0.12, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120, 168, 104, 0.6)";
      ctx.beginPath();
      ctx.ellipse(x - w * 0.28, y - h * 0.34, w * 0.08, h * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStone(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#84868b";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a3a5aa";
    ctx.beginPath();
    ctx.ellipse(x - w * 0.1, y - h * 0.14, w * 0.26, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- content-expansion prop renderers ----

  private drawFeathers(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + w;
      ctx.fillStyle = i % 2 === 0 ? "rgba(235,230,215,0.85)" : "rgba(180,170,150,0.8)";
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * w * 0.3, y + Math.sin(a) * h * 0.3, 2.6, 1.1, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMudPatch(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(90, 70, 48, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(74, 57, 38, 0.5)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.12, y + h * 0.08, w * 0.3, h * 0.24, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPuddle(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 1, x, y, Math.max(w, h) * 0.5);
    g.addColorStop(0, "rgba(150, 180, 210, 0.55)");
    g.addColorStop(1, "rgba(120, 150, 185, 0.25)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.45, h * 0.35, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriftwood(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.45, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9a8a72";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.45, y - h * 0.28, w * 0.9, h * 0.5, h * 0.25);
    ctx.fill();
  }

  private drawBurrow(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#6d5433";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.34, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1f12";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120, 96, 62, 0.7)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.3, y - h * 0.14, w * 0.16, h * 0.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMossBall(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#4f7a43";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.4, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5f8f4e";
    ctx.beginPath();
    ctx.ellipse(x - w * 0.1, y - h * 0.1, w * 0.22, h * 0.16, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawVines(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#4a6a3a";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3 + i * w * 0.35, y - h * 0.3);
      ctx.quadraticCurveTo(x + Math.sin(i * 2.2) * w * 0.2, y, x - w * 0.2 + i * w * 0.3, y + h * 0.3);
      ctx.stroke();
    }
  }

  private drawToy(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#d977a0";
    ctx.beginPath();
    ctx.arc(x, y - 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y - 2, Math.min(w, h) * 0.3, 0.5, 2.4);
    ctx.stroke();
  }

  private drawCarpet(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(150, 70, 60, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.45, y - h * 0.35, w * 0.9, h * 0.7, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 200, 170, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.38, y - h * 0.28, w * 0.76, h * 0.56, 2);
    ctx.stroke();
  }

  private drawLamp(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#5a4a3a";
    ctx.fillRect(x - 1.5, y - h * 0.4, 3, h * 0.4);
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.45, w * 0.28, h * 0.2, 0, Math.PI, 0);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y - h * 0.45, 2, x, y - h * 0.45, w * 0.8);
    g.addColorStop(0, "rgba(255, 230, 160, 0.28)");
    g.addColorStop(1, "rgba(255, 230, 160, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.45, w * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlank(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    // bench-style: seat slab with visible legs
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.5, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a4028";
    ctx.lineWidth = 2.5;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * w * 0.36, y - h * 0.2);
      ctx.lineTo(x + sx * w * 0.36, y + h * 0.26);
      ctx.stroke();
    }
    ctx.fillStyle = "#7a5b3a";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - h * 0.3, w, h * 0.42, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x - w * 0.5, y - h * 0.3, w, 2);
  }

  // ---- real furniture renderers (recognizable silhouettes + materials) ----
  /** Fabric sofa: seat cushions, backrest, rolled arms, wooden feet. */
  private drawSofa(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.28, w * 0.55, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // backrest
    ctx.fillStyle = "#8a5a4a";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - h * 0.55, w, h * 0.5, 5);
    ctx.fill();
    // arms
    ctx.fillStyle = "#9c6a56";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.54, y - h * 0.4, w * 0.16, h * 0.55, 4);
    ctx.roundRect(x + w * 0.38, y - h * 0.4, w * 0.16, h * 0.55, 4);
    ctx.fill();
    // seat cushions
    ctx.fillStyle = "#a8765f";
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.roundRect(x - w * 0.4 + i * w * 0.42, y - h * 0.16, w * 0.38, h * 0.34, 4);
      ctx.fill();
    }
    // seams + feet
    ctx.strokeStyle = "rgba(60,30,20,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.02, y - h * 0.16);
    ctx.lineTo(x - w * 0.02, y + h * 0.18);
    ctx.stroke();
    ctx.fillStyle = "#5a4028";
    ctx.fillRect(x - w * 0.45, y + h * 0.18, 4, 4);
    ctx.fillRect(x + w * 0.41, y + h * 0.18, 4, 4);
  }
  /** Upholstered chair with a visible back. */
  private drawChair(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.5, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7d5a40";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.34, y - h * 0.6, w * 0.68, h * 0.42, 3); // back
    ctx.fill();
    ctx.fillStyle = "#937050";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.4, y - h * 0.2, w * 0.8, h * 0.42, 3); // seat
    ctx.fill();
    ctx.strokeStyle = "#4f3822";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, y + h * 0.22); ctx.lineTo(x - w * 0.3, y + h * 0.45);
    ctx.moveTo(x + w * 0.3, y + h * 0.22); ctx.lineTo(x + w * 0.3, y + h * 0.45);
    ctx.stroke();
  }
  /** Wooden table: top grain + four legs. */
  private drawTable(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.34, w * 0.55, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6844";
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.1, w * 0.52, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a07d52";
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.16, w * 0.48, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(80,55,30,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.14, w * 0.3, h * 0.09, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#5f452c";
    ctx.lineWidth = 2.5;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * w * 0.34, y - h * 0.06);
      ctx.lineTo(x + sx * w * 0.3, y + h * 0.4);
      ctx.stroke();
    }
  }
  /** Human bed: headboard, mattress, pillow, folded blanket. */
  private drawBed(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.55, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6d4a30"; // headboard
    ctx.fillRect(x - w * 0.5, y - h * 0.55, w, h * 0.28);
    ctx.fillStyle = "#d9cfc0"; // mattress
    ctx.beginPath();
    ctx.roundRect(x - w * 0.46, y - h * 0.3, w * 0.92, h * 0.62, 5);
    ctx.fill();
    ctx.fillStyle = "#f2ece0"; // pillow
    ctx.beginPath();
    ctx.roundRect(x - w * 0.36, y - h * 0.26, w * 0.32, h * 0.2, 4);
    ctx.fill();
    ctx.fillStyle = "#a8524a"; // folded blanket
    ctx.beginPath();
    ctx.roundRect(x - w * 0.46, y + h * 0.02, w * 0.92, h * 0.3, 4);
    ctx.fill();
  }
  /** Kitchen cabinet: doors, handles, counter top. */
  private drawCabinet(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.5, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7c5a3a";
    ctx.fillRect(x - w * 0.45, y - h * 0.6, w * 0.9, h * 0.95);
    ctx.fillStyle = "#8f6a45";
    ctx.fillRect(x - w * 0.38, y - h * 0.5, w * 0.32, h * 0.7);
    ctx.fillRect(x + w * 0.06, y - h * 0.5, w * 0.32, h * 0.7);
    ctx.fillStyle = "#d8c26a"; // handles
    ctx.fillRect(x - w * 0.09, y - h * 0.24, 2.5, 7);
    ctx.fillRect(x + w * 0.055, y - h * 0.24, 2.5, 7);
    ctx.fillStyle = "#b8b0a2"; // counter top
    ctx.fillRect(x - w * 0.5, y - h * 0.66, w, 5);
  }
  /** Wall shelf with small objects. */
  private drawShelf(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#6d5138";
    ctx.fillRect(x - w * 0.5, y - 2, w, 5);
    ctx.fillStyle = "#8a6844";
    ctx.fillRect(x - w * 0.5, y - 2, w, 2);
    // little curiosities on the shelf
    const colors = ["#b5533c", "#3f6b8a", "#c9a84a", "#5a7d4a"];
    for (let i = 0; i < 4; i++) {
      const ox = x - w * 0.36 + i * w * 0.24;
      ctx.fillStyle = colors[i % colors.length];
      if (i % 2 === 0) ctx.fillRect(ox, y - 11, 5, 9);
      else { ctx.beginPath(); ctx.arc(ox + 2.5, y - 6, 3.5, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  /** A small stack of books with spines. */
  private drawBooks(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const cols = ["#8a4a3a", "#3a5a7a", "#4a7a4a", "#7a6a3a", "#6a4a7a"];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = cols[i % cols.length];
      const bh = 11 - (i % 2);
      ctx.fillRect(x - w * 0.4 + i * 5.5, y - bh, 4.5, bh);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(x - w * 0.4 + i * 5.5 + 1, y - bh + 2, 2.4, bh - 4);
    }
    ctx.fillStyle = "#5f452c";
    ctx.fillRect(x - w * 0.45, y, w * 0.9, 3);
  }
  /** Cardboard box with open flaps. */
  private drawBox(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.24, w * 0.5, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b09062";
    ctx.fillRect(x - w * 0.4, y - h * 0.42, w * 0.8, h * 0.7);
    ctx.fillStyle = "#9c7c50";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.4, y - h * 0.42);
    ctx.lineTo(x - w * 0.52, y - h * 0.62);
    ctx.lineTo(x - w * 0.1, y - h * 0.52);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.4, y - h * 0.42);
    ctx.lineTo(x + w * 0.52, y - h * 0.62);
    ctx.lineTo(x + w * 0.1, y - h * 0.52);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,60,30,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w * 0.4, y - h * 0.42, w * 0.8, h * 0.7);
  }
  /** Window with panes and light. */
  private drawWindow(x: number, y: number, _w: number, _h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#7d6248";
    ctx.fillRect(x - 16, y - 13, 32, 24);
    ctx.fillStyle = "rgba(185, 220, 245, 0.95)";
    ctx.fillRect(x - 13, y - 10, 26, 18);
    ctx.strokeStyle = "#7d6248";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 8);
    ctx.moveTo(x - 13, y - 1); ctx.lineTo(x + 13, y - 1);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,220,0.4)";
    ctx.fillRect(x - 13, y - 10, 8, 18);
  }
  /** Potted plant with leaves. */
  private drawPlant(x: number, y: number, _w: number, _h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#a5643c";
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 6); ctx.lineTo(x + 8, y + 6);
    ctx.lineTo(x + 5.5, y - 4); ctx.lineTo(x - 5.5, y - 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#4a7a42";
    ctx.lineWidth = 2;
    for (const [dx, dy] of [[-6, -10], [0, -14], [6, -10], [-3, -8], [3, -12]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.quadraticCurveTo(x + dx * 0.6, y - 3 + dy * 0.6, x + dx, y + dy);
      ctx.stroke();
    }
    ctx.fillStyle = "#5d9450";
    for (const [dx, dy] of [[-6, -10], [0, -14], [6, -10]] as const) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, 3.2, 2, dx * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  /** Scratching post: base, wrapped column, top perch. */
  private drawPost(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + 5, w * 0.55, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6844";
    ctx.fillRect(x - w * 0.45, y - 2, w * 0.9, 6); // base
    ctx.fillStyle = "#c0a878";
    ctx.fillRect(x - 4, y - h * 0.7, 8, h * 0.7); // wrapped column
    ctx.strokeStyle = "rgba(120,90,50,0.6)";
    ctx.lineWidth = 1;
    for (let yy = y - h * 0.7 + 3; yy < y - 2; yy += 4) {
      ctx.beginPath();
      ctx.moveTo(x - 4, yy); ctx.lineTo(x + 4, yy);
      ctx.stroke();
    }
    ctx.fillStyle = "#8a6844";
    ctx.beginPath();
    ctx.roundRect(x - 11, y - h * 0.7 - 7, 22, 7, 2); // perch
    ctx.fill();
  }
  /** Folded blanket stack. */
  private drawBlanket(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const cols = ["#b56a4a", "#7a8ab0", "#c9b070"];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.roundRect(x - w * 0.42, y - 6 + i * 5, w * 0.84, 6, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x - w * 0.42, y - 6 + i * 5 + 1.5, w * 0.84, 1.5);
    }
  }

  private drawHaybale(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.32, w * 0.42, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a84a";
    ctx.beginPath();
    ctx.roundRect(x - w * 0.4, y - h * 0.35, w * 0.8, h * 0.65, 4);
    ctx.fill();
    ctx.strokeStyle = "#a8873a";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w * 0.22, y - h * 0.35);
      ctx.lineTo(x + i * w * 0.22, y + h * 0.3);
      ctx.stroke();
    }
  }

  private drawFishingSpot(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 1, x, y, w * 0.5);
    g.addColorStop(0, "rgba(160, 200, 230, 0.4)");
    g.addColorStop(1, "rgba(120, 160, 200, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 235, 250, 0.35)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y, i * 6 + Math.sin(this.time * 2 + x) * 1.5, i * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** A proper Twoleg front door: frame, panel, window, step — the visual
   *  cue that this entrance can be used (press E). */
  private drawDoor(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const dw = Math.max(18, w * 1.1);
    const dh = Math.max(26, h * 1.6);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + dh * 0.16, dw * 0.62, dh * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // frame
    ctx.fillStyle = "#7d6248";
    ctx.fillRect(x - dw / 2 - 3, y - dh, dw + 6, dh + 4);
    // door panel with grain
    ctx.fillStyle = "#8a6a48";
    ctx.fillRect(x - dw / 2, y - dh + 3, dw, dh - 2);
    ctx.strokeStyle = "rgba(60,40,24,0.5)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.strokeRect(x - dw / 2 + 3, y - dh + 3 + i * (dh / 3), dw - 6, dh / 3 - 3);
    }
    // little window in the upper panel
    ctx.fillStyle = "rgba(170, 210, 235, 0.9)";
    ctx.fillRect(x - dw * 0.18, y - dh + 8, dw * 0.36, dh * 0.18);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.strokeRect(x - dw * 0.18, y - dh + 8, dw * 0.36, dh * 0.18);
    // handle
    ctx.fillStyle = "#d8c26a";
    ctx.beginPath();
    ctx.arc(x + dw * 0.3, y - dh * 0.42, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // stone step
    ctx.fillStyle = "#9c9a94";
    ctx.fillRect(x - dw * 0.62, y + dh * 0.12, dw * 1.24, 5);
    // welcome mat
    ctx.fillStyle = "#7a5c3c";
    ctx.fillRect(x - dw * 0.4, y + dh * 0.12 + 5, dw * 0.8, 4);
  }

  private drawStump(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a5138";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#57422d";
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r * (i / 4), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- remote networking helpers ------------------------------------------

  /** Normalize an incoming server state into a buffered sample. */
  private remoteStateOf(r: RemotePlayer, nowMs: number, serverNowMs?: number): RemoteStateSample {
    const ms = r.movementState ?? (r.moving ? "walk" : "idle");
    const anim = r.animationState ?? (r.moving ? "walk" : "sit");
    return {
      x: r.x,
      y: r.y,
      facing: r.facing,
      pose: this.poseFromMovement(ms, anim),
      serverTick: r.serverTick ?? 0,
      // prefer the SERVER clock (stateVersion = server tick time) so the
      // interpolation timeline is immune to client receive jitter; fall back
      // to local arrival time only when the server time is unknown
      receivedAt: typeof serverNowMs === "number" ? serverNowMs : nowMs,
    };
  }

  /** Movement state -> draw pose, using the game's existing 2D poses. */
  private poseFromMovement(ms: MovementState, anim: CatPose): CatPose {
    // swimming is carried purely in the animation state (movementState stays
    // "walk") and must always draw the swim sprite
    if (anim === "swim") return "swim";
    // animation state drives the sprite; movement state only disambiguates
    // idle-like anims so a moving cat can never draw an idle pose.
    if (ms === "walk" || ms === "run") return "walk";
    if (ms === "crouch") return "crouch";
    // ms === "idle": show the synchronized idle-like pose (sit/sleep/groom…)
    return anim === "walk" || anim === "crouch" ? "sit" : anim;
  }

  /**
   * Advance one remote cat's render state along its buffered server timeline.
   * Strategy: interpolate ~REMOTE_INTERP_DELAY_MS behind the newest sample;
   * if the timeline is exhausted (late packet), coast briefly along the last
   * velocity, then hold position; large desyncs snap (authoritative fix).
   */
  private stepRemoteRender(cur: RemoteRenderState, dt: number, wallMs: number) {
    const buf = cur.buffer;
    if (buf.length === 0) return;
    const latest = buf[buf.length - 1];
    const serverNow = latest.receivedAt;
    const targetMs = serverNow - REMOTE_INTERP_DELAY_MS;

    // --- locate the two samples surrounding the delayed render time ---
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].receivedAt > targetMs) i--;
    const a = buf[Math.max(0, i - 1)];
    const b = buf[i];

    let nx: number;
    let ny: number;
    // visuals come from the INTERPOLATED timeline position, not the newest
    // packet: pose/facing must always match the movement being drawn
    let pose: CatPose = b.pose;
    let facing = b.facing;

    if (b.receivedAt >= targetMs && b.receivedAt > a.receivedAt) {
      // between two real server states: interpolate (smooth, ordered)
      const span = b.receivedAt - a.receivedAt;
      const t = Math.min(1, Math.max(0, (targetMs - a.receivedAt) / span));
      nx = a.x + (b.x - a.x) * t;
      ny = a.y + (b.y - a.y) * t;
      // visuals blend along the same segment
      const fa = a.facing !== b.facing && t > 0.5 ? b.facing : a.facing;
      facing = fa;
      pose = t > 0.5 ? b.pose : a.pose;
      if (a.pose === "walk" || b.pose === "walk") {
        // a moving segment draws as movement even mid-transition
        pose = a.pose === "walk" && t < 0.5 ? "walk" : b.pose === "walk" ? "walk" : pose;
      }
    } else if (b.pose === "walk") {
      // past the newest sample of a MOVING cat: brief safe extrapolation along
      // its velocity, distance-capped so it can never run away from the server
      const prev = buf.length > 1 ? buf[buf.length - 2] : b;
      const dtS = Math.max(1, b.receivedAt - prev.receivedAt) / 1000;
      const overS = Math.min(Math.max(0, (targetMs - b.receivedAt) / 1000), REMOTE_EXTRAPOLATE_MS / 1000);
      nx = b.x + ((b.x - prev.x) / dtS) * overS;
      ny = b.y + ((b.y - prev.y) / dtS) * overS;
      const d = Math.hypot(nx - b.x, ny - b.y);
      if (d > REMOTE_MAX_EXTRAP) {
        nx = b.x + ((nx - b.x) / d) * REMOTE_MAX_EXTRAP;
        ny = b.y + ((ny - b.y) / d) * REMOTE_MAX_EXTRAP;
      }
    } else {
      // stationary states (idle/sit/...) hold the authoritative position —
      // a stopped cat never coasts through a packet stall
      nx = b.x;
      ny = b.y;
    }

    // --- convergence: smooth at normal drift, fast glide when genuinely out
    // of sync, hard snap only for real teleport-class corrections ---
    const drift = Math.hypot(nx - cur.x, ny - cur.y);
    if (drift > 0.01) {
      if (drift > REMOTE_HARD_SNAP_DIST) {
        // visibly wrong (lag spike, server correction): glide hard, no
        // rubber-band oscillation — cap by distance so big fixes land fast
        const step = Math.min(drift, Math.max(drift * 0.22, 220 * dt));
        cur.x += ((nx - cur.x) / drift) * step;
        cur.y += ((ny - cur.y) / drift) * step;
      } else {
        // normal follow: exponential ease (frame-rate independent, ~6.5/s)
        const k = 1 - Math.exp(-6.5 * Math.max(dt, 1 / 240));
        cur.x += (nx - cur.x) * k;
        cur.y += (ny - cur.y) * k;
      }
    }

    // --- direction: follow the timeline, but never flip-flop on jitter —
    // require the state to persist ~120ms before turning the sprite ---
    if (facing !== cur.facing) {
      if (cur.poseChangedAt === undefined || wallMs - cur.poseChangedAt > 120) {
        cur.facing = facing as 1 | -1;
        cur.poseChangedAt = wallMs;
      }
    }

    // --- pose: state-driven; movement always animates, idles need to persist
    // ~160ms (anti-blink) and respect the walk latch so blips never flash ---
    if (pose === "walk" || pose === "swim" || pose === "crouch") {
      if (cur.pose !== pose) {
        cur.pose = pose;
        cur.poseChangedAt = wallMs;
      }
      cur.walkLatchUntil = wallMs + REMOTE_POSE_LATCH_MS;
    } else if (cur.pose !== pose) {
      const latched = (cur.pose === "walk" || cur.pose === "swim") && wallMs < (cur.walkLatchUntil ?? 0);
      const young = cur.poseChangedAt !== undefined && wallMs - cur.poseChangedAt < 160;
      if (!latched && !young) {
        cur.pose = pose;
        cur.poseChangedAt = wallMs;
      }
    }

    // --- animation clock: LOCAL, continuous, speed-matched. Walk cadence is
    // ~4.5 Hz at 165 px/s and scales with measured speed; idle breathing is
    // slow. Packets never restart or pause the cycle. ---
    const speed = Math.hypot(nx - a.x, ny - a.y) / Math.max(0.001, (b.receivedAt - a.receivedAt) / 1000);
    cur.lastSpeedPxS = Number.isFinite(speed) && speed > 1 ? Math.min(speed, 400) : cur.lastSpeedPxS;
    // cadence multiplier relative to the local cat's cycle: 1.0 at walking
    // speed, faster at a run, slow breathing when idle — animation speed
    // always matches the movement being drawn (spec: movement == animation)
    const speedFactor =
      cur.pose === "walk" ? Math.min(1.55, Math.max(0.6, cur.lastSpeedPxS / 165))
        : cur.pose === "swim" ? 0.85
        : cur.pose === "crouch" ? 0.75
        : 0.5;
    cur.animMs += Math.max(0, Math.min(dt, 0.1)) * 1000 * speedFactor;
  }

}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);


}


// --- survival needs model (engine-local simulation; React persists it) ------
export type EngineSfxName = "mew" | "shake" | "splash" | "eat" | "herb" | "drink" | "hit";

class SurvivalNeeds {
  hunger = 80;
  energy = 90;
  health = 100;
  drain(dt: number, sneaking: boolean, running: boolean, swimming: boolean) {
    // rates per second — gentle by design: from a full bar, hunger/energy last
    // well over an in-game DAY (600s) of resting (roughly 4-8 days idle), so
    // they matter over a session without ever nagging. Running/swimming drain
    // faster but still leave plenty of room.
    this.hunger -= dt * (running ? 0.1 : swimming ? 0.08 : sneaking ? 0.02 : 0.028);
    this.energy -= dt * (running ? 0.22 : swimming ? 0.15 : sneaking ? 0.02 : 0.018);
    if (this.energy < 15) this.health -= dt * 0.05;
    this.hunger = Math.max(0, this.hunger);
    this.energy = Math.max(0, this.energy);
    this.health = Math.max(0, this.health);
  }
}
