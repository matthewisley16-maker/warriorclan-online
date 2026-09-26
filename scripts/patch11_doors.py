#!/usr/bin/env python3
"""Patch 11: no separate doors — black doorway gaps inside house graphics."""
import io
import re

# ---------------- world.ts ----------------
p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

# 1) delete every *-door object line (they are separate objects today)
pattern = re.compile(r'\n  \{ id: "[a-z0-9-]*-door",[^}]*\},')
n = len(pattern.findall(src))
src = pattern.sub("", src)
print(f"removed {n} separate door objects")

# also remove the single-line-form doors if any remain
pattern2 = re.compile(r'\n  \{ id: "[a-z0-9-]*-door", [^}]*\},')
n2 = len(pattern2.findall(src))
src = pattern2.sub("", src)
if n2:
    print(f"removed {n2} more door objects (single-line form)")

io.open(p, 'w', encoding='utf-8').write(src)

# 2) mark enterable houses with interior + doorAt metadata.
# The WorldObject type gets optional doorAt: door center offset (in tiles,
# relative to object center, positive = south edge) so the engine can render
# a black gap in the facade and trigger entry on approach.
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
assert src.count(old_iface) == 1, "WorldObject iface"
src = src.replace(old_iface, """export interface WorldObject {
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
}""")

# 3) the house objects themselves become the entrances (already have interior)
# Give each enterable house a doorAt on its south face, centered.
for hid, dx in [("rusty-house", 0), ("house-2", 0), ("house-3", 0), ("house-4", 0),
                ("house-5", 0), ("house-6", 0), ("house-7", 0), ("house-8", 0),
                ("house-9", 0), ("barn", 0)]:
    pat = re.compile(r'(\{ id: "' + hid + r'",[^}]*)\},')
    m = pat.search(src)
    assert m, hid
    line = m.group(0)
    if "doorAt" in line:
        continue
    newline = line[:-2] + ', doorAt: { dx: ' + str(dx) + ', dy: 0 } },'
    src = src.replace(line, newline, 1)

io.open(p, 'w', encoding='utf-8').write(src)
print("houses carry their own doorways (doorAt)")

# ---------------- engine.ts ----------------
p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# 4) drawHouse / drawBarn accept a doorway: black rounded-top gap in the facade
old_h = "export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {"
assert src.count(old_h) == 1, "drawHouse import-use"
# The drawHouse/drawBarn live in draw.ts — patch there instead.
io.open(p, 'w', encoding='utf-8').write(src)

p = 'src/game/draw.ts'
src = io.open(p, encoding='utf-8').read()

old_house = """export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // walls
  ctx.fillStyle = "#c9b8a0";
  ctx.fillRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.78);
  // roof
  ctx.fillStyle = "#8a5a44";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y - h * 0.35);
  ctx.lineTo(x, y - h * 0.85);
  ctx.lineTo(x + w * 0.5, y - h * 0.35);
  ctx.closePath();
  ctx.fill();
  // door + windows
  ctx.fillStyle = "#6a4a34";
  ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
  ctx.fillStyle = "#7fa8c9";
  ctx.fillRect(x - w * 0.3, y - h * 0.28, w * 0.14, h * 0.16);
  ctx.fillRect(x + w * 0.16, y - h * 0.28, w * 0.14, h * 0.16);
}"""
assert src.count(old_house) == 1, "drawHouse body"
src = src.replace(old_house, """export function drawHouse(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  opts?: { doorway?: boolean },
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // walls
  ctx.fillStyle = "#c9b8a0";
  ctx.fillRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.78);
  // roof
  ctx.fillStyle = "#8a5a44";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y - h * 0.35);
  ctx.lineTo(x, y - h * 0.85);
  ctx.lineTo(x + w * 0.5, y - h * 0.35);
  ctx.closePath();
  ctx.fill();
  // windows
  ctx.fillStyle = "#7fa8c9";
  ctx.fillRect(x - w * 0.32, y - h * 0.28, w * 0.14, h * 0.16);
  ctx.fillRect(x + w * 0.18, y - h * 0.28, w * 0.14, h * 0.16);
  if (opts?.doorway) {
    // Pokemon-style open doorway: black rounded-top gap set into the facade
    const dw = Math.max(14, w * 0.17);
    const dh = Math.max(18, h * 0.52);
    ctx.fillStyle = "#0a0a0c";
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, y + h * 0.38);
    ctx.lineTo(x - dw / 2, y - h * 0.02);
    ctx.quadraticCurveTo(x, y - h * 0.2, x + dw / 2, y - h * 0.02);
    ctx.lineTo(x + dw / 2, y + h * 0.38);
    ctx.closePath();
    ctx.fill();
    // warm light spilling from the open door
    const g = ctx.createRadialGradient(x, y + h * 0.3, 2, x, y + h * 0.3, dw * 1.4);
    g.addColorStop(0, "rgba(255, 214, 140, 0.35)");
    g.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.36, dw * 1.2, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // closed door (non-enterable nests)
    ctx.fillStyle = "#6a4a34";
    ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
  }
}""")

old_barn = """export function drawBarn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {"""
i = src.find(old_barn)
assert i != -1, "drawBarn"
j = src.find("\nexport function drawCave", i)
barn_body = src[i:j]
new_barn = barn_body.replace(
    "// door + windows",
    "// big open doorway (barn is enterable)"
).replace(
    'ctx.fillStyle = "#6a4a34";\n  ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);',
    'ctx.fillStyle = "#0a0a0c";\n  ctx.fillRect(x - w * 0.14, y - h * 0.05, w * 0.28, h * 0.5);'
)
src = src.replace(barn_body, new_barn)

io.open(p, 'w', encoding='utf-8').write(src)
print("drawHouse/drawBarn render black doorway gaps")
