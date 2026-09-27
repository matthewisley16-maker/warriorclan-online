#!/usr/bin/env python3
# patch21_engine_fix.py — applies the engine.ts edits that patch20 defined but
# never invoked apply() for (RemotePlayer fields, RemoteRenderState + buffer
# constants, typed remoteRender map, engineState sampler, buffered
# interpolation in update(), synchronized-pose rendering, run flag).
import io, sys

def apply(path, pairs):
    with io.open(path, encoding="utf-8") as f:
        src = f.read()
    for old, new in pairs:
        n = src.count(old)
        if n == 0:
            print(f"FAIL {path}: anchor not found:\n{old[:200]}")
            sys.exit(1)
        if n > 1:
            print(f"FAIL {path}: anchor matched {n} times:\n{old[:200]}")
            sys.exit(1)
        src = src.replace(old, new)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"ok {path}: {len(pairs)} edit(s)")

PAIRS = []

# a) RemotePlayer interface + buffer types/constants
PAIRS.append((
"""  emote?: string;
  // server authority metadata (ordering + staleness rejection)
  serverTick?: number;
  stateVersion?: number;
  lastProcessedInput?: number;
}""",
"""  emote?: string;
  /** synchronized movement state: derived from velocity by the SENDER */
  movementState?: MovementState;
  /** synchronized animation state: idle/walk/crouch/sit/... (never frames) */
  animationState?: CatPose;
  // server authority metadata (ordering + staleness rejection)
  serverTick?: number;
  stateVersion?: number;
  lastProcessedInput?: number;
}

export type MovementState = "idle" | "walk" | "run" | "crouch";

interface RemoteRenderState {
  x: number;
  y: number;
  facing: number;
  /** pose to draw right now (state-driven — never a raw animation frame) */
  pose: CatPose;
  /** monotonic stamp of the newest server state folded into the buffer */
  serverTick: number;
  /** client-receive clock (ms) of the newest buffered server state */
  receivedAt: number;
  /** sliding window of recent valid server states, oldest first */
  buffer: RemoteStateSample[];
  /** anti-blink latch: keep "walk" briefly when movement state flickers */
  walkLatchUntil?: number;
  poseChangedAt?: number;
}

interface RemoteStateSample {
  x: number;
  y: number;
  facing: number;
  pose: CatPose;
  serverTick: number;
  receivedAt: number;
}

// interpolation tuning (networking constants, not gameplay tuning)
const REMOTE_INTERP_DELAY_MS = 140; // render this far behind the newest packet
const REMOTE_BUFFER_MS = 600; // keep this much history for late packets
const REMOTE_EXTRAPOLATE_MS = 220; // coast on velocity at most this long
const REMOTE_MAX_EXTRAP = 26; // never coast farther than this (px)
const REMOTE_SNAP_DIST = 250; // larger desync = authoritative correction
const REMOTE_SOFT_CATCHUP = 1 - Math.pow(0.0025, 1 / 60); // converge toward the timeline
const REMOTE_POSE_LATCH_S = 0.45; // hold walk this long after velocity stops"""
))

# b) imports: CatPose from draw, WORLD bounds from world
PAIRS.append((
"""  type InteractableKind,
  type NPCDef,
  type PreyKind,
} from "./world";""",
"""  type InteractableKind,
  type NPCDef,
  type PreyKind,
  WORLD_H,
  WORLD_W,
} from "./world";"""
))
PAIRS.append((
"""  type CatSkin,
  type PreySprite,
} from "./draw";""",
"""  type CatPose,
  type CatSkin,
  type PreySprite,
} from "./draw";"""
))

# c) typed remoteRender map
PAIRS.append((
"""  /** render positions for remote cats: eased toward server state each frame */
  private remoteRender = new Map<string, { x: number; y: number; facing: number }>();""",
"""  /**
   * Render state per remote cat: an interpolation buffer of recent SERVER
   * states plus the derived on-screen position/pose. Positions are never
   * taken raw from packets — they are interpolated between buffered states,
   * briefly extrapolated when packets run late, and snapped only on a large
   * authoritative correction.
   */
  private remoteRender = new Map<string, RemoteRenderState>();"""
))

# d) public movement-state sampler (consumed by Game.tsx heartbeats)
PAIRS.append((
"""  /** Remote players currently known (for the minimap). */
  get remoteList(): RemotePlayer[] {
    return [...this.remotes.values()];
  }""",
"""  /** Remote players currently known (for the minimap). */
  get remoteList(): RemotePlayer[] {
    return [...this.remotes.values()];
  }

  /**
   * Current snapshot of THIS player for networking: position, direction, and
   * the synchronized movement/animation state. Game.tsx samples this every
   * heartbeat so remote cats see real motion (never the old hardcoded
   * facing:1 / moving:false), and remote poses stay state-driven.
   */
  engineState(): {
    x: number; y: number; facing: 1 | -1; moving: boolean;
    movementState: MovementState; animationState: CatPose;
  } {
    const moving = this.pPose === "walk";
    const movementState: MovementState =
      this.sneaking && moving ? "crouch" : this.running && moving ? "run" : moving ? "walk" : "idle";
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState: this.pPose,
    };
  }"""
))

