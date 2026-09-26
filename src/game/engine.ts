// WarriorCatsRPG — canvas engine. Renders the ThunderClan forest world
// programmatically (no external assets) and simulates the player + NPCs.

import {
  allObjects,
  areaAt,
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
  playerDef,
  TILE,
  trees,
  WORLD_H,
  WORLD_W,
  type InteractableKind,
  type NPCDef,
} from "./world";

export interface NearbyTarget {
  kind: "object" | "npc";
  label: string;
  interact?: InteractableKind;
  npcId?: string;
}

export interface GameCallbacks {
  onAreaChange: (name: string) => void;
  onNearby: (target: NearbyTarget | null) => void;
  onInteract: (target: NearbyTarget) => void;
  onMove: (x: number, y: number) => void;
}

// ---------------------------------------------------------------------------
// Ground palette
// ---------------------------------------------------------------------------

const GROUND_COLORS: Record<number, [string, string]> = {
  0: ["#3f7d43", "#468749"], // grass
  1: ["#cbb27e", "#d4bc8a"], // sand
  2: ["#3d6f9e", "#467cab"], // water
  3: ["#8d8f93", "#97999e"], // stone
  4: ["#3a3d42", "#43464c"], // paved (Thunderpath)
  5: ["#35663c", "#3c7043"], // pine floor
  6: ["#96794f", "#a18457"], // dirt trail
};

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 0xffffffff;
}

// ---------------------------------------------------------------------------
// Cat sprite
// ---------------------------------------------------------------------------

