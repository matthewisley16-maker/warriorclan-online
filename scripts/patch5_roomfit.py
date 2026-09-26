#!/usr/bin/env python3
"""Patch 5: rooms fully coherent with their geometry + proximity walk-in."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# ---- 1) prop position helper (after ROOM_GEO table) ----
anchor = '  "moonstone-cave":   { w: 15, h: 12, cave: true,  floor: ["#5c5e66", "#50525a", "#686a72"], wall: ["#33343c", "#43454f"] },\n};'
assert src.count(anchor) == 1, "ROOM_GEO tail"
src = src.replace(anchor, anchor + """

/**
 * Props are authored on a 24x18 design grid; remap them proportionally into
 * each room's real size so nothing lands inside a wall of a smaller room.
 */
function propPx(
  roomId: string,
  prop: { x: number; y: number },
): { x: number; y: number } {
  const geo = ROOM_GEO[roomId];
  const gx = geo ? (prop.x / 24) * geo.w : prop.x;
  const gy = geo ? (prop.y / 18) * geo.h : prop.y;
  return { x: gx * 32 + 16, y: gy * 32 + 16 };
}""")

# ---- 2) fit each room's walls to its geometry (door stays centered) ----
anchor2 = "export const interiors: Record<string, InteriorDef> = {"
assert src.count(anchor2) == 1
# append the fitting loop after the interiors object closes — anchor on the barn ending
tail = '''  barn: {
    id: "barn",
    name: "The Farm Barn",'''
# find the end of the interiors object: search for "\n};" after barn's definition
i = src.find('    desc: "The barn breathes warm hay and cow.')
assert i != -1, "barn desc"
j = src.find("\n};", i)
assert j != -1, "interiors close"
insert_at = j + len("\n};")
fit_loop = """