# e) per-frame update: replace simple easing with buffer interpolation
PAIRS.append((
"""    // --- remote interpolation: ease toward the latest SERVER-confirmed state.
    // Never render raw packet positions; stale updates (older stateVersion)
    // were already rejected by the server, so easing here is always toward
    // the newest accepted state. ---
    for (const [uid, r] of this.remotes) {
      const cur = this.remoteRender.get(uid) ?? { x: r.x, y: r.y, facing: r.facing };
      const k = 1 - Math.pow(0.001, dt); // smooth ~100ms catch-up
      cur.x += (r.x - cur.x) * k;
      cur.y += (r.y - cur.y) * k;
      if (r.facing !== cur.facing) cur.facing = r.facing;
      this.remoteRender.set(uid, cur);
    }
    for (const uid of [...this.remoteRender.keys()]) {
      if (!this.remotes.has(uid)) this.remoteRender.delete(uid);
    }""",
"""    // --- remote interpolation: render inside a short buffer of SERVER states
    // (interpolate-at-a-delay), briefly extrapolate when a packet is late,
    // and snap only on a large authoritative correction. Old/duplicate
    // packets can never move a cat backward: each buffer sample carries the
    // server tick that produced it. ---
    for (const [uid, r] of this.remotes) {
      const nowMs = this.time * 1000;
      let cur = this.remoteRender.get(uid);
      if (!cur) {
        // fresh snapshot (first sight or reconnect): start exactly at the
        // authoritative position — never reuse stale interpolation state
        const s = this.remoteStateOf(r, nowMs);
        cur = { x: s.x, y: s.y, facing: s.facing, pose: s.pose, serverTick: s.serverTick, receivedAt: s.receivedAt, buffer: [s] };
        this.remoteRender.set(uid, cur);
        continue;
      }
      const tick = r.serverTick ?? 0;
      if (tick > cur.serverTick) {
        // a newer server state arrived: buffer it (bounded) and advance
        const s = this.remoteStateOf(r, nowMs);
        cur.buffer.push(s);
        while (cur.buffer.length > 5 || nowMs - cur.buffer[0].receivedAt > REMOTE_BUFFER_MS) {
          cur.buffer.shift();
          if (cur.buffer.length <= 1) break;
        }
        cur.serverTick = tick;
        cur.receivedAt = s.receivedAt;
      }
      this.stepRemoteRender(cur, dt);
    }
    for (const uid of [...this.remoteRender.keys()]) {
      if (!this.remotes.has(uid)) this.remoteRender.delete(uid);
    }"""
))

# f) remote render: draw the synchronized pose from the render state
PAIRS.append((
"""    // remote players (interpolated render positions)
    for (const [uid, r] of this.remotes) {
      const rp = this.remoteRender.get(uid) ?? r;
      if (rp.x < viewL - 60 || rp.x > viewR + 60 || rp.y < viewT - 60 || rp.y > viewB + 60) continue;
      ents.push({
        y: rp.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y,
            (r.facing >= 0 ? 1 : -1) as 1 | -1,
            r.moving ? "walk" : "sit",
            this.time,
            (r.userId.charCodeAt(0) % 10),
          );""",
"""    // remote players (interpolated render state: position + synchronized pose)
    for (const [, r] of this.remotes) {
      const rp = this.remoteRender.get(r.userId);
      if (!rp) continue;
      if (rp.x < viewL - 60 || rp.x > viewR + 60 || rp.y < viewT - 60 || rp.y > viewB + 60) continue;
      ents.push({
        y: rp.y,
        draw: () => {
          drawCat(
            ctx,
            { ...r.appearance },
            rp.x,
            rp.y,
            (rp.facing >= 0 ? 1 : -1) as 1 | -1,
            rp.pose,
            this.time,
            (r.userId.charCodeAt(0) % 10),
          );"""
))

# g) run flag for engineState()
PAIRS.append((
"""  private waypointArrived = false;
  private sneaking = false;""",
"""  private waypointArrived = false;
  private sneaking = false;
  private running = false;"""
))
PAIRS.append((
"""    this.sneaking = this.keys.has("control") || this.keys.has("c");
    const running = this.keys.has("shift");""",
"""    this.sneaking = this.keys.has("control") || this.keys.has("c");
    const running = this.keys.has("shift");
    this.running = running;"""
))

apply("src/game/engine.ts", PAIRS)

# stepRemoteRender was inserted by patch20 with a (uid, cur, dt) signature;
# update() now calls it as (cur, dt) — align the method.
with io.open("src/game/engine.ts", encoding="utf-8") as f:
    src = f.read()
old_sig = "  private stepRemoteRender(uid: string, cur: RemoteRenderState, dt: number) {"
new_sig = "  private stepRemoteRender(cur: RemoteRenderState, dt: number) {"
if src.count(old_sig) == 1:
    src = src.replace(old_sig, new_sig)
elif src.count(new_sig) != 1:
    print("FAIL: stepRemoteRender signature not found in either form")
    sys.exit(1)
with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(src)
print("ok stepRemoteRender signature aligned")
print("patch21 complete")
