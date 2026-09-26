#!/usr/bin/env python3
"""Patch 2: walk-through doors + doors mounted on house walls."""
import io

# ------------------------------------------------------------------
# engine.ts: auto-enter on overlap, walk-out through the doorway gap
# ------------------------------------------------------------------
p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

old = "  private huntedCount = 0;"
assert src.count(old) == 1, "huntedCount field"
src = src.replace(old, """  private huntedCount = 0;
  /** prevents instant re-enter when stepping back out through a doorway */
  private doorCooldownUntil = 0;""")

# auto-enter on overlap with any door object
old_near = """    let near: NearbyTarget | null = null;
    let bestD = 88;
    if (!this.interiorId) {
      for (const o of allObjects) {
        if (o.detail) continue; // garnish never shows an interact prompt
        const d = Math.hypot(o.x - this.px, o.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: o.label ?? o.id, interact: o.interact, interior: o.interior };
        }
      }"""
assert src.count(old_near) == 1, "nearby block"
src = src.replace(old_near, """    let near: NearbyTarget | null = null;
    let bestD = 88;
    if (!this.interiorId) {
      // walk-through doors: stepping onto any doorway enters it — no key needed
      if (!this.paused && this.time > this.doorCooldownUntil) {
        for (const o of allObjects) {
          if (!o.interior) continue;
          if (Math.abs(o.x - this.px) < o.w * 0.42 && Math.abs(o.y - this.py) < o.h * 0.55) {
            this.enterInterior(o.interior);
            this.doorCooldownUntil = this.time + 1.2;
            break;
          }
        }
      }
      for (const o of allObjects) {
        if (o.detail) continue; // garnish never shows an interact prompt
        if (o.interior) continue; // doorways are walked through, not pressed
        const d = Math.hypot(o.x - this.px, o.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: o.label ?? o.id, interact: o.interact };
        }
      }""")

# teleport() also grants a door cooldown so respawns don't re-trigger
old_tp = """  teleport(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.camX = x;
    this.camY = y;
    this.interiorId = null;
    this.cb.onInteriorChange(null);
  }"""
assert src.count(old_tp) == 1, "teleport"
src = src.replace(old_tp, """  teleport(x: number, y: number) {
    this.px = x;
    this.py = y;
    this.camX = x;
    this.camY = y;
    this.interiorId = null;
    this.doorCooldownUntil = this.time + 1.2;
    this.cb.onInteriorChange(null);
  }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("patch2a applied: walk-through doors in engine")

# ------------------------------------------------------------------
# world.ts: doors mounted ON the house walls (southern facade, embedded in
# the solid footprint edge so they read as the house's actual door)
# ------------------------------------------------------------------
p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

# North-row houses have fronts at y+h/2; southern row likewise.
# Replace each door object's position so it sits ON the wall line:
#   house-2 (64,138 h3.2): front y=139.6 -> door y=139.4 (half-embedded)
#   house-3 (92,138 h3.2): y=139.4
#   house-4 (70,134 h3.0): y=135.3
#   house-5 (85,134 h3.0): y=135.3
#   house-6 (58,158 h3.2): y=159.4
#   house-7 (70,160 h3.0): y=161.3
#   house-8 (84,158 h3.2): y=159.4
#   house-9 (96,160 h3.2): y=161.3
#   rusty  (78,140 h3.6): front y=141.8 -> door y=141.6
# kittypet doors: place on the small houses' south edge:
#   smudge-house entrance was (74.5,141.5,h1): door on south edge y=142.2
#   henry (61.2,139.9,h1): y=142.2; princess (69.5,135.9,h1): y=138.2
#   marmalade (91.5,139.9,h1): y=142.2; ginger (83.5,159.9,h1): y=162.2
moves = {
    'house-2-door': ('t(64)', 't(139.4)'),
    'house-3-door': ('t(92)', 't(139.4)'),
    'house-4-door': ('t(70)', 't(135.3)'),
    'house-5-door': ('t(85)', 't(135.3)'),
    'house-6-door': ('t(58)', 't(159.4)'),
    'house-7-door': ('t(70)', 't(161.3)'),
    'house-8-door': ('t(84)', 't(159.4)'),
    'house-9-door': ('t(96)', 't(161.3)'),
    'rusty-front-door': ('t(78)', 't(141.6)'),
    'smudge-door': ('t(74.5)', 't(142.2)'),
    'henry-door': ('t(61.2)', 't(142.2)'),
    'princess-door': ('t(69.5)', 't(138.2)'),
    'marmalade-door': ('t(94.6)', 't(142.2)'),
    'ginger-door': ('t(83.5)', 't(162.2)'),
}
import re
count = 0
for oid, (xexpr, yexpr) in moves.items():
    pat = re.compile(r'(\{ id: "' + re.escape(oid) + r'", x: )t\([^)]*\)(, y: )t\([^)]*\)')
    m = pat.search(src)
    assert m, oid
    src = src[:m.start()] + m.group(1) + xexpr + m.group(2) + yexpr + src[m.end():]
    count += 1
print(f"moved {count} doors onto house walls")
io.open(p, 'w', encoding='utf-8').write(src)
