#!/usr/bin/env python3
# patch28_sync_direct.py — the 300ms movement-sync heartbeat calls
# engineState() directly (fully typed snapshot, no union to widen).
import io, sys

with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

OLD = """        const g = gameRef.current;
        if (!g) return;
        const s = movementSample(g);
        if (!("x" in s)) return; // no engine snapshot yet — nothing to sync
        heartbeat({
          inputSequence: ++inputSeq.current,
          ...s,
          mode: "open","""
NEW = """        const g = gameRef.current;
        if (!g) return;
        const s = g.engineState();
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: s.x,
          y: s.y,
          facing: s.facing,
          moving: s.moving,
          movementState: s.movementState,
          animationState: s.animationState,
          mode: "open","""
n = g.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
g = g.replace(OLD, NEW)
with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok movement-sync uses engineState() directly")
