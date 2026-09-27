#!/usr/bin/env python3
# patch22_engine_relocate.py — patch20 inserted the remote-networking methods
# after the class (into wrapText) because the file has module-level functions
# past GameCanvas. This moves them into the class body and cleans up:
# dt-scaled soft catch-up, bounded extrapolation, correct walk-pose latch,
# constant renames, unused imports/fields, Game.tsx MovementState import.
import io, sys

with io.open("src/game/engine.ts", encoding="utf-8") as f:
    src = f.read()

MARK = "  // ---- remote networking helpers"

# 1) cut the misplaced block (MARK .. just before wrapText's closing "\n}")
start = src.find(MARK)
if start == -1:
    print("FAIL: helper block marker not found")
    sys.exit(1)
cut = src.find("\n}", start)
if cut == -1:
    print("FAIL: closing brace after block not found")
    sys.exit(1)
src = src[:start] + src[cut:]

# 2) insert cleaned methods at the real end of the GameCanvas class
idx = src.find("\nfunction wrapText")
if idx == -1:
    print("FAIL: wrapText anchor not found")
    sys.exit(1)
cls_end = src.rfind("\n}", 0, idx)
if cls_end == -1:
    print("FAIL: class closing brace not found")
    sys.exit(1)

METHODS = """
  // ---- remote networking helpers ------------------------------------------

  /** Normalize an incoming server state into a buffered sample. */
  private remoteStateOf(r: RemotePlayer, nowMs: number): RemoteStateSample {
    const ms = r.movementState ?? (r.moving ? "walk" : "idle");
    const anim = r.animationState ?? (r.moving ? "walk" : "sit");
    return {
      x: r.x,
      y: r.y,
      facing: r.facing,
      pose: this.poseFromMovement(ms, anim),
      serverTick: r.serverTick ?? 0,
      receivedAt: nowMs,
    };
  }

  /** Movement state -> draw pose, using the game's existing 2D poses. */
  private poseFromMovement(ms: MovementState, anim: CatPose): CatPose {
    // animation state drives the sprite; movement state only disambiguates
    // idle-like anims so a moving cat can never draw an idle pose.
    if (ms === "walk" || ms === "run") return "walk";
    if (ms === "crouch") return "crouch";
    // ms === "idle": show the synchronized idle-like pose (sit/sleep/groom…)
    return anim === "walk" || anim === "crouch" ? "sit" : anim;
  }

  /**
   * Advance one remote cat's render state along its buffered server timeline.
   * Strategy: interpolate ~REMOTE_INTERP_DELAY_MS behind the newest sample;
   * if the timeline is exhausted (late packet), coast briefly along the last
   * velocity, then hold position; large desyncs snap (authoritative fix).
   */
  private stepRemoteRender(cur: RemoteRenderState, dt: number) {
    const nowMs = this.time * 1000;
    const targetMs = nowMs - REMOTE_INTERP_DELAY_MS;
    const buf = cur.buffer;
    if (buf.length === 0) return;

    // --- locate the two samples surrounding the delayed render time ---
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].receivedAt > targetMs) i--;
    const a = buf[Math.max(0, i - 1)];
    const b = buf[i];

    let nx: number;
    let ny: number;
    const pose = b.pose;
    const facing = b.facing;

    if (b.receivedAt >= targetMs && b.receivedAt > a.receivedAt) {
      // between two real server states: interpolate (smooth, ordered)
      const span = b.receivedAt - a.receivedAt;
      const t = Math.min(1, Math.max(0, (targetMs - a.receivedAt) / span));
      nx = a.x + (b.x - a.x) * t;
      ny = a.y + (b.y - a.y) * t;
    } else {
      // past the newest sample: brief safe extrapolation along its velocity,
      // then hold the authoritative position (never run away from the server)
      const prev = buf.length > 1 ? buf[buf.length - 2] : b;
      const dtS = Math.max(1, b.receivedAt - prev.receivedAt) / 1000;
      const overS = Math.min(Math.max(0, (targetMs - b.receivedAt) / 1000), REMOTE_EXTRAPOLATE_MS / 1000);
      nx = b.x + ((b.x - prev.x) / dtS) * overS;
      ny = b.y + ((b.y - prev.y) / dtS) * overS;
      const d = Math.hypot(nx - b.x, ny - b.y);
      if (d > REMOTE_MAX_EXTRAP) {
        nx = b.x + ((nx - b.x) / d) * REMOTE_MAX_EXTRAP;
        ny = b.y + ((ny - b.y) / d) * REMOTE_MAX_EXTRAP;
      }
    }

    // --- large desync: snap (authoritative correction, no slow drift back) ---
    const drift = Math.hypot(nx - cur.x, ny - cur.y);
    if (drift > REMOTE_SNAP_DIST) {
      cur.x = nx;
      cur.y = ny;
    } else {
      // anti-rubber-banding: glide toward the timeline, never teleport
      const k = 1 - Math.exp(-dt * REMOTE_SOFT_CATCHUP);
      cur.x += (nx - cur.x) * k;
      cur.y += (ny - cur.y) * k;
    }

    // --- direction + pose: state-driven, only changes when state changes ---
    if (facing !== cur.facing) cur.facing = facing;
    if (pose === "walk") {
      cur.pose = "walk"; // moving: walking animation, always
      cur.walkLatchUntil = nowMs + REMOTE_POSE_LATCH_MS;
    } else if (pose !== cur.pose) {
      if (cur.pose === "walk" && nowMs < cur.walkLatchUntil) {
        // hold walk briefly so a 1-frame movement blip never blinks idle
      } else {
        cur.pose = pose;
      }
    }
  }
"""
src = src[:cls_end] + "\n" + METHODS + src[cls_end:]