// Fit every room's wall grid to its geometry (rounded cave dens, varied
// sizes) — the doorway gap stays centered in the bottom wall.
for (const room of Object.values(interiors)) {
  const geo = ROOM_GEO[room.id];
  if (geo) room.walls = roomSized(geo.w, geo.h, geo.cave);
}"""
src = src[:insert_at] + fit_loop + src[insert_at:]
print("wall-fitting loop added")

# ---- 3) enterInterior: spawn inside the room's real bounds ----
old3 = """  enterInterior(id: string) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    this.interiorId = id;
    this.px = (ROOM_W / 2) * 32;
    this.py = (ROOM_H - 3) * 32;
    this.camX = this.px;
    this.camY = this.py;
    this.cb.onInteriorChange(id);
  }"""
assert src.count(old3) == 1, "enterInterior"
src = src.replace(old3, """  enterInterior(id: string) {
    const room = interiors[id];
    if (!room) return;
    if (!this.interiorId) this.exitPos = { x: this.px, y: this.py };
    this.interiorId = id;
    const geo = ROOM_GEO[id];
    this.px = ((geo?.w ?? ROOM_W) / 2) * 32;
    this.py = ((geo?.h ?? ROOM_H) - 3) * 32;
    this.camX = this.px;
    this.camY = this.py;
    this.doorArmed = false;
    this.cb.onInteriorChange(id);
  }""")

# ---- 4) exitInterior: disarm re-entry until the player steps away ----
old4 = """  exitInterior() {
    if (!this.interiorId) return;
    this.interiorId = null;
    if (this.exitPos) {
      this.px = this.exitPos.x;
      this.py = this.exitPos.y + 40;
      this.camX = this.px;
      this.camY = this.py;
    }
    this.cb.onInteriorChange(null);
  }"""
assert src.count(old4) == 1, "exitInterior"
src = src.replace(old4, """  exitInterior() {
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
  }""")

# ---- 5) armed flag field ----
old5 = "  /** prevents instant re-enter when stepping back out through a doorway */\n  private doorCooldownUntil = 0;"
assert src.count(old5) == 1, "cooldown field"
src = src.replace(old5, """  /** prevents instant re-enter when stepping back out through a doorway */
  private doorCooldownUntil = 0;
  /** re-armed once the player steps away from every doorway */
  private doorArmed = true;""")

# ---- 6) auto-enter: proximity trigger with arming (covers big solid dens) ----
old6 = """      // walk-through doors: stepping onto any doorway enters it — no key needed
      if (!this.paused && this.time > this.doorCooldownUntil) {
        for (const o of allObjects) {
          if (!o.interior) continue;
          if (Math.abs(o.x - this.px) < o.w * 0.42 && Math.abs(o.y - this.py) < o.h * 0.55) {
            this.enterInterior(o.interior);
            this.doorCooldownUntil = this.time + 1.2;
            break;
          }
        }
      }"""
assert src.count(old6) == 1, "auto-enter block"
src = src.replace(old6, """      // walk-through entrances: step up to any doorway or den mouth and the
      // player walks straight in — no key needed. Re-entry is armed only
      // after stepping away, so exiting never bounces you back inside.
      let nearDoor: string | null = null;
      for (const o of allObjects) {
        if (!o.interior) continue;
        const th = Math.max(o.w, o.h) / 2 + 16;
        if (Math.hypot(o.x - this.px, o.y - this.py) < th) {
          nearDoor = o.interior;
          break;
        }
      }
      if (!nearDoor) {
        this.doorArmed = true;
      } else if (this.doorArmed && !this.paused && this.time > this.doorCooldownUntil) {
        this.enterInterior(nearDoor);
      }""")

# ---- 7) renderInterior props + interior NPC positions via room geo ----
old7 = """    // props
    for (const prop of room.props) {
      const x = prop.x * 32 + 16;
      const y = prop.y * 32 + 16;
      ctx.fillStyle = "rgba(0,0,0,0.2)";"""
assert src.count(old7) == 1, "props loop"
src = src.replace(old7, """    // props (remapped into this room's real bounds)
    for (const prop of room.props) {
      const pp = propPx(room.id, prop);
      const x = pp.x;
      const y = pp.y;
      ctx.fillStyle = "rgba(0,0,0,0.2)";""")

old8 = """    for (const npcId of room.npcs ?? []) {
      const n = this.npcStates.find((s) => s.def.id === npcId);
      if (!n) continue;
      const hx = 6 + (hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (ROOM_W - 13));
      const hy = 6 + (hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (ROOM_H - 13));
      const nxp = hx * 32 + 16;
      const nyp = hy * 32 + 16;
      drawCat(ctx, n.def, nxp, nyp, n.facing, n.pose === "walk" ? "sit" : n.pose, this.time, n.phase);"""
assert src.count(old8) == 1, "interior npc render"
src = src.replace(old8, """    for (const npcId of room.npcs ?? []) {
      const n = this.npcStates.find((s) => s.def.id === npcId);
      if (!n) continue;
      const gw2 = geo?.w ?? ROOM_W;
      const gh2 = geo?.h ?? ROOM_H;
      const hx = 2.5 + hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (gw2 - 6);
      const hy = 2.5 + hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (gh2 - 6);
      const nxp = hx * 32 + 16;
      const nyp = hy * 32 + 16;
      drawCat(ctx, n.def, nxp, nyp, n.facing, n.pose === "walk" ? "sit" : n.pose, this.time, n.phase);""")

# ---- 8) nearby-detection inside interiors uses the same remaps ----
old9 = """      const room = interiors[this.interiorId];
      for (const prop of room.props) {
        const px2 = prop.x * 32 + 16;
        const py2 = prop.y * 32 + 16;
        const d = Math.hypot(px2 - this.px, py2 - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: prop.label };
        }
      }"""
assert src.count(old9) == 1, "nearby props"
src = src.replace(old9, """      const room = interiors[this.interiorId];
      for (const prop of room.props) {
        const pp = propPx(room.id, prop);
        const d = Math.hypot(pp.x - this.px, pp.y - this.py);
        if (d < bestD) {
          bestD = d;
          near = { kind: "object", label: prop.label };
        }
      }""")

old10 = """        const hx = 6 + (hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (ROOM_W - 13));
        const hy = 6 + (hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (ROOM_H - 13));
        const d = Math.hypot(hx * 32 + 16 - this.px, hy * 32 + 16 - this.py);"""
assert src.count(old10) == 1, "nearby interior npcs"
src = src.replace(old10, """        const gw3 = ROOM_GEO[room.id]?.w ?? ROOM_W;
        const gh3 = ROOM_GEO[room.id]?.h ?? ROOM_H;
        const hx = 2.5 + hash2(npcId.length * 7 + 3, npcId.charCodeAt(0)) * (gw3 - 6);
        const hy = 2.5 + hash2(npcId.charCodeAt(0) * 3 + 1, npcId.length) * (gh3 - 6);
        const d = Math.hypot(hx * 32 + 16 - this.px, hy * 32 + 16 - this.py);""")

# ---- 9) "leave through the gap" hint text follows room geo ----
old11 = '    ctx.fillText("\u2193 leave through the gap", (ROOM_W / 2) * 32, (ROOM_H - 0.4) * 32);'
if src.count(old11) == 1:
    src = src.replace(old11, '    ctx.fillText("\u2193 leave through the gap", (geo.w / 2) * 32, (geo.h - 0.4) * 32);')
    print("exit hint uses geo")

io.open(p, 'w', encoding='utf-8').write(src)
print("patch5 complete")
