// WarriorCatsRPG — Thunderpath traffic. Cars, box trucks, and semi trucks
// drive the two-lane Thunderpath between the tunnel portals at the map's
// edges. Vehicles exist ONLY on the Thunderpath lanes — they spawn inside a
// tunnel, cross the map, and vanish into the tunnel on the other side.

import { WORLD_W } from "./world";

export type VehicleKind = "car" | "truck" | "semi";

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  x: number; // world px (center of the vehicle)
  dir: 1 | -1; // 1 = west→east, -1 = east→west
  speed: number; // px/s
  hue: number; // 0..1 palette seed
}

/** Thunderpath center line y — must match the dashes drawn in engine.drawGround. */
export const TP_Y = 44 * 32;

/** Lane offsets from the center line (right-hand traffic). */
const LANE_EASTBOUND = 20; // dir 1 (south lane)
const LANE_WESTBOUND = -20; // dir -1 (north lane)

/** Despawn/spawn points just inside the tunnel mouths at the map edges. */
const EDGE_WEST = 40;
const EDGE_EAST = WORLD_W - 40;
const SPAWN_OFF = 130; // spawn this far inside the tunnel (hidden by the portal)

const KINDS: { kind: VehicleKind; speed: [number, number]; weight: number }[] = [
  { kind: "car", speed: [250, 320], weight: 6 },
  { kind: "truck", speed: [200, 245], weight: 2.5 },
  { kind: "semi", speed: [165, 205], weight: 2 },
];
const KIND_TOTAL = KINDS.reduce((a, k) => a + k.weight, 0);

const BODY_COLORS = [
  "#c94f43", "#4a6fa5", "#3f8f7a", "#d9a13b",
  "#e8e6df", "#9aa0a6", "#5a8a4a", "#b0603a",
];

const MAX_PER_DIR = 5;

// module-level fleet (survives re-joins; tiny state, engine time drives it)
const vehicles: Vehicle[] = [];
let nextId = 1;
let respawnAtEast = 0; // engine time when the next west→east truck may spawn
let respawnAtWest = 0;

/** Queue fresh spawns on both sides (used after a road respawn). */
export function respawnBothDirections(time: number) {
  respawnAtEast = time + 0.6;
  respawnAtWest = time + 1.4;
}

/** Keep the fleet alive: updateTraffic schedules respawns; this is the
 *  engine-side tick called from update() so schedules also advance when the
 *  render path is the only caller. */
export function tickTrafficRespawns(_time: number) {
  // currently a hook point — respawn scheduling lives inside updateTraffic;
  // keeping the call site explicit makes future fleet logic simpler
}

function pickKind(): (typeof KINDS)[number] {
  let r = Math.random() * KIND_TOTAL;
  for (const k of KINDS) {
    r -= k.weight;
    if (r <= 0) return k;
  }
  return KINDS[0];
}

function spawn(dir: 1 | -1) {
  const k = pickKind();
  vehicles.push({
    id: nextId++,
    kind: k.kind,
    x: dir === 1 ? EDGE_WEST - SPAWN_OFF : EDGE_EAST + SPAWN_OFF,
    dir,
    speed: k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]),
    hue: Math.random(),
  });
}

/**
 * Advance the fleet. Call every frame while outdoors near the Thunderpath.
 * Movement uses REAL elapsed time measured internally (frame-rate independent
 * even when the caller passes a fallback timestep); spawn gating uses the
 * engine's game clock so traffic freezes while the game is paused.
 */
let lastUpdateMs = 0;
let lastGameTime = -1;
export function updateTraffic(_dt: number, time: number) {
  const nowMs = performance.now();
  if (time === lastGameTime) {
    // game clock frozen (paused / interior): hold the fleet exactly still
    lastUpdateMs = nowMs;
    return;
  }
  lastGameTime = time;
  const dt = lastUpdateMs === 0 ? 0.016 : Math.min(0.05, (nowMs - lastUpdateMs) / 1000);
  lastUpdateMs = nowMs;
  // move + despawn into the far tunnel
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    v.x += v.dir * v.speed * dt;
    if ((v.dir === 1 && v.x > EDGE_EAST + 20) || (v.dir === -1 && v.x < EDGE_WEST - 20)) {
      vehicles.splice(i, 1);
      if (v.dir === 1) respawnAtEast = time + 0.5 + Math.random() * 2.4;
      else respawnAtWest = time + 0.5 + Math.random() * 2.4;
    }
  }
  // keep both directions populated (staggered, with gap spacing)
  const countEast = vehicles.filter((v) => v.dir === 1).length;
  const countWest = vehicles.filter((v) => v.dir === -1).length;
  if (countEast < MAX_PER_DIR && time >= respawnAtEast) {
    const nearSpawn = vehicles.some((v) => v.dir === 1 && v.x < EDGE_WEST + 190);
    if (!nearSpawn) spawn(1);
    respawnAtEast = time + (nearSpawn ? 0.6 : 1.2 + Math.random() * 3);
  }
  if (countWest < MAX_PER_DIR && time >= respawnAtWest) {
    const nearSpawn = vehicles.some((v) => v.dir === -1 && v.x > EDGE_EAST - 190);
    if (!nearSpawn) spawn(-1);
    respawnAtWest = time + (nearSpawn ? 0.6 : 1.2 + Math.random() * 3);
  }
  if (vehicles.length === 0 && time >= Math.min(respawnAtEast, respawnAtWest)) {
    respawnAtEast = respawnAtWest = 0; // bootstrap after idleness
    spawn(1);
    spawn(-1);
  }
}

