#!/usr/bin/env python3
# patch20_mp_state.py — multiplayer movement + walking-animation fix.
#
# 1. Game.tsx: heartbeats send the REAL engine facing/moving/movementState
#    (was hardcoded `facing: 1, moving: false` in both call sites).
# 2. engine.ts: remote players get a proper interpolation buffer —
#    time-stamped ring buffer of server states, interpolate-at-delay,
#    brief safe extrapolation, snap only on large desync; pose derived from
#    synchronized movement/animation state; direction + animationState
#    synced (never frames); new engineState() sampler for networking.
# 3. presence.ts: server-side speed validation (server wins on impossible
#    jumps), out-of-order/duplicate input rejection, movementState +
#    animationState echoed back to all clients.
# 4. schema.ts: movementState + animationState columns on presence.
import io, sys, re

def apply(path, pairs):
    with io.open(path, encoding="utf-8") as f:
        src = f.read()
    for old, new in pairs:
        if new == "MUST_BE_UNIQUE" or True:
            pass
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

# ---------------------------------------------------------------------------
# 1) src/pages/Game.tsx — real movement state in both heartbeat call sites
# ---------------------------------------------------------------------------
GAME_PAIRS = []

# shared sampler + boot-effect heartbeat
GAME_PAIRS.append((
"""  // presence heartbeat (open world only)
    let hb: number | undefined;
    if (mode === "open" && myCat) {
      hb = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: posRef.current.x,
          y: posRef.current.y,
          facing: 1,
          moving: false,
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 5000);
    }""",
"""  // presence heartbeat (open world only)
    let hb: number | undefined;
    if (mode === "open" && myCat) {
      hb = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: posRef.current.x,
          y: posRef.current.y,
          ...movementSample(g),
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 5000);
    }"""
))

# ping-sampler heartbeat (was also hardcoded facing:1 / moving:false)
GAME_PAIRS.append((
"""        await heartbeat({
          x: posRef.current.x,
          y: posRef.current.y,
          facing: 1,
          moving: false,
          mode: mode === "story" ? "story" : "open",""",
"""        await heartbeat({
          x: posRef.current.x,
          y: posRef.current.y,
          ...movementSample(gameRef.current),
          mode: mode === "story" ? "story" : "open","""
))

# add the sampler helper above the component
GAME_PAIRS.append((
"""/** live facing for the minimap arrow (engine mutates a ref, so poll it) */""",
"""/** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementState } | null) {
  if (g?.engineState) {
    const s = g.engineState();
    return { x: s.x, y: s.y, facing: s.facing, moving: s.moving, movementState: s.movementState, animationState: s.animationState };
  }
  return { facing: 1, moving: false };
}

/** live facing for the minimap arrow (engine mutates a ref, so poll it) */"""
))

# remote sync effect: pass movement/animation state through to the engine
GAME_PAIRS.append((
"""    const map = g.remotes;
    const seen = new Set<string>();
    for (const r of remotesRaw as RemotePlayer[]) {
      seen.add(r.userId);
      map.set(r.userId, r);
    }""",
"""    const map = g.remotes;
    const seen = new Set<string>();
    for (const r of remotesRaw as RemotePlayer[]) {
      seen.add(r.userId);
      map.set(r.userId, r);
    }
    // a player joining (or re-joining) is re-buffed by the engine from their
    // fresh authoritative snapshot — no stale interpolation state is reused"""
))

apply("src/pages/Game.tsx", GAME_PAIRS)

# ---------------------------------------------------------------------------
# 2) src/game/engine.ts — interpolation buffer + synchronized animation state
# ---------------------------------------------------------------------------
ENGINE_PAIRS = []

