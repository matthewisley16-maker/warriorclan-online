#!/usr/bin/env python3
"""Fix geo reference in interior movement block."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

old = """      if (this.interiorId) {
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
        // walk-out: step into the doorway gap at the bottom wall to leave —
        // no key press needed (mirrors the walk-in entrances outside)
        const gw = geo.w;
        const gh = geo.h;
        if (
          this.py > (gh - 2.1) * 32 &&
          Math.abs(this.px - (gw / 2) * 32) < 40
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }
      } else {"""
assert src.count(old) == 1, "movement block not found"
src = src.replace(old, """      if (this.interiorId) {
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
          this.py > (geo?.h ?? ROOM_H) - 2.1) * 32 &&
          Math.abs(this.px - gw / 2) < 40
        ) {
          this.exitInterior();
          this.doorCooldownUntil = this.time + 1.2;
        }
      } else {""")
io.open(p, 'w', encoding='utf-8').write(src)
print("movement block uses per-room geo")
