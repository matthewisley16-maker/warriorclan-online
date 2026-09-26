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
  WORLD_H,
  WORLD_W,
  type InteractableKind,
  type NPCDef,
  type PreyKind,
} from "./world";
import {
  drawBarn,
  drawCat,
  drawCave,
  drawFence,
  drawFlowerBed,
  drawFreshKillPile,
  drawHerbPatch,
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
}

export interface ChatBubble {
  name: string;
  text: string;
  until: number;
  x: number;
  y: number;
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
  onNpcIdle?: (npcName: string, line: string) => void;
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

interface InteriorDef {
  id: string;
  name: string;
  /** wall layout in a 24x18 room of 32px cells; 1 = wall */
  walls: string[];
  props: { id: string; x: number; y: number; label: string; style: "nest" | "herbs" | "stone" | "moss" | "plank" | "hay" | "bowl" }[];
  /** text shown when entering */
  desc: string;
  npcs?: string[]; // npc ids positioned here
}

const ROOM_W = 24;
const ROOM_H = 18;

function emptyRoom(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROOM_H; y++) {
    rows.push(y === 0 || y === ROOM_H - 1 ? "1".repeat(ROOM_W) : "1" + "0".repeat(ROOM_W - 2) + "1");
  }
  return rows;
}

function roomWithDoor(doorSide: "bottom", doorX: number): string[] {
  const rows = emptyRoom();
  const mid = doorX;
  const bottom = rows[ROOM_H - 1];
  rows[ROOM_H - 1] = bottom.slice(0, mid) + "00" + bottom.slice(mid + 2);
  return rows;
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
    ],
    desc: "A hidden den behind Tallrock, soft with moss and lichen. Starlight filters through a crack in the stone.",
    npcs: ["bluestar"],
  },
  "tc-medicine-den": {
    id: "tc-medicine-den",
    name: "The Medicine Cat's Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "herb1", x: 5, y: 6, label: "Marigold", style: "herbs" },
      { id: "herb2", x: 7, y: 5, label: "Catmint", style: "herbs" },
      { id: "herb3", x: 9, y: 6, label: "Poppy seeds", style: "herbs" },
      { id: "herb4", x: 5, y: 9, label: "Cobwebs", style: "herbs" },
      { id: "herb5", x: 7, y: 9, label: "Feverfew", style: "herbs" },
      { id: "pool", x: 17, y: 8, label: "Pool of rainwater", style: "stone" },
      { id: "nest", x: 13, y: 11, label: "Spottedleaf's nest", style: "nest" },
    ],
    desc: "A crevice in the rock, screened by a bramble. Cracks in the stone hold neat stores of herbs. A smooth pool reflects the sky.",
    npcs: ["spottedleaf"],
  },
  "tc-nursery": {
    id: "tc-nursery",
    name: "The Nursery",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 7, label: "Queen's nest", style: "nest" },
      { id: "nest2", x: 15, y: 7, label: "Queen's nest", style: "nest" },
      { id: "nest3", x: 11, y: 12, label: "Kit nest", style: "nest" },
      { id: "feathers", x: 18, y: 12, label: "Feathers and moss", style: "moss" },
    ],
    desc: "The deepest, best-guarded den in camp, lined with feathers and moss. Kits tumble over their sleeping mothers.",
    npcs: ["willowpelt"],
  },
  "tc-warriors-den": {
    id: "tc-warriors-den",
    name: "The Warriors' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 7, y: 6, label: "Moss nest", style: "nest" },
      { id: "nest2", x: 12, y: 6, label: "Moss nest", style: "nest" },
      { id: "nest3", x: 17, y: 6, label: "Moss nest", style: "nest" },
      { id: "nest4", x: 7, y: 11, label: "Moss nest", style: "nest" },
      { id: "nest5", x: 17, y: 11, label: "Moss nest", style: "nest" },
    ],
    desc: "A dark, tangled thornbush. Inside, moss-lined nests are packed tight — the first line of defense if the camp is attacked.",
    npcs: ["lionheart", "tigerclaw"],
  },
  "tc-apprentices-den": {
    id: "tc-apprentices-den",
    name: "The Apprentices' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 9, y: 7, label: "Moss nest", style: "nest" },
      { id: "nest2", x: 14, y: 7, label: "Moss nest", style: "nest" },
      { id: "nest3", x: 11, y: 12, label: "Moss nest", style: "nest" },
    ],
    desc: "A bramble thicket, warm with the smell of young cats. The apprentices' moss nests are never tidy.",
    npcs: ["graypaw", "sandpaw"],
  },
  "tc-elders-den": {
    id: "tc-elders-den",
    name: "The Elders' Den",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "nest1", x: 8, y: 8, label: "Elder's nest", style: "nest" },
      { id: "nest2", x: 16, y: 8, label: "Elder's nest", style: "nest" },
      { id: "ivy", x: 12, y: 5, label: "Ivy-draped walls", style: "moss" },
    ],
    desc: "A fallen log draped in ivy. The elders swap stories of battles and prophecies, and complain about the damp.",
    npcs: ["halftail"],
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
      { id: "bowl", x: 6, y: 8, label: "Food bowl", style: "bowl" },
      { id: "bowl2", x: 8, y: 8, label: "Water bowl", style: "bowl" },
      { id: "plank", x: 14, y: 7, label: "Soft cushion", style: "plank" },
      { id: "plank2", x: 18, y: 10, label: "Twoleg chair", style: "plank" },
    ],
    desc: "Warm, soft, and safe — and unbearably small. The Twolegs are out; the garden door is open.",
    npcs: [],
  },
  barn: {
    id: "barn",
    name: "The Farm Barn",
    walls: roomWithDoor("bottom", 12),
    props: [
      { id: "hay1", x: 6, y: 6, label: "Hay bales", style: "hay" },
      { id: "hay2", x: 18, y: 6, label: "Hay bales", style: "hay" },
      { id: "hay3", x: 12, y: 12, label: "Warm hay pile", style: "hay" },
      { id: "plank", x: 16, y: 11, label: "Twoleg workbench", style: "plank" },
    ],
    desc: "The barn breathes warm hay and cow. Mice rustle between the bales. A safe place for any cat willing to share.",
    npcs: [],
  },
};

