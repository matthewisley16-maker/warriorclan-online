#!/usr/bin/env python3
"""Patch 10: engine waypoint — world arrow, distance callback, arrival."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# 1) callback signature
old1 = "  onNpcIdle?: (npcName: string, line: string) => void;"
assert src.count(old1) == 1, "callback"
src = src.replace(old1, """  onNpcIdle?: (name: string, line: string) => void;
  /** waypoint distance update: meters + tiles (1 tile = 6 m) + arrived flag */
  onWaypoint?: (info: { meters: number; tiles: number; arrived: boolean }) => void;""")

# 2) state fields
old2 = "  /** re-armed once the player steps away from every doorway */\n  private doorArmed = true;"
assert src.count(old2) == 1, "fields"
src = src.replace(old2, """  /** re-armed once the player steps away from every doorway */
  private doorArmed = true;
  /** active waypoint in world px (set from the map's real tile coordinates) */
  private waypoint: { x: number; y: number } | null = null;
  private waypointArrived = false;""")

# 3) public methods
old3 = "  addBubble(b: ChatBubble) {"
assert src.count(old3) == 1, "addBubble"
src = src.replace(old3, """  /** Set a waypoint from world tile coordinates (map spot * 32). */
  setWaypoint(tx: number, ty: number) {
    this.waypoint = { x: tx * 32, y: ty * 32 };
    this.waypointArrived = false;
  }

  clearWaypoint() {
    this.waypoint = null;
    this.waypointArrived = false;
    this.cb.onWaypoint?.({ meters: 0, tiles: 0, arrived: false });
  }

  get hasWaypoint() {
    return this.waypoint !== null;
  }

  addBubble(b: ChatBubble) {""")

# 4) per-frame waypoint update (after prey block, before area detection)
old4 = """    // --- area + nearby detection ---
    const area = areaAt(this.px, this.py);"""
assert src.count(old4) == 1, "area anchor"
src = src.replace(old4, """    // --- waypoint: distance + arrival (outside AND inside buildings) ---
    if (this.waypoint) {
      const dTiles = Math.hypot(this.waypoint.x - this.px, this.waypoint.y - this.py) / 32;
      const meters = Math.round(dTiles * 6);
      const arrived = !this.waypointArrived && dTiles <= 1.5; // ~9 m arrival radius
      if (arrived) this.waypointArrived = true;
      if (this.time - this.lastWaypointEmit > 0.25) {
        this.lastWaypointEmit = this.time;
        this.cb.onWaypoint?.({
          meters,
          tiles: Math.round(dTiles),
          arrived,
        });
      }
      if (arrived) {
        this.waypoint = null;
        this.cb.onWaypoint?.({ meters: 0, tiles: 0, arrived: true });
      }
    }

    // --- area + nearby detection ---
    const area = areaAt(this.px, this.py);""")

# 5) emit timer field
old5 = "  private lastNearby: NearbyTarget | null = null;"
assert src.count(old5) == 1, "lastNearby"
src = src.replace(old5, old5 + "\n  private lastWaypointEmit = 0;")

# 6) render the world-space arrow + beacon (outdoors) — anchored over the player
old6 = """    // chat bubbles (world space, anchored to the cat they belong to)
    for (const b of this.bubbles) {"""
assert src.count(old6) == 1, "bubbles anchor"
src = src.replace(old6, """    // waypoint beacon + directional arrow (world space, floats over the cat)
    if (this.waypoint) {
      const ang = Math.atan2(this.waypoint.y - this.py, this.waypoint.x - this.px);
      const t = this.time;
      const bob = Math.sin(t * 2.2) * 4;
      // floating beacon over the cat: ring + arrow pointing along `ang`
      const ax = this.px;
      const ay = this.py - 62 + bob;
      // soft glow disc
      const glow = ctx.createRadialGradient(ax, ay, 2, ax, ay, 26);
      glow.addColorStop(0, "rgba(255, 200, 80, 0.35)");
      glow.addColorStop(1, "rgba(255, 200, 80, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ax, ay, 26, 0, Math.PI * 2);
      ctx.fill();
      // rotating arrow — world direction, smooth, points behind the player too
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      const wob = Math.sin(t * 6) * 0.06;
      ctx.rotate(wob);
      ctx.fillStyle = "#ffc653";
      ctx.strokeStyle = "rgba(90, 55, 10, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // dotted guide line toward the target (first 90 px)
      ctx.strokeStyle = "rgba(255, 198, 83, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.px + Math.cos(ang) * 22, this.py - 8 + Math.sin(ang) * 22);
      ctx.lineTo(this.px + Math.cos(ang) * 110, this.py - 8 + Math.sin(ang) * 110);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // chat bubbles (world space, anchored to the cat they belong to)
    for (const b of this.bubbles) {""")

io.open(p, 'w', encoding='utf-8').write(src)
print("patch10 complete: engine waypoint system")
