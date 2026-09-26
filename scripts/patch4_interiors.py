#!/usr/bin/env python3
"""Patch 4: interior sizes/shapes/floors — book-accurate, varied, not one square."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# ---- 1) room geometry helpers: per-room size + rounded cave outlines ----
old = """const ROOM_W = 24;
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
}"""
assert src.count(old) == 1, "room helpers"
src = src.replace(old, """const ROOM_W = 24;
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
  "barn":             { w: 24, h: 18, cave: false, floor: ["#96703f", "#8a6639", "#a27a46"], wall: ["#8a5a3a", "#9c6a46"] },
  "moonstone-cave":   { w: 15, h: 12, cave: true,  floor: ["#5c5e66", "#50525a", "#686a72"], wall: ["#33343c", "#43454f"] },
};""")

io.open(p, 'w', encoding='utf-8').write(src)
print("room geometry table added")

# ---- 2) renderInterior: use per-room geo (size, shape, floor, walls) ----
old2 = """    ctx.save();
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
    }"""
assert src.count(old2) == 1, "renderInterior floor/walls"
src = src.replace(old2, """    const geo = ROOM_GEO[room.id] ?? { w: ROOM_W, h: ROOM_H, cave: false, floor: ["#5a4632", "#50402c", "#66543a"], wall: ["#4a3826", "#5a4736"] };
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
    }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("renderInterior uses per-room geo")

# ---- 3) walk-out + exit detection respect the room's real size ----
old3 = """        // walk-out: step into the doorway gap at the bottom wall to leave —
        // no key press needed (mirrors the walk-in entrances outside)
        if (
          this.py > (ROOM_H - 2.1) * 32 &&
          Math.abs(this.px - (ROOM_W / 2) * 32) < 40
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }"""
assert src.count(old3) == 1, "walk-out"
src = src.replace(old3, """        // walk-out: step into the doorway gap at the bottom wall to leave —
        // no key press needed (mirrors the walk-in entrances outside)
        const gw = geo.w;
        const gh = geo.h;
        if (
          this.py > (gh - 2.1) * 32 &&
          Math.abs(this.px - (gw / 2) * 32) < 40
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }""")

old4 = """      // exit door
      const doorD = Math.hypot((ROOM_W / 2) * 32 - this.px, (ROOM_H - 1) * 32 - this.py);
      if (doorD < 70 && !near) {
        near = { kind: "object", label: "Leave the den", interact: "exit-interior" as unknown as InteractableKind };
      }"""
assert src.count(old4) == 1, "exit door detection"
src = src.replace(old4, """      // exit door hint (walk-out is primary; E still works near the gap)
      const geoHint = ROOM_GEO[room.id];
      const gwx = ((geoHint?.w ?? ROOM_W) / 2) * 32;
      const ghy = ((geoHint?.h ?? ROOM_H) - 1) * 32;
      const doorD = Math.hypot(gwx - this.px, ghy - this.py);
      if (doorD < 70 && !near) {
        near = { kind: "object", label: "Leave the den", interact: "exit-interior" as unknown as InteractableKind };
      }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("walk-out + exit hint respect room geo")
