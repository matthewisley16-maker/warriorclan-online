#!/usr/bin/env python3
# patch27_sync_guard.py — the 300ms movement-sync heartbeat must skip when no
# engine snapshot exists (fallback movementSample has no x/y position to send).
import io, sys

with io.open("src/pages/Game.tsx", encoding="utf-8") as f:
    g = f.read()

OLD = """      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        heartbeat({
          inputSequence: ++inputSeq.current,
          ...movementSample(g),
          mode: "open","""
NEW = """      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        const s = movementSample(g);
        if (!("x" in s)) return; // no engine snapshot yet — nothing to sync
        heartbeat({
          inputSequence: ++inputSeq.current,
          ...s,
          mode: "open","""
n = g.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
g = g.replace(OLD, NEW)
with io.open("src/pages/Game.tsx", "w", encoding="utf-8") as f:
    f.write(g)
print("ok movement-sync guard")