/** Current fleet snapshot (for rendering). */
export function trafficList(): Vehicle[] {
  return vehicles;
}

/** Empty the fleet (spawn/teleport/interior transitions). */
export function clearTraffic() {
  vehicles.length = 0;
  respawnAtEast = 0;
  respawnAtWest = 0;
}

/** Lane y for a vehicle (right-hand traffic). */
export function vehicleLaneY(dir: 1 | -1): number {
  return TP_Y + (dir === 1 ? LANE_EASTBOUND : LANE_WESTBOUND);
}

// ---------------------------------------------------------------------------
// Rendering (stylized to match the game's handcrafted look)
// ---------------------------------------------------------------------------

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** One vehicle: shadow, wheels, body, glass, lights. Faces its travel dir. */
export function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle) {
  const y = vehicleLaneY(v.dir);
  const L = v.kind === "car" ? 62 : v.kind === "truck" ? 96 : 150;
  const W = v.kind === "car" ? 24 : 28;
  const color = BODY_COLORS[Math.floor(v.hue * BODY_COLORS.length) % BODY_COLORS.length];

  ctx.save();
  ctx.translate(v.x, y);
  if (v.dir === -1) ctx.scale(-1, 1); // draw facing right, mirror for westbound

  // road shadow
  ctx.fillStyle = "rgba(10, 14, 18, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, W * 0.42, L * 0.52, W * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // wheels (dark, tucked under the body sides)
  ctx.fillStyle = "#22242a";
  const axle = (ax: number) => {
    ctx.fillRect(ax - 5, -W * 0.52, 10, 7);
    ctx.fillRect(ax - 5, W * 0.52 - 7, 10, 7);
  };
  if (v.kind === "car") {
    axle(-L * 0.3);
    axle(L * 0.28);
  } else if (v.kind === "truck") {
    axle(L * 0.3);
    axle(-L * 0.24);
    axle(-L * 0.4);
  } else {
    axle(L * 0.42); // tractor front
    axle(L * 0.12); // tractor rear
    axle(-L * 0.32);
    axle(-L * 0.44);
  }

  if (v.kind === "car") {
    // body
    ctx.fillStyle = color;
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 8);
    ctx.fill();
    // cabin + windshield (front = +x)
    ctx.fillStyle = "rgba(30, 38, 48, 0.85)";
    roundRectPath(ctx, -L * 0.18, -W * 0.38, L * 0.42, W * 0.76, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(160, 200, 230, 0.8)";
    ctx.beginPath();
    ctx.moveTo(L * 0.24, -W * 0.34);
    ctx.lineTo(L * 0.36, -W * 0.26);
    ctx.lineTo(L * 0.36, W * 0.26);
    ctx.lineTo(L * 0.24, W * 0.34);
    ctx.closePath();
    ctx.fill();
    // roof highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    roundRectPath(ctx, -L * 0.3, -W * 0.42, L * 0.4, 4, 2);
    ctx.fill();
  } else if (v.kind === "truck") {
    // cargo box
    ctx.fillStyle = "#d8d5cc";
    roundRectPath(ctx, -L * 0.5, -W * 0.46, L * 0.66, W * 0.92, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 92, 100, 0.5)";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-L * 0.5 + 4, -W * 0.46 + 4, L * 0.66 - 8, W * 0.92 - 8);
    // cab (front)
    ctx.fillStyle = color;
    roundRectPath(ctx, L * 0.18, -W * 0.48, L * 0.32, W * 0.96, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(160, 200, 230, 0.85)";
    roundRectPath(ctx, L * 0.36, -W * 0.36, L * 0.1, W * 0.72, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRectPath(ctx, L * 0.2, -W * 0.44, L * 0.28, 4, 2);
    ctx.fill();
  } else {
    // semi: long trailer + cab with a gap
    ctx.fillStyle = "#dcd9d0";
    roundRectPath(ctx, -L * 0.5, -W * 0.46, L * 0.74, W * 0.92, 3);
    ctx.fill();
    // company stripe on the trailer
    ctx.fillStyle = color;
    ctx.fillRect(-L * 0.5 + 6, -4, L * 0.74 - 12, 8);
    ctx.strokeStyle = "rgba(90, 92, 100, 0.45)";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-L * 0.5 + 3, -W * 0.46 + 3, L * 0.74 - 6, W * 0.92 - 6);
    // tractor unit
    ctx.fillStyle = color;
    roundRectPath(ctx, L * 0.3, -W * 0.5, L * 0.2, W, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(160, 200, 230, 0.85)";
    roundRectPath(ctx, L * 0.4, -W * 0.38, L * 0.07, W * 0.76, 3);
    ctx.fill();
    // exhaust stacks
    ctx.fillStyle = "#3a3c42";
    ctx.fillRect(L * 0.28, -W * 0.5 - 3, 3, 5);
    ctx.fillRect(L * 0.28, W * 0.45, 3, 5);
  }

  // headlights (front) + taillights (rear)
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(L * 0.47, -W * 0.36, 4, 5);
  ctx.fillRect(L * 0.47, W * 0.36 - 5, 4, 5);
  ctx.fillStyle = "#d94f43";
  ctx.fillRect(-L * 0.5 - 2, -W * 0.36, 3, 5);
  ctx.fillRect(-L * 0.5 - 2, W * 0.36 - 5, 3, 5);

  ctx.restore();
}

/**
 * Tunnel portal where the Thunderpath enters the hills at the map edge.
 * `side`: -1 = west portal, 1 = east portal. Drawn as background scenery so
 * vehicles visually drive into the dark arch and vanish.
 */
export function drawTunnelPortal(ctx: CanvasRenderingContext2D, x: number, side: -1 | 1) {
  const halfH = 92;
  const top = TP_Y - halfH;
  const w = 88;
  ctx.save();
  ctx.translate(x, 0);

  // rocky hill the tunnel cuts through
  ctx.fillStyle = "#6d6a60";
  ctx.beginPath();
  ctx.moveTo(-w, TP_Y + halfH);
  ctx.quadraticCurveTo(-w * 0.9, top + 26, 0, top);
  ctx.quadraticCurveTo(w * 0.9, top + 26, w, TP_Y + halfH);
  ctx.closePath();
  ctx.fill();
  // grass cap + boulder texture
  ctx.fillStyle = "#4c7a44";
  ctx.beginPath();
  ctx.ellipse(side === -1 ? -w * 0.55 : w * 0.55, top + 30, w * 0.42, 16, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(60, 58, 52, 0.5)";
  for (let i = 0; i < 5; i++) {
    const bx = (i - 2) * 22 + (side === -1 ? -6 : 6);
    ctx.beginPath();
    ctx.ellipse(bx, top + 52 + (i % 2) * 22, 10, 6, i, 0, Math.PI * 2);
    ctx.fill();
  }

  // dark arch opening (facing the road)
  ctx.fillStyle = "#191b20";
  ctx.beginPath();
  ctx.moveTo(-30, TP_Y + halfH - 6);
  ctx.lineTo(-30, TP_Y - 34);
  ctx.quadraticCurveTo(0, TP_Y - 62, 30, TP_Y - 34);
  ctx.lineTo(30, TP_Y + halfH - 6);
  ctx.closePath();
  ctx.fill();
  // depth glow inside the arch
  const g = ctx.createLinearGradient(0, TP_Y - 40, 0, TP_Y + 40);
  g.addColorStop(0, "rgba(220, 210, 170, 0.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-24, TP_Y + halfH - 6);
  ctx.lineTo(-24, TP_Y - 32);
  ctx.quadraticCurveTo(0, TP_Y - 56, 24, TP_Y - 32);
  ctx.lineTo(24, TP_Y + halfH - 6);
  ctx.closePath();
  ctx.fill();

  // stone rim + hazard stripes
  ctx.strokeStyle = "#8a857a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-32, TP_Y + halfH - 6);
  ctx.lineTo(-32, TP_Y - 36);
  ctx.quadraticCurveTo(0, TP_Y - 66, 32, TP_Y - 36);
  ctx.lineTo(32, TP_Y + halfH - 6);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#d9a13b" : "#2c2c30";
    const yy = TP_Y - 58 + i * 9;
    if (yy > TP_Y - 36) break;
    ctx.fillRect(-30 + i * 2.4, yy, 9, 6);
    ctx.fillRect(30 - 9 - i * 2.4, yy, 9, 6);
  }

  ctx.restore();
}
