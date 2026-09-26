#!/usr/bin/env python3
"""Patch 11c: WorldObject.doorAt field + drawHouse/drawBarn doorway rendering."""
import io

# ---- world.ts: interface field ----
p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()
old_iface = """export interface WorldObject {
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
}"""
assert src.count(old_iface) == 1, "iface"
src = src.replace(old_iface, old_iface[:-1] + "  /** Pokemon-style doorway: door tile offset from object center (tiles). */\n  doorAt?: { dx: number; dy: number };\n}")
io.open(p, 'w', encoding='utf-8').write(src)
print("WorldObject.doorAt added")

# ---- draw.ts: doorway option on drawHouse + barn black gap ----
p = 'src/game/draw.ts'
src = io.open(p, encoding='utf-8').read()

old_sig = "export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {"
assert src.count(old_sig) == 1, "drawHouse sig"
src = src.replace(old_sig, "export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts?: { doorway?: boolean }) {")

old_door = """  // door + windows
  ctx.fillStyle = "#6a4a34";
  ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
  ctx.fillStyle = "#7fa8c9";"""
assert src.count(old_door) == 1, "house door block"
src = src.replace(old_door, """  // windows
  ctx.fillStyle = "#7fa8c9";""")
# append doorway/closed-door drawing right after the windows (find the closing of drawHouse)
i = src.find("export function drawHouse")
j = src.find("export function drawBarn", i)
seg = src[i:j]
old_tail = """  ctx.fillRect(x - w * 0.3, y - h * 0.28, w * 0.14, h * 0.16);
  ctx.fillRect(x + w * 0.16, y - h * 0.28, w * 0.14, h * 0.16);
}"""
assert old_tail in seg, "house tail"
new_tail = """  ctx.fillRect(x - w * 0.32, y - h * 0.28, w * 0.14, h * 0.16);
  ctx.fillRect(x + w * 0.18, y - h * 0.28, w * 0.14, h * 0.16);
  if (opts?.doorway) {
    // Pokemon-style open doorway: a black rounded-top gap set into the facade
    const dw = Math.max(14, w * 0.17);
    const dh = Math.max(18, h * 0.5);
    ctx.fillStyle = "#0a0a0c";
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, y + h * 0.38);
    ctx.lineTo(x - dw / 2, y - h * 0.02);
    ctx.quadraticCurveTo(x, y - h * 0.2, x + dw / 2, y - h * 0.02);
    ctx.lineTo(x + dw / 2, y + h * 0.38);
    ctx.closePath();
    ctx.fill();
    // warm light spilling out of the open door
    const g = ctx.createRadialGradient(x, y + h * 0.3, 2, x, y + h * 0.3, dw * 1.5);
    g.addColorStop(0, "rgba(255, 214, 140, 0.35)");
    g.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.38, dw * 1.2, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // closed door (non-enterable nests)
    ctx.fillStyle = "#6a4a34";
    ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
  }
}"""
seg = seg.replace(old_tail, new_tail)
src = src[:i] + seg + src[j:]

# barn: black open doorway instead of a small door
i = src.find("export function drawBarn")
j = src.find("export function drawCave", i)
barn = src[i:j]
old_bdoor = 'ctx.fillStyle = "#6a4a34";'
assert old_bdoor in barn, "barn door"
barn_new = barn.replace(old_bdoor, 'ctx.fillStyle = "#0a0a0c";', 1)
# widen the barn door rect to a proper opening
barn_new = barn_new.replace(
    "ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);",
    "ctx.fillRect(x - w * 0.14, y - h * 0.06, w * 0.28, h * 0.52);",
)
src = src[:i] + barn_new + src[j:]

io.open(p, 'w', encoding='utf-8').write(src)
print("drawHouse/drawBarn doorway rendering done")
