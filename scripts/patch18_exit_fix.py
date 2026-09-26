#!/usr/bin/env python3
"""Patch 18: exit placement — never stuck inside collision after leaving."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# 1) exitInterior: remember WHICH object we entered, and place the player on
#    the first truly walkable point outside it (spiral search). Also nudge
#    the camera and preserve old behavior as fallback.
old = """  exitInterior() {
    if (!this.interiorId) return;
    this.interiorId = null;
    if (this.exitPos) {
      this.px = this.exitPos.x;
      this.py = this.exitPos.y + 40;
      this.camX = this.px;
      this.camY = this.py;
    }
    this.doorArmed = false; // must step away before walking back in
    this.doorCooldownUntil = this.time + 1.2;
    this.cb.onInteriorChange(null);
  }"""
assert src.count(old) == 1, "exitInterior"
src = src.replace(old, """  /** the world object whose interior we're inside (for safe exit placement) */
  private enteredFrom: { x: number; y: number; w: number; h: number } | null = null;

  exitInterior() {
    if (!this.interiorId) return;
    this.interiorId = null;
    // Place the player at the nearest WALKABLE point outside the entrance
    // object's collision — never inside a wall (the old fixed +40px offset
    // could land inside solid dens, permanently trapping the player).
    if (this.exitPos) {
      let placed = false;
      if (this.enteredFrom) {
        const spot = this.findWalkableExitSpot(this.enteredFrom);
        if (spot) {
          this.px = spot.x;
          this.py = spot.y;
          placed = true;
        }
      }
      if (!placed) {
        // fallback: below the entry point, verified walkable
        let y = this.exitPos.y + 24;
        for (let i = 0; i < 10 && !placed; i++) {
          if (!this.solidAt(this.exitPos.x, y)) {
            this.px = this.exitPos.x;
            this.py = y;
            placed = true;
          }
          y += 16;
        }
      }
      if (!placed) {
        // last resort: keep old position (never trap the player)
        this.px = this.exitPos.x;
        this.py = this.exitPos.y + 40;
      }
      this.camX = this.px;
      this.camY = this.py;
    }
    this.enteredFrom = null;
    this.doorArmed = false; // must step away before walking back in
    this.doorCooldownUntil = this.time + 1.2;
    this.cb.onInteriorChange(null);
  }

  /** First free point on a ring just outside the entrance's collision box. */
  private findWalkableExitSpot(box: { x: number; y: number; w: number; h: number }): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    // south (in front of the door), then east, west, north — in steps outward
    for (const [dx, dy] of [
      [0, 1], [1, 0], [-1, 0], [0, -1],
    ] as const) {
      for (let d = 1; d <= 4; d++) {
        candidates.push({
          x: box.x + dx * (box.w / 2 + d * 14),
          y: box.y + dy * (box.h / 2 + d * 14),
        });
      }
    }
    for (const c of candidates) {
      if (!this.solidAt(c.x, c.y)) return c;
    }
    return null;
  }

  private solidAt(x: number, y: number): boolean {
    // reuse the collision check used for movement
    return !this.canMoveTo(x, y);
  }""")

# 2) enterInterior: record which object we entered
old2 = """  enterInterior(id: string) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    this.interiorId = id;"""
assert src.count(old2) == 1, "enterInterior"
src = src.replace(old2, """  enterInterior(id: string, fromObj?: { x: number; y: number; w: number; h: number }) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    if (fromObj) this.enteredFrom = fromObj;
    this.interiorId = id;""")

# 3) both entry paths pass the object box
old3 = "        this.enterInterior(nearDoor);"
assert src.count(old3) == 1, "walk-in call"
src = src.replace(old3, """        const doorObj = allObjects.find(
          (o) => o.interior === nearDoor && o.doorAt,
        );
        this.enterInterior(
          nearDoor,
          doorObj ? { x: doorObj.x, y: doorObj.y, w: doorObj.w, h: doorObj.h } : undefined,
        );""")

io.open(p, 'w', encoding='utf-8').write(src)
print("exit placement fixed: spiral walkable-spot search outside the entrance box")