# 3) constant renames / semantics fixes
REPL = [
    (
        'const REMOTE_SOFT_CATCHUP = 1 - Math.pow(0.0025, 1 / 60); // converge toward the timeline',
        'const REMOTE_SOFT_CATCHUP = 18; // timeline-follow rate (1/s), dt-scaled',
    ),
    (
        'const REMOTE_POSE_LATCH_S = 0.45; // hold walk this long after velocity stops',
        'const REMOTE_POSE_LATCH_MS = 450; // hold walk this long after movement stops',
    ),
    (
        '  WORLD_H,\n  WORLD_W,\n} from "./world";',
        '} from "./world";',
    ),
    (
        "  private raf = 0;\n  private lastTime = 0;\n  private time = 0;\n  private lastFrameDt = 1 / 60;",
        "  private raf = 0;\n  private lastTime = 0;\n  private time = 0;",
    ),
]
for old, new in REPL:
    n = src.count(old)
    if n != 1:
        print(f"FAIL: expected exactly 1 match, got {n} for:\n{old[:120]}")
        sys.exit(1)
    src = src.replace(old, new)

# drop the per-frame lastFrameDt write patch20 inserted after the dt computation
old_dt = "    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);\n    this.lastFrameDt = dt;"
if old_dt in src:
    src = src.replace(old_dt, "    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);")

with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(src)
print("ok src/game/engine.ts relocated + cleaned")

# 4) Game.tsx: import MovementState for the sampler helper's type
with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()
old_imp = 'import { GameCanvas, type NearbyTarget, type RemotePlayer, type WeatherKind } from "@/game/engine";'
new_imp = 'import { GameCanvas, type MovementState, type NearbyTarget, type RemotePlayer, type WeatherKind } from "@/game/engine";'
if g.count(old_imp) == 1:
    g = g.replace(old_imp, new_imp)
    with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
        f.write(g)
    print("ok src/pages/Game.tsx MovementState import added")
else:
    print("SKIP Game.tsx import (already present or changed)")
print("patch22 complete")
