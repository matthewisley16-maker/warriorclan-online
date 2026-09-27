#!/usr/bin/env python3
# patch24_movementsnapshot.py — movementSample's parameter type must be the
# engine's engineState() SNAPSHOT, not the MovementState union. Derive it:
# type MovementSnapshot = ReturnType<GameCanvas["engineState"]>.
import io, sys

with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

OLD = """/** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementState } | null) {"""
NEW = """/** live snapshot of the local cat's movement/animation state */
type MovementSnapshot = ReturnType<GameCanvas["engineState"]>;

/** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementSnapshot } | null) {"""
n = g.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
g = g.replace(OLD, NEW)
with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok src/pages/Game.tsx MovementSnapshot type")
