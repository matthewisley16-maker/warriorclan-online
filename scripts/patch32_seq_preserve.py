#!/usr/bin/env python3
# patch32_seq_preserve.py — heartbeats that omit inputSequence (the ping
# sampler) must not erase the stored sequence, or the old/duplicate guard
# resets. Preserve the existing value instead.
import io, sys

with io.open("src/convex/presence.ts", encoding="utf-8") as f:
    p = f.read()

OLD = """        inputSequence: args.inputSequence,
        movementState,
        animationState,
        stateVersion: (existing.stateVersion ?? 0) + 1,"""
NEW = """        inputSequence: args.inputSequence ?? existing.inputSequence,
        movementState,
        animationState,
        stateVersion: (existing.stateVersion ?? 0) + 1,"""
n = p.count(OLD)
if n != 1:
    print(f"FAIL: expected 1 match, got {n}")
    sys.exit(1)
p = p.replace(OLD, NEW)
with io.open("src/convex/presence.ts", "w", encoding="utf-8") as f:
    f.write(p)
print("ok inputSequence preserved across ping heartbeats")