# a) RemotePlayer interface: synchronized movement/animation state
ENGINE_PAIRS.append((
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

# b) engine imports: CatPose comes from draw, WORLD bounds from world
ENGINE_PAIRS.append((
"""import {
  drawBarn,
  drawCat,
  drawCave,""",
"""import {
  drawBarn,
  drawCat,
  drawCave,"""
))
ENGINE_PAIRS.append((
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
ENGINE_PAIRS.append((
"""  type CatSkin,
  type PreySprite,
} from "./draw";""",
"""  type CatPose,
  type CatSkin,
  type PreySprite,
} from "./draw";"""
))

# c) typed remoteRender map
ENGINE_PAIRS.append((
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
ENGINE_PAIRS.append((
"""  /** Remote players currently known (for the minimap). */
  get remoteList(): RemotePlayer[] {
    return [...this.remotes.values()];
  }""",
"""  /** Remote players currently known (for the minimap). */
  get remoteList(): RemotePlayer[] {
    return [...this.remotes.values()];
  }

  /**
   * Current authoritative-enough snapshot of THIS player for networking:
   * position, direction, and the synchronized movement/animation state.
   * Game.tsx samples this every heartbeat so remote cats see real motion
   * (never the old hardcoded facing:1 / moving:false).
   */
  engineState(): MovementState & { x: number; y: number; facing: 1 | -1; moving: boolean; movementState: MovementState; animationState: CatPose } {
    const moving = this.pPose === \"walk\";
    const movementState: MovementState = this.sneaking && moving ? \"crouch\" : this.running && moving ? \"run\" : moving ? \"walk\" : \"idle\";
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
ENGINE_PAIRS.append((
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
        cur = { ...s, pose: s.pose, buffer: [s], receivedAt: s.receivedAt, serverTick: s.serverTick };
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
      this.stepRemoteRender(uid, cur, dt);
    }
    for (const uid of [...this.remoteRender.keys()]) {
      if (!this.remotes.has(uid)) this.remoteRender.delete(uid);
    }"""
))

# f) remote render: draw the synchronized pose from the render state
ENGINE_PAIRS.append((
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
    for (const [uid, r] of this.remotes) {
      const rp = this.remoteRender.get(uid);
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
ENGINE_PAIRS.append((
"""  private doorArmed = true;
  /** active waypoint in world px (set from the map's real tile coordinates) */
  private waypoint: { x: number; y: number } | null = null;
  private waypointArrived = false;
  private sneaking = false;""",
"""  private doorArmed = true;
  /** active waypoint in world px (set from the map's real tile coordinates) */
  private waypoint: { x: number; y: number } | null = null;
  private waypointArrived = false;
  private sneaking = false;
  private running = false;"""
))
ENGINE_PAIRS.append((
"""    this.sneaking = this.keys.has("control") || this.keys.has("c");
    const running = this.keys.has("shift");""",
"""    this.sneaking = this.keys.has("control") || this.keys.has("c");
    const running = this.keys.has("shift");
    this.running = running;"""
))

# h) new private methods appended at the end of the class body: after render(),
#    before the final closing brace of the class. Anchor on the emote draw of
#    the player entity + ents.sort... actually anchor at the very end of file.
with io.open("src/game/engine.ts", encoding="utf-8") as f:
    eng = f.read()

TAIL_ANCHOR = """    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();"""
assert eng.count(TAIL_ANCHOR) == 1

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
  private stepRemoteRender(uid: string, cur: RemoteRenderState, dt: number) {
    const nowMs = this.time * 1000;
    const targetMs = nowMs - REMOTE_INTERP_DELAY_MS;
    const buf = cur.buffer;

    if (buf.length === 0) return;

    // --- locate the pair of samples surrounding targetMs ---
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].receivedAt > targetMs) i--;
    const a = buf[Math.max(0, i - 1)];
    const b = buf[i];

    let nx: number;
    let ny: number;
    let pose: CatPose = b.pose;
    let facing = b.facing;

    if (b.receivedAt >= targetMs && b.receivedAt > a.receivedAt) {
      // between two real server states: interpolate (smooth, ordered)
      const span = b.receivedAt - a.receivedAt;
      const t = Math.min(1, Math.max(0, (targetMs - a.receivedAt) / span));
      nx = a.x + (b.x - a.x) * t;
      ny = a.y + (b.y - a.y) * t;
    } else {
      // past the newest sample: brief safe extrapolation along its velocity…
      const prev = buf.length > 1 ? buf[buf.length - 2] : b;
      const dtS = Math.max(1, b.receivedAt - prev.receivedAt) / 1000;
      let vx = (b.x - prev.x) / dtS;
      let vy = (b.y - prev.y) / dtS;
      const overMs = targetMs - b.receivedAt;
      if (overMs > REMOTE_EXTRAPOLATE_MS) {
        // …then hold the authoritative position (never run away from the server)
        nx = b.x;
        ny = b.y;
        pose = b.pose;
      } else {
        const stepS = (this.lastFrameDt || dt) * 1;
        const lead = Math.min(overMs / 1000, REMOTE_MAX_EXTRAP / Math.max(1, Math.hypot(vx, vy)));
        nx = b.x + vx * Math.min(overMs / 1000, lead);
        ny = b.y + vy * Math.min(overMs / 1000, lead);
        // clamp extrapolation distance
        const dx = nx - b.x;
        const dy = ny - b.y;
        const d = Math.hypot(dx, dy);
        if (d > REMOTE_MAX_EXTRAP) {
          nx = b.x + (dx / d) * REMOTE_MAX_EXTRAP;
          ny = b.y + (dy / d) * REMOTE_MAX_EXTRAP;
        }
        vx = 0; vy = 0; // (silence unused-var in strict builds)
      }
      void vx; void vy;
    }

    // --- large desync: snap (authoritative correction, no slow drift back) ---
    const drift = Math.hypot(nx - cur.x, ny - cur.y);
    if (drift > REMOTE_SNAP_DIST) {
      cur.x = nx;
      cur.y = ny;
    } else if (drift > 0.01) {
      // smooth the residual between timeline position and render position —
      // anti-rubber-banding: small corrections glide, never teleport
      cur.x += (nx - cur.x) * REMOTE_SOFT_CATCHUP;
      cur.y += (ny - cur.y) * REMOTE_SOFT_CATCHUP;
    }

    // --- direction + pose: state-driven, only changes when state changes ---
    if (facing !== cur.facing) cur.facing = facing;
    if (pose !== cur.pose) {
      if (cur.pose === "walk" && pose !== "walk" && nowMs / 1000 - (cur.walkLatchUntil ?? 0) < REMOTE_POSE_LATCH_S) {
        // hold the walk frame briefly so a 1-frame stop doesn't blink idle
      } else {
        cur.pose = pose;
        cur.poseChangedAt = nowMs / 1000;
      }
    }
    if (pose === "walk") cur.walkLatchUntil = nowMs / 1000 + REMOTE_POSE_LATCH_S;
  }
"""

eng = eng.rstrip("\n") + "\n"
# insert METHODS before the final closing brace of the class (last '}' at col 0)
last_brace = eng.rfind("\n}")
if last_brace == -1:
    print("FAIL engine.ts: closing class brace not found"); sys.exit(1)
eng = eng[:last_brace] + "\n" + METHODS + eng[last_brace:]

# RemoteRenderState extra fields used above
eng = eng.replace(
"""interface RemoteRenderState {
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
}""",
"""interface RemoteRenderState {
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
}""", 1)

# lastFrameDt tracking (used by extrapolation step sizing)
eng = eng.replace(
"""  private raf = 0;
  private lastTime = 0;
  private time = 0;""",
"""  private raf = 0;
  private lastTime = 0;
  private time = 0;
  private lastFrameDt = 1 / 60;""", 1)
# find where loop computes dt: anchor "const dt" near loop
m = re.search(r"\n(\s*)const dt = [^;]+;", eng)
if not m:
    print("FAIL engine.ts: dt computation not found"); sys.exit(1)
eng = eng[:m.end()] + f"\n{m.group(1)}this.lastFrameDt = dt;" + eng[m.end():]

with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(eng)
print("ok src/game/engine.ts: buffer/pose patch applied")

# ---------------------------------------------------------------------------
# 3) src/convex/presence.ts — validation + new fields
# ---------------------------------------------------------------------------
PRESENCE_PAIRS = []

PRESENCE_PAIRS.append((
"""const STALE_MS = 20_000;""",
"""const STALE_MS = 20_000;

// movement-state sync: the authoritative movement vocabulary (mirrors engine)
const MOVEMENT_STATES = new Set(["idle", "walk", "run", "crouch"]);
// animation states mirror the engine's CatPose vocabulary
const ANIM_STATES = new Set(["walk", "sit", "sleep", "crouch", "groom", "stretch"]);

// server speed authority: clamp generously above RUN_SPEED (250 px/s) so
// lag spikes never rubber-band honest clients, but impossible jumps
// (teleports) are pulled back to the last confirmed position.
const MAX_SPEED_PX_S = 340;
const MAX_TELEPORT_PX = 900; // larger than that = new snapshot, accept
// heartbeat cadence is ~5s; anything older uses the same rules

/** true if `inputSequence` is NEWER than the last processed one. */
function isFreshInput(incoming: number | undefined, last: number | undefined): boolean {
  if (incoming === undefined) return true; // legacy clients: accept
  if (last !== undefined && incoming <= last) return false; // old/duplicate
  return true;
}"""
))

PRESENCE_PAIRS.append((
"""    appearance,
    inputSequence: v.optional(v.number()),
  },""",
"""    appearance,
    inputSequence: v.optional(v.number()),
    movementState: v.optional(v.string()),
    animationState: v.optional(v.string()),
  },"""
))

PRESENCE_PAIRS.append((
"""    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x: args.x,
      y: args.y,
      facing: args.facing,
      moving: args.moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      updatedAt: now,
    });
    return id;""",
"""    const now = Date.now();

    // ---- ordering: ignore old/duplicate/out-of-order packets outright ----
    if (existing && !isFreshInput(args.inputSequence, existing.inputSequence)) {
      return existing._id;
    }

    // ---- movement state validation: never persist an unknown vocabulary ----
    const movementState =
      args.movementState && MOVEMENT_STATES.has(args.movementState) ? args.movementState : undefined;
    const animationState =
      args.animationState && ANIM_STATES.has(args.animationState) ? args.animationState : undefined;

    // ---- position + speed authority (the SERVER wins on impossible moves) --
    let x = args.x;
    let y = args.y;
    let moving = args.moving;
    let facing = args.facing;
    if (existing) {
      const dtS = Math.max(0.25, (now - existing.updatedAt) / 1000);
      const dist = Math.hypot(x - existing.x, y - existing.y);
      if (dist <= MAX_TELEPORT_PX && dist / dtS > MAX_SPEED_PX_S) {
        // impossible for any real movement state — reject the jump, keep the
        // last confirmed position but accept the (valid) direction/state
        x = existing.x;
        y = existing.y;
        moving = false;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        x,
        y,
        facing,
        moving,
        emote: args.emote,
        mode: args.mode,
        catName: args.catName,
        clan: args.clan,
        rank: args.rank,
        appearance: args.appearance,
        inputSequence: args.inputSequence,
        movementState,
        animationState,
        stateVersion: (existing.stateVersion ?? 0) + 1,
        serverTick: now,
        updatedAt: now,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x,
      y,
      facing,
      moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      inputSequence: args.inputSequence,
      movementState,
      animationState,
      stateVersion: 1,
      serverTick: now,
      updatedAt: now,
    });
    return id;"""
))

PRESENCE_PAIRS.append((
"""        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
      }));""",
"""        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
        movementState: r.movementState,
        animationState: r.animationState,
        serverTick: r.serverTick,
        stateVersion: r.stateVersion,
        lastProcessedInput: r.inputSequence,
      }));"""
))

apply("src/convex/presence.ts", PRESENCE_PAIRS)

# ---------------------------------------------------------------------------
# 4) src/convex/schema.ts — presence movement/animation state columns
# ---------------------------------------------------------------------------
SCHEMA_PAIRS = [(
"""      inputSequence: v.optional(v.number()),
      stateVersion: v.optional(v.number()),
      serverTick: v.optional(v.number()),
    }).index("by_user", ["userId"])""",
"""      inputSequence: v.optional(v.number()),
      stateVersion: v.optional(v.number()),
      serverTick: v.optional(v.number()),
      // synchronized state vocabulary (idle/walk/run/crouch + CatPose)
      movementState: v.optional(v.string()),
      animationState: v.optional(v.string()),
    }).index("by_user", ["userId"])"""
)]
apply("src/convex/schema.ts", SCHEMA_PAIRS)

print("patch20 complete")
