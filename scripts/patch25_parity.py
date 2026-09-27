#!/usr/bin/env python3
# patch25_parity.py — engineState(): report walk/run for movement so remote
# cats render exactly the pose the local player sees (the local engine draws
# sneaking as a walking cat, so remotes must too). Sneaking still lowers
# speed, which the server validates; the visible crouch pose is the emote,
# synced via animationState.
import io, sys

with io.open("src/game/engine.ts", encoding="utf-8") as f:
    src = f.read()

OLD = """    const moving = this.pPose === "walk";
    const movementState: MovementState =
      this.sneaking && moving ? "crouch" : this.running && moving ? "run" : moving ? "walk" : "idle";"""
NEW = """    const moving = this.pPose === "walk";
    // sneaking renders as a walking cat (local parity); speed is what changes
    const movementState: MovementState = moving ? (this.running ? "run" : "walk") : "idle";"""
n = src.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
src = src.replace(OLD, NEW)
with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(src)
print("ok engineState movement parity")
