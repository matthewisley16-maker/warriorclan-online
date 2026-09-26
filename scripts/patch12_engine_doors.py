#!/usr/bin/env python3
"""Patch 12: engine doorway rendering + door-point proximity entry."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# 1) import drawHouse/drawBarn for direct calls with opts
if "drawHouse," not in src:
    old_imp = 'import {\n  drawPrey,'
    assert src.count(old_imp) == 1, "draw import"
    src = src.replace(old_imp, 'import {\n  drawBarn,\n  drawHouse,\n  drawPrey,')

# 2) house/barn render cases pass doorway flag
old2 = '            case "house": drawHouse(ctx, o.x, o.y, w, h); break;'
assert src.count(old2) == 1, "house case"
src = src.replace(old2, '            case "house": drawHouse(ctx, o.x, o.y, w, h, { doorway: !!o.interior }); break;')

# 3) proximity walk-in: approach the DOOR POINT (south face of the house)
old3 = """      let nearDoor: string | null = null;
      for (const o of allObjects) {
        if (!o.interior) continue;
        const th = Math.max(o.w, o.h) / 2 + 14;
        if (Math.hypot(o.x - this.px, o.y - this.py) < th) {
          nearDoor = o.interior;
          break;
        }
      }"""
assert src.count(old3) == 1, "nearDoor block"
src = src.replace(old3, """      let nearDoor: string | null = null;
      for (const o of allObjects) {
        if (!o.interior || !o.doorAt) continue;
        // door point: the doorway gap on the object's south face
        const doorX = o.x + o.doorAt.dx * 32;
        const doorY = o.y + o.h / 2 + o.doorAt.dy * 32;
        const th = Math.max(20, o.w * 0.16);
        if (Math.hypot(doorX - this.px, doorY - this.py) < th) {
          nearDoor = o.interior;
          break;
        }
      }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("engine door rendering + door-point proximity entry done")
