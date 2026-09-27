#!/usr/bin/env python3
# patch31_tsc_fix.py — CatPose has no "run" (poseFromMovement maps run->walk),
# so the comparison is narrowed away by TS. walk alone covers moving states.
import io, sys

with io.open("src/game/engine.ts", encoding="utf-8") as f:
    e = f.read()

OLD = 'b.pose === "walk" || b.pose === "run"'
NEW = 'b.pose === "walk"'
n = e.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
e = e.replace(OLD, NEW)
with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(e)
print("ok walk-only extrapolation branch")