// ---------------------------------------------------------------------------
// Prey
// ---------------------------------------------------------------------------

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
  alive: boolean;
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
const WALK_SPEED = 165;
const RUN_SPEED = 250;
const SNEAK_SPEED = 80;
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
  private pxFacing: 1 | -1 = 1;
  private pPose: CatPose = "walk";
  private poseUntil = 0;
  private pEmote: string | null = null;
  private emoteUntil = 0;

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

  // multiplayer remotes (set by React)
  public remotes = new Map<string, RemotePlayer>();
  public bubbles: ChatBubble[] = [];

  // interiors
  private interiorId: string | null = null;
  private lastInterior: string | null = null;
  /** saved position to return to when leaving an interior */
  private exitPos: { x: number; y: number } | null = null;
  private huntedCount = 0;
  private sneaking = false;

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
    if (p) this.keys.clear();
  }

  /** Camera zoom, exposed so Settings can change view distance. */
  setCameraScale(s: number) {
    this.userScale = Math.min(1.6, Math.max(0.7, s));
    this.resize();
  }

  teleport(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.camX = x;
    this.camY = y;
    this.interiorId = null;
    this.cb.onInteriorChange(null);
  }

  enterInterior(id: string) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    this.interiorId = id;
    this.px = (ROOM_W / 2) * 32;
    this.py = (ROOM_H - 3) * 32;
    this.camX = this.px;
    this.camY = this.py;
    this.cb.onInteriorChange(id);
  }

  exitInterior() {
    if (!this.interiorId) return;
    this.interiorId = null;
    if (this.exitPos) {
      this.px = this.exitPos.x;
      this.py = this.exitPos.y + 40;
      this.camX = this.px;
      this.camY = this.py;
    }
    this.cb.onInteriorChange(null);
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
        alive: true,
      });
      created++;
    }
  }

  private respawnPreyTick() {
    const alive = this.prey.filter((p) => p.alive).length;
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

    // --- player movement ---
    let dx = 0;
    let dy = 0;
    if (!this.paused) {
      if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    }
    this.sneaking = this.keys.has("control") || this.keys.has("c");
    const running = this.keys.has("shift");
    const speed = this.sneaking ? SNEAK_SPEED : running ? RUN_SPEED : WALK_SPEED;

    if (this.time > this.poseUntil && this.pPose !== "walk") this.pPose = "walk";

    const movingNow = dx !== 0 || dy !== 0;
    // Any movement input immediately breaks out of an emote pose so the
    // player can never get stuck sitting/sleeping/grooming.
    if (movingNow && this.pPose !== "walk") {
      this.pPose = "walk";
      this.poseUntil = 0;
    }
    this.pPose = movingNow && this.pPose === "walk" ? "walk" : this.pPose;
    if (movingNow && this.pPose === "walk") {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * speed * dt;
      dy = (dy / len) * speed * dt;
      if (dx !== 0) this.pxFacing = dx > 0 ? 1 : -1;

      if (this.interiorId) {
        const nx = Math.max(40, Math.min(ROOM_W * 32 - 40, this.px + dx));
        const ny = Math.max(40, Math.min(ROOM_H * 32 - 30, this.py + dy));
        // interior walls: crude grid check
        const room = interiors[this.interiorId];
        const cx = Math.floor(nx / 32);
        const cy = Math.floor(ny / 32);
        const wall = room.walls[Math.min(room.walls.length - 1, cy)]?.[cx] === "1";
        if (!wall) {
          this.px = nx;
          this.py = ny;
        }
      } else {
        if (this.canMoveTo(this.px + dx, this.py)) this.px += dx;
        if (this.canMoveTo(this.px, this.py + dy)) this.py += dy;
      }
    } else if (!movingNow && this.time > this.poseUntil) {
      // idle behaviors
      if (Math.random() < 0.001) this.pPose = "sit";
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

    // --- prey AI ---
    if (!this.paused && this.prey.length < PREY_MAX && Math.random() < 0.02) this.respawnPreyTick();
    if (!this.interiorId) {
      for (const p of this.prey) {
        if (!p.alive) continue;
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
        // catch!
        if (dToPlayer < PREY_CATCH_DIST && !this.paused) {
          p.alive = false;
          this.huntedCount++;
          this.cb.onPreyCaught(p.kind);
        }
      }
      this.prey = this.prey.filter((p) => p.alive || Math.random() > 0.98);
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
      for (const o of allObjects) {
        const d = Math.hypot(o.x - this.px, o.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: o.label ?? o.id, interact: o.interact, interior: o.interior };
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
        if (!p.alive) continue;
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
        const px2 = prop.x * 32 + 16;
        const py2 = prop.y * 32 + 16;
        const d = Math.hypot(px2 - this.px, py2 - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: prop.label };
        }
      }
      // NPCs inside
      for (const npcId of room.npcs ?? []) {
        const n = this.npcStates.find((s) => s.def.id === npcId);
        if (!n) continue;
        const d = Math.hypot(n.x - this.px, n.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "npc", label: n.def.name, npcId: n.def.id };
        }
      }
      // exit door
      const doorD = Math.hypot((ROOM_W / 2) * 32 - this.px, (ROOM_H - 1) * 32 - this.py);
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

    // --- cinematic lighting stack ---
    const na = this.nightAlpha();
    const gold = this.goldenHour();
    const dark = this.env.dark;
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
    // weather overlays (rain, fog, cloud cover) + ambient particles
    this.renderWeather(cw, ch);
    this.drawMotes(cw, ch);

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

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX, -this.camY);

    // floor
    ctx.fillStyle = "#5a4632";
    ctx.fillRect(0, 0, ROOM_W * 32, ROOM_H * 32);
    // floor texture
    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) {
        const h = hash2(x, y);
        if (h > 0.6) {
          ctx.fillStyle = "rgba(0,0,0,0.06)";
          ctx.fillRect(x * 32, y * 32, 32, 32);
        }
      }
    }
    // walls
    for (let y = 0; y < room.walls.length; y++) {
      for (let x = 0; x < room.walls[y].length; x++) {
        if (room.walls[y][x] === "1") {
          ctx.fillStyle = "#4a3826";
          ctx.fillRect(x * 32, y * 32, 32, 32);
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(x * 32, y * 32, 32, 4);
        }
      }
    }
    // props
    for (const prop of room.props) {
      const x = prop.x * 32 + 16;
      const y = prop.y * 32 + 16;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      switch (prop.style) {
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
      }
    }
    // NPCs assigned to this room (drawn near their home positions)
    for (const npcId of room.npcs ?? []) {
      const n = this.npcStates.find((s) => s.def.id === npcId);
      if (!n) continue;
      drawCat(ctx, n.def, n.x, n.y, n.facing, n.pose === "walk" && Math.hypot(n.tx - n.x, n.ty - n.y) > 8 ? "walk" : "sit", this.time, n.phase);
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
    // player
    drawCat(ctx, this.playerSkin(), this.px, this.py, this.pxFacing, this.pPose, this.time, 0);
    // exit door hint
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("↓ leave through the gap", (ROOM_W / 2) * 32, (ROOM_H - 0.4) * 32);

    ctx.restore();
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
    this.drawFlora(viewL, viewT, viewR, viewB);
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
            case "tree": this.drawTree(o.x, o.y, 42, false, 0.7); break;
            case "bramble": this.drawBramble(o.x, o.y, w, h); break;
            case "bush": this.drawBush(o.x, o.y, w, h); break;
            case "log": this.drawLog(o.x, o.y, w, h); break;
            case "rock": this.drawRock(o.x, o.y, w, h); break;
            case "stone": this.drawStone(o.x, o.y, w, h); break;
            case "fresh-kill": drawFreshKillPile(ctx, o.x, o.y); break;
            case "stump": this.drawStump(o.x, o.y, w * 0.45); break;
            case "tallrock-big": drawTallRock(ctx, o.x, o.y, w, h); break;
            case "house": drawHouse(ctx, o.x, o.y, w, h); break;
            case "barn": drawBarn(ctx, o.x, o.y, w, h); break;
            case "fence": drawFence(ctx, o.x, o.y, w, h); break;
            case "cave": drawCave(ctx, o.x, o.y, w, h); break;
            case "reeds": drawReeds(ctx, o.x, o.y, w, h, this.time); break;
            case "flowerbed": drawFlowerBed(ctx, o.x, o.y, w, h); break;
            case "herbs": drawHerbPatch(ctx, o.x, o.y, this.time); break;
            case "nest": this.drawBush(o.x, o.y, w, h); break;
            case "prey-pile": drawFreshKillPile(ctx, o.x, o.y); break;
          }
          // den entrance marker for enterable dens
          if (o.interior) {
            ctx.fillStyle = "rgba(255,235,180,0.9)";
            ctx.beginPath();
            ctx.arc(o.x, o.y - h * 0.75 - 8, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      });
    }
    // prey
    for (const p of this.prey) {
      if (!p.alive) continue;
      if (p.x < viewL || p.x > viewR || p.y < viewT || p.y > viewB) continue;
      ents.push({
        y: p.y,
        draw: () => drawPrey(ctx, p.kind as PreySprite, p.x, p.y, p.facing, p.fleeing, this.time, p.seed),
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
    // remote players
    for (const [, r] of this.remotes) {
      if (r.x < viewL - 60 || r.x > viewR + 60 || r.y < viewT - 60 || r.y > viewB + 60) continue;
      ents.push({
        y: r.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            r.x,
            r.y,
            (r.facing >= 0 ? 1 : -1) as 1 | -1,
            r.moving ? "walk" : "sit",
            this.time,
            (r.userId.charCodeAt(0) % 10),
          );
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          const label = r.catName;
          const sub = [r.clan, r.rank].filter(Boolean).map((s) => s!.charAt(0).toUpperCase() + s!.slice(1)).join(" · ");
          const tw = Math.max(ctx.measureText(label).width, sub ? ctx.measureText(sub).width * 1 : 0);
          ctx.fillStyle = "rgba(24,34,52,0.62)";
          ctx.beginPath();
          ctx.roundRect(r.x - tw / 2 - 7, r.y - 47, tw + 14, sub ? 29 : 17, 8);
          ctx.fill();
          ctx.fillStyle = "#dbe8ff";
          ctx.fillText(label, r.x, r.y - 35);
          if (sub) {
            ctx.font = "500 9px system-ui, sans-serif";
            ctx.fillStyle = "rgba(186, 208, 240, 0.95)";
            ctx.fillText(sub, r.x, r.y - 24);
          }
        },
      });
    }
    // player
    ents.push({
      y: this.py,
      draw: () => {
        drawCat(ctx, { ...this.playerSkin(), size: (this.playerSkin().size ?? 1) * 1.05 }, this.px, this.py, this.pxFacing, this.pPose, this.time, 0);
        if (this.pEmote) {
          ctx.font = "18px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(this.pEmote, this.px, this.py - 46);
        }
      },
    });

    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // chat bubbles (world space)
    for (const b of this.bubbles) {
      if (this.time * 1000 > b.until) continue;
      ctx.font = "500 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      const tw = Math.min(220, ctx.measureText(b.text).width + 14);
      const lines = wrapText(ctx, b.text, 200);
      const bh = 16 + lines.length * 13;
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.beginPath();
      ctx.roundRect(b.x - tw / 2, b.y - 52 - bh, tw, bh, 9);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      lines.forEach((ln, i) => ctx.fillText(ln, b.x, b.y - 52 - bh + 16 + i * 13));
      ctx.fillStyle = "rgba(90,90,110,0.9)";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText(b.name, b.x, b.y - 50);
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

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const kind = groundMap[r * GROUND_COLS + c];
        const h = hash2(c, r);
        const pair = GROUND_COLORS[kind] ?? GROUND_COLORS[0];
        ctx.fillStyle = h > (kind === 2 ? 0.5 - waterWave : 0.5) ? pair[0] : pair[1];
        ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL, GROUND_CELL + 0.5, GROUND_CELL + 0.5);
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
  private drawCloudShadows() {
    if (this.env.dark < 0.06) return;
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
      if (f.kind === "tuft") {
        ctx.strokeStyle = f.tint > 0.5 ? "#57964f" : "#4c8a47";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(f.x - 3, f.y);
        ctx.quadraticCurveTo(f.x - 4 + sway, f.y - 6, f.x - 5 + sway, f.y - 9);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + sway * 0.5, f.y - 10);
        ctx.moveTo(f.x + 3, f.y);
        ctx.quadraticCurveTo(f.x + 4 + sway, f.y - 6, f.x + 5 + sway, f.y - 8);
        ctx.stroke();
      } else if (f.kind === "fern") {
        ctx.strokeStyle = "#3e7a41";
        ctx.lineWidth = 1.2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.quadraticCurveTo(f.x + i * 4 + sway, f.y - 8, f.x + i * 7 + sway, f.y - 13);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = "#4c8a47";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + sway, f.y - 8);
        ctx.stroke();
        ctx.fillStyle = f.tint > 0.5 ? "#e5c95c" : "#d977a0";
        ctx.beginPath();
        ctx.arc(f.x + sway, f.y - 10, 2.4, 0, Math.PI * 2);
        ctx.fill();
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

    // ---- fog: soft wash + drifting banks ----
    if (this.env.fog > 0.03) {
      const f = this.env.fog;
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, `rgba(206, 214, 220, ${0.34 * f})`);
      g.addColorStop(1, `rgba(206, 214, 220, ${0.12 * f})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = `rgba(208, 216, 222, ${0.1 * f})`;
      for (let i = 0; i < 3; i++) {
        const bx = ((t * (8 + i * 5)) % (cw + 700)) - 350 + i * 260;
        const by = ch * (0.25 + i * 0.22) + Math.sin(t * 0.3 + i * 2) * 20;
        ctx.beginPath();
        ctx.ellipse(bx, by, 330, 90, 0, 0, Math.PI * 2);
        ctx.fill();
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
  private drawTree(x: number, y: number, r: number, pine: boolean, tint: number) {
    const ctx = this.ctx;
    const sway = Math.sin(this.time * 1.1 + x * 0.03) * (1 + this.env.wind * this.windGust() * 6);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 4, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5d4a33";
    ctx.fillRect(x - 3.5, y - r * 0.35, 7, r * 0.45);
    ctx.save();
    ctx.translate(sway, 0);
    if (pine) {
      for (let i = 3; i >= 1; i--) {
        const ly = y - r * 0.25 * (i - 1) - r * 0.15;
        const lw = r * (0.45 + i * 0.22);
        ctx.fillStyle = i % 2 === 0 ? "#2e5c38" : "#356840";
        ctx.beginPath();
        ctx.moveTo(x - lw, ly);
        ctx.lineTo(x, ly - r * 0.75);
        ctx.lineTo(x + lw, ly);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const base = tint > 0.5 ? "#4a8a4c" : "#417f45";
      const light = tint > 0.5 ? "#5d9f58" : "#549251";
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.6, 0, Math.PI * 2);
      ctx.arc(x + r * 0.35, y - r * 0.4, r * 0.62, 0, Math.PI * 2);
      ctx.arc(x, y - r * 0.75, r * 0.68, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(x - r * 0.15, y - r * 0.95, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
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
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.42, w * 0.6, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#356340";
    ctx.beginPath();
    ctx.arc(x - w * 0.22, y - h * 0.05, w * 0.34, 0, Math.PI * 2);
    ctx.arc(x + w * 0.22, y - h * 0.05, w * 0.34, 0, Math.PI * 2);
    ctx.arc(x, y - h * 0.28, w * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#41764a";
    ctx.beginPath();
    ctx.arc(x - w * 0.08, y - h * 0.34, w * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e2b1c";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.16, y + h * 0.1, w * 0.14, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.55, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8b8d92";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y + h * 0.35);
    ctx.lineTo(x - w * 0.32, y - h * 0.35);
    ctx.lineTo(x + w * 0.08, y - h * 0.5);
    ctx.lineTo(x + w * 0.45, y - h * 0.1);
    ctx.lineTo(x + w * 0.5, y + h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9fa1a6";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.32, y - h * 0.35);
    ctx.lineTo(x + w * 0.08, y - h * 0.5);
    ctx.lineTo(x + w * 0.12, y - h * 0.05);
    ctx.lineTo(x - w * 0.2, y + h * 0.02);
    ctx.closePath();
    ctx.fill();
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