interface CatSkin {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  skin: CatSkin,
  x: number,
  y: number,
  facing: 1 | -1,
  moving: boolean,
  time: number,
  phase: number,
  scale = 1,
) {
  const idleFor = moving ? 0 : 2.2;
  const sitting = !moving && Math.sin(time * 0.15 + phase) > 0.92 - idleFor * 0.2;
  const bob = moving ? Math.abs(Math.sin(time * 9 + phase)) * 1.6 : Math.sin(time * 1.4 + phase) * 0.5;

  ctx.save();
  ctx.translate(x, y);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 2, 15 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(facing * scale, scale);
  ctx.translate(0, -bob);

  // tail
  const tailSway = Math.sin(time * 2.2 + phase) * (moving ? 5 : 9);
  ctx.strokeStyle = skin.furDark;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (sitting) {
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-20, -2, -16, 6);
  } else {
    ctx.moveTo(-11, -8);
    ctx.quadraticCurveTo(-20, -14 + tailSway * 0.4, -24, -20 + tailSway);
  }
  ctx.stroke();

  // hind leg
  ctx.fillStyle = skin.furDark;
  ctx.fillRect(-9, -4 + (moving ? Math.sin(time * 9 + phase) * 2.5 : 0), 4, 7);

  // body
  ctx.fillStyle = skin.fur;
  ctx.beginPath();
  if (sitting) {
    ctx.ellipse(0, -7, 9, 11, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, -7, 11.5, 7, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // chest / belly
  if (skin.chest) {
    ctx.fillStyle = skin.chest;
    ctx.beginPath();
    ctx.ellipse(6, -4.5, 4.5, sitting ? 7 : 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // front leg
  ctx.fillStyle = skin.fur;
  ctx.fillRect(5, -4 + (moving ? Math.sin(time * 9 + phase + Math.PI) * 2.5 : 0), 4, 7);

  // head
  const headX = sitting ? 4 : 9;
  const headY = sitting ? -16 : -11;
  ctx.fillStyle = skin.fur;
  ctx.beginPath();
  ctx.arc(headX, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // ears
  ctx.beginPath();
  ctx.moveTo(headX - 5.5, headY - 3.5);
  ctx.lineTo(headX - 3, headY - 10);
  ctx.lineTo(headX - 0.5, headY - 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX + 1, headY - 5);
  ctx.lineTo(headX + 3.5, headY - 10.5);
  ctx.lineTo(headX + 6, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c98a8a";
  ctx.beginPath();
  ctx.moveTo(headX + 2.2, headY - 5.6);
  ctx.lineTo(headX + 3.5, headY - 8.8);
  ctx.lineTo(headX + 4.8, headY - 5.2);
  ctx.closePath();
  ctx.fill();

  // muzzle
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(headX + 4, headY + 2.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye (blink)
  const blink = Math.sin(time * 0.9 + phase * 3) > 0.985 ? 0.15 : 1;
  ctx.fillStyle = skin.eye;
  ctx.beginPath();
  ctx.ellipse(headX + 3.5, headY - 0.5, 1.7, 1.7 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(headX + 3.9, headY - 0.5, 0.8, 1.3 * blink, 0, 0, Math.PI * 2);
  ctx.fill();

  // whiskers
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(headX + 6, headY + 1.5);
  ctx.lineTo(headX + 11, headY + 0.5);
  ctx.moveTo(headX + 6, headY + 2.5);
  ctx.lineTo(headX + 11, headY + 3);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Prop drawing
// ---------------------------------------------------------------------------

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pine: boolean, tint: number) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 4, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5d4a33";
  ctx.fillRect(x - 3.5, y - r * 0.35, 7, r * 0.45);

  if (pine) {
    const layers = 3;
    for (let i = layers; i >= 1; i--) {
      const ly = y - (r * 0.25 * (i - 1)) - r * 0.15;
      const lw = r * (0.45 + i * 0.22);
      const shade = i % 2 === 0 ? "#2e5c38" : "#356840";
      ctx.fillStyle = shade;
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
}

function drawBramble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.62, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a4632";
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.55, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // tangled vines
  ctx.strokeStyle = "#6e573c";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x - w * 0.2 + i * w * 0.14, y - h * 0.08, w * 0.3, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
  }
  // dark entrance
  ctx.fillStyle = "#241c12";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.12, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
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

function drawLog(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
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

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
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

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#84868b";
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a3a5aa";
  ctx.beginPath();
  ctx.ellipse(x - w * 0.1, y - h * 0.14, w * 0.26, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // water glint (medicine stone pool)
  ctx.fillStyle = "#5f8fb8";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.08, y + h * 0.05, w * 0.16, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFreshKill(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const mice: [number, number, string][] = [
    [-6, 0, "#8f8f96"],
    [5, 3, "#a5764a"],
    [0, -5, "#7a7a80"],
  ];
  for (const [dx, dy, c] of mice) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + dx + 5, y + dy);
    ctx.quadraticCurveTo(x + dx + 9, y + dy - 2, x + dx + 11, y + dy);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, 5, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx - 5, y + dy - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStump(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
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

// ---------------------------------------------------------------------------
// NPC simulation
// ---------------------------------------------------------------------------

interface NPCState {
  def: NPCDef;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  moving: boolean;
  waitUntil: number;
  phase: number;
}

function makeNpcState(def: NPCDef, time: number): NPCState {
  return {
    def,
    x: def.home.x,
    y: def.home.y,
    tx: def.home.x,
    ty: def.home.y,
    facing: 1,
    moving: false,
    waitUntil: time,
    phase: Math.random() * Math.PI * 2,
  };
}

// ---------------------------------------------------------------------------
// The Game
// ---------------------------------------------------------------------------

const PLAYER_HALF_W = 11;
const PLAYER_HALF_H = 8;
const WALK_SPEED = 165;
const RUN_SPEED = 250;

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
  private pMoving = false;

  private camX = 0;
  private camY = 0;
  private scale = 1.15;

  private keys = new Set<string>();
  private paused = false;

  private npcStates: NPCState[] = [];
  private lastArea = "";
  private lastNearby: NearbyTarget | null = null;
  private lastMoveEmit = 0;
  private destroyed = false;

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
    this.npcStates = npcs.map((n) => makeNpcState(n, 0));

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

  teleport(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.camX = x;
    this.camY = y;
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
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "e"].includes(k)) {
      e.preventDefault();
    }
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
    this.scale = rect.width < 700 ? 0.85 : rect.width < 1100 ? 1.0 : 1.2;
  };

  private canMoveTo(x: number, y: number): boolean {
    return (
      !isSolidPoint(x - PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y - PLAYER_HALF_H) &&
      !isSolidPoint(x - PLAYER_HALF_W, y + PLAYER_HALF_H) &&
      !isSolidPoint(x + PLAYER_HALF_W, y + PLAYER_HALF_H)
    );
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    this.time += dt;

    this.update(dt);
    this.render();

    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // --- player movement ---
    let dx = 0;
    let dy = 0;
    if (!this.paused) {
      if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    }
    const running = this.keys.has("shift");
    const speed = running ? RUN_SPEED : WALK_SPEED;
    this.pMoving = dx !== 0 || dy !== 0;
    if (this.pMoving) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * speed * dt;
      dy = (dy / len) * speed * dt;
      if (dx !== 0) this.pxFacing = dx > 0 ? 1 : -1;

      if (this.canMoveTo(this.px + dx, this.py)) this.px += dx;
      if (this.canMoveTo(this.px, this.py + dy)) this.py += dy;
    }

    // camera — smooth follow, clamped to world
    const lerp = 1 - Math.pow(0.0001, dt);
    this.camX += (this.px - this.camX) * lerp;
    this.camY += (this.py - this.camY) * lerp;

    // --- NPCs ---
    for (const n of this.npcStates) {
      const dist = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (n.moving && dist < 6) {
        n.moving = false;
        n.waitUntil = this.time + 2 + Math.random() * 4;
      } else if (!n.moving && this.time > n.waitUntil && n.def.wander) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 40 + Math.random() * 90;
        const nx = n.def.home.x + Math.cos(ang) * rad;
        const ny = n.def.home.y + Math.sin(ang) * rad;
        if (!isSolidPoint(nx, ny)) {
          n.tx = nx;
          n.ty = ny;
          n.moving = true;
        } else {
          n.waitUntil = this.time + 1;
        }
      }
      if (n.moving) {
        const sp = 42 * dt;
        const ux = (n.tx - n.x) / (dist || 1);
        const uy = (n.ty - n.y) / (dist || 1);
        const stepX = ux * sp;
        if (!isSolidPoint(n.x + stepX + Math.sign(stepX) * 8, n.y)) n.x += stepX;
        const stepY = uy * sp;
        if (!isSolidPoint(n.x, n.y + stepY + Math.sign(stepY) * 8)) n.y += stepY;
        if (Math.abs(ux) > 0.2) n.facing = ux > 0 ? 1 : -1;
      }
    }

    // --- area + nearby detection ---
    const area = areaAt(this.px, this.py);
    const areaName = area?.name ?? "ThunderClan Territory";
    if (areaName !== this.lastArea) {
      this.lastArea = areaName;
      this.cb.onAreaChange(areaName);
    }

    let near: NearbyTarget | null = null;
    let bestD = 88;
    for (const o of allObjects) {
      const d = Math.hypot(o.x - this.px, o.y - this.py);
      if (d < bestD) {
        bestD = d;
        near = { kind: "object", label: o.label ?? o.id, interact: o.interact };
      }
    }
    for (const n of this.npcStates) {
      const d = Math.hypot(n.x - this.px, n.y - this.py);
      if (d < bestD) {
        bestD = d;
        near = { kind: "npc", label: n.def.name, npcId: n.def.id };
      }
    }
    const changed =
      (near === null) !== (this.lastNearby === null) ||
      (near && this.lastNearby && (near.label !== this.lastNearby.label || near.kind !== this.lastNearby.kind));
    if (changed) {
      this.lastNearby = near;
      this.cb.onNearby(near);
    } else if (near && this.lastNearby && near.npcId !== this.lastNearby.npcId) {
      this.lastNearby = near;
      this.cb.onNearby(near);
    }

    // throttle position emit for the minimap
    if (this.time - this.lastMoveEmit > 0.2) {
      this.lastMoveEmit = this.time;
      this.cb.onMove(this.px, this.py);
    }
  }

  // -------------------------------------------------------------------------

  private render() {
    const { ctx, canvas } = this;
    const cw = canvas.width / this.dpr;
    const ch = canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#2c4a30";
    ctx.fillRect(0, 0, cw, ch);

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

    this.drawGround(viewL, viewT, viewR, viewB, cw, ch);
    this.drawFlora(viewL, viewT, viewR, viewB);

    // depth-sorted entities
    type Entity = { y: number; draw: () => void };
    const ents: Entity[] = [];

    for (const tr of trees) {
      if (tr.x < viewL - 60 || tr.x > viewR + 60 || tr.y < viewT - 80 || tr.y > viewB + 60) continue;
      ents.push({ y: tr.y, draw: () => drawTree(ctx, tr.x, tr.y, tr.r, tr.pine, tr.tint) });
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
      if (o.x < viewL - 80 || o.x > viewR + 80 || o.y < viewT - 80 || o.y > viewB + 80) continue;
      const s = o.scale ?? 1;
      const w = o.w * s;
      const h = o.h * s;
      ents.push({
        y: o.y,
        draw: () => {
          switch (o.style) {
            case "tree": drawTree(ctx, o.x, o.y, 42, false, 0.7); break;
            case "bramble": drawBramble(ctx, o.x, o.y, w, h); break;
            case "bush": drawBush(ctx, o.x, o.y, w, h); break;
            case "log": drawLog(ctx, o.x, o.y, w, h); break;
            case "rock": drawRock(ctx, o.x, o.y, w, h); break;
            case "stone": drawStone(ctx, o.x, o.y, w, h); break;
            case "fresh-kill": drawFreshKill(ctx, o.x, o.y); break;
            case "stump": drawStump(ctx, o.x, o.y, w * 0.45); break;
          }
        },
      });
    }
    for (const n of this.npcStates) {
      if (n.x < viewL - 60 || n.x > viewR + 60 || n.y < viewT - 60 || n.y > viewB + 60) continue;
      ents.push({
        y: n.y,
        draw: () => {
          drawCat(ctx, n.def, n.x, n.y, n.facing, n.moving, this.time, n.phase);
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
    ents.push({
      y: this.py,
      draw: () => drawCat(ctx, playerDef, this.px, this.py, this.pxFacing, this.pMoving, this.time, 0, 1.05),
    });

    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    // drifting leaves for atmosphere
    this.drawLeaves();

    ctx.restore();

    // vignette
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(10,16,10,0.34)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }

  private drawGround(viewL: number, viewT: number, viewR: number, viewB: number, _cw: number, _ch: number) {
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
        const pair = GROUND_COLORS[kind];
        ctx.fillStyle = h > 0.5 ? pair[0] : pair[1];
        if (kind === 2) {
          // animated water shimmer
          const w = h + waterWave;
          ctx.fillStyle = w > 0.5 ? pair[0] : pair[1];
        }
        ctx.fillRect(c * GROUND_CELL, r * GROUND_CELL, GROUND_CELL + 0.5, GROUND_CELL + 0.5);
      }
    }

    // Thunderpath dashes
    if (viewT < TILE * 7 && viewB > 0) {
      ctx.fillStyle = "rgba(240,225,160,0.7)";
      const y = TILE * 4;
      for (let x = Math.floor(Math.max(0, viewL) / 80) * 80; x < Math.min(WORLD_W, viewR); x += 80) {
        ctx.fillRect(x, y - 2, 40, 4);
      }
    }

    // camp sand is slightly darker toward the wall edge — soft ring
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(CAMP_CENTER.x, CAMP_CENTER.y, CAMP_RADIUS - 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawFlora(viewL: number, viewT: number, viewR: number, viewB: number) {
    const { ctx } = this;
    for (const f of flora) {
      if (f.x < viewL || f.x > viewR || f.y < viewT || f.y > viewB) continue;
      const sway = Math.sin(this.time * 1.8 + f.x * 0.05) * 1.2;
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
    if (this.leaves.length < 14) {
      for (let i = this.leaves.length; i < 14; i++) {
        this.leaves.push({
          x: this.camX + (Math.random() - 0.5) * 1200,
          y: this.camY + (Math.random() - 0.5) * 800,
          vx: -14 - Math.random() * 18,
          vy: 8 + Math.random() * 10,
          r: Math.random() * Math.PI * 2,
        });
      }
    }
    ctx.fillStyle = "rgba(214, 178, 96, 0.55)";
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
}
