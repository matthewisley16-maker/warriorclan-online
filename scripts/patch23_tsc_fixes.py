#!/usr/bin/env python3
# patch23_tsc_fixes.py —
# 1. Game.tsx: movementSample() was inserted inside the component body (its
#    anchor comment sits among the hooks) — move it to module scope above the
#    component. An `export function` may not appear there.
# 2. engine.ts: deduplicate the `type CatPose` import added twice by patch20+21.
# 3. engine.ts: cur.walkLatchUntil is optional — coalesce with ?? 0 on read.
import io, sys

def sub1(src, old, new, path):
    n = src.count(old)
    if n != 1:
        print(f"FAIL {path}: expected 1 match, got {n} for:\n{old[:160]}")
        sys.exit(1)
    return src.replace(old, new)

# ---- Game.tsx -------------------------------------------------------------
with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

BAD_BLOCK = """  /** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementState } | null) {
  if (g?.engineState) {
    const s = g.engineState();
    return { x: s.x, y: s.y, facing: s.facing, moving: s.moving, movementState: s.movementState, animationState: s.animationState };
  }
  return { facing: 1, moving: false };
}

/** live facing for the minimap arrow (engine mutates a ref, so poll it) */
"""
GOOD_TAIL = """  /** live facing for the minimap arrow (engine mutates a ref, so poll it) */
"""
g = sub1(g, BAD_BLOCK, GOOD_TAIL, "src/pages/Game.tsx")

HELPER = """/** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementState } | null) {
  if (g?.engineState) {
    const s = g.engineState();
    return { x: s.x, y: s.y, facing: s.facing, moving: s.moving, movementState: s.movementState, animationState: s.animationState };
  }
  return { facing: 1, moving: false };
}

export default function Game() {"""
g = sub1(g, "export default function Game() {", HELPER, "src/pages/Game.tsx")

with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok src/pages/Game.tsx movementSample relocated to module scope")

# ---- engine.ts ------------------------------------------------------------
with io.open("src/game/engine.ts", encoding="utf-8") as f:
    e = f.read()

e = sub1(e, "  type CatPose,\n  type CatPose,\n", "  type CatPose,\n", "src/game/engine.ts")
e = sub1(
    e,
    'if (cur.pose === "walk" && nowMs < cur.walkLatchUntil) {',
    'if (cur.pose === "walk" && nowMs < (cur.walkLatchUntil ?? 0)) {',
    "src/game/engine.ts",
)

with io.open("src/game/engine.ts", "w", encoding="utf-8") as f:
    f.write(e)
print("ok src/game/engine.ts dedupe + latch fix")
print("patch23 complete")
