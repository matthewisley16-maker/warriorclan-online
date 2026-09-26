#!/usr/bin/env python3
"""Patch 15: den E-entry + serverTick/stateVersion sync fields."""
import io

# ================= engine.ts: den entry fix =================
p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# The walk-in trigger uses doorAt to compute the door point. Camp dens are
# SOLID, so the player can never reach the south-face point — use a bigger
# radius anchored on the object edge nearest the player.
old = """      let nearDoor: string | null = null;
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
      }"""
assert src.count(old) == 1, "nearDoor block"
src = src.replace(old, """      let nearDoor: string | null = null;
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
      }""")

# E-to-enter: keep interior objects in the nearby detection (they were excluded
# when doors became walk-through, which broke E-entry for dens)
old2 = """      for (const o of allObjects) {
        if (o.detail) continue; // garnish never shows an interact prompt
        if (o.interior) continue; // doorways are walked through, not pressed
        const d = Math.hypot(o.x - this.px, o.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: o.label ?? o.id, interact: o.interact };
        }
      }"""
assert src.count(old2) == 1, "nearby loop"
src = src.replace(old2, """      for (const o of allObjects) {
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
      }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("den entry fixed: walk-in + E both work, solid dens reachable")
