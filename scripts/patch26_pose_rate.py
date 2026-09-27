#!/usr/bin/env python3
# patch26_pose_rate.py —
# 1. engine.ts: the player's walk pose must end when movement ends. Until now
#    pPose stayed "walk" forever after the first step (standing cat with a
#    walking animation). Track real frame velocity; stop => idle pose ("sit"
#    is the game's idle read). Also expose the live speed (px/s).
# 2. Game.tsx: heartbeats every 5s cannot drive smooth remote motion — the
#    interpolation buffer needs a steady cadence. Add a 300ms dedicated
#    movement-sync heartbeat in the open world (5s presence keepalive stays).
import io, sys

def sub1(src, old, new, path):
    n = src.count(old)
    if n != 1:
        print(f"FAIL {path}: expected 1 match, got {n} for:\n{old[:160]}")
        sys.exit(1)
    return src.replace(old, new)

# ---- engine.ts ------------------------------------------------------------
with io.open("src/game/engine.ts", encoding="utf-8") as f:
    e = f.read()

# velocity tracking fields
e = sub1(
    e,
    "  private sneaking = false;\n  private running = false;",
    "  private sneaking = false;\n  private running = false;\n  private pSpeed = 0; // live speed in px/s (drives pose + networking)",
    "src/game/engine.ts",
)

# measure real per-frame displacement and flip pose to idle when stopped
e = sub1(
    e,
    """    // camera
    const lerp = 1 - Math.pow(0.0001, dt);""",
    """    // real velocity this frame: stop => idle pose (never walk-in-place)
    const movedX = this.px - (this.prevPx ?? this.px);
    const movedY = this.py - (this.prevPy ?? this.py);
    this.pSpeed = Math.hypot(movedX, movedY) / Math.max(dt, 1 / 120);
    this.prevPx = this.px;
    this.prevPy = this.py;
    if (this.time > this.poseUntil && !movingNow && this.pPose === "walk") {
      this.pPose = "sit"; // idle read: standing cats sit, animation stops
    }

    // camera
    const lerp = 1 - Math.pow(0.0001, dt);""",
    "src/game/engine.ts",
)

# declare prevPx/prevPy next to the player fields
e = sub1(
    e,
    "  private px = 0;\n  private py = 0;",
    "  private px = 0;\n  private py = 0;\n  private prevPx = 0;\n  private prevPy = 0;",
    "src/game/engine.ts",
)

# engineState: use measured speed + keep pose semantics in one place
e = sub1(
    e,
    """    const moving = this.pPose === "walk";
    // sneaking renders as a walking cat (local parity); speed is what changes
    const movementState: MovementState = moving ? (this.running ? "run" : "walk") : "idle";
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState: this.pPose,
    };""",
    """    // velocity > threshold => moving (spec: animation derives from movement)
    const moving = this.pSpeed > 8;
    const movementState: MovementState = moving ? (this.pSpeed > 205 ? "run" : "walk") : "idle";
    const animationState: CatPose =
      !moving && this.time > this.poseUntil && this.pPose !== "walk" ? this.pPose : moving ? "walk" : "sit";
    return {
      x: this.px,
      y: this.py,
      facing: this.pxFacing,
      moving,
      movementState,
      animationState,
    };""",
    "src/game/engine.ts",
)

with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(e)
print("ok src/game/engine.ts stop=>idle pose + speed")

# ---- Game.tsx -------------------------------------------------------------
with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

# dedicated movement-sync heartbeat at 300ms
g = sub1(
    g,
    """    // autosave
    const saveInterval = window.setInterval(() => {""",
    """    // movement sync: a steady 300ms cadence so remote cats can be
    // interpolated smoothly (the 5s heartbeat above is only the presence
    // keepalive — far too sparse to animate other players).
    let sync: number | undefined;
    if (mode === "open" && myCat) {
      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          inputSequence: ++inputSeq.current,
          ...movementSample(g),
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 300);
    }

    // autosave
    const saveInterval = window.setInterval(() => {""",
    "src/pages/Game.tsx",
)

# clear it on unmount
g = sub1(
    g,
    """    return () => {
      window.clearInterval(hb);
      window.clearInterval(saveInterval);
      window.clearInterval(bubbleInterval);""",
    """    return () => {
      window.clearInterval(hb);
      window.clearInterval(sync);
      window.clearInterval(saveInterval);
      window.clearInterval(bubbleInterval);""",
    "src/pages/Game.tsx",
)

with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok src/pages/Game.tsx 300ms movement-sync heartbeat")
print("patch26 complete")
