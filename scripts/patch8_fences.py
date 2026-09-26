#!/usr/bin/env python3
"""Patch 8: fence spans clip the door tiles — shift them clear."""
import io

p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

repls = [
    # fence-2-n spans 64.6..68.2 tiles → clips door tile 64.
    # Door column is tile 64 (spans 64.0..65.0). Fence must start at ≥65.15.
    # New center x = 65.15 + 3.6/2 = 66.95.
    ('{ id: "fence-2-n", x: t(66.4), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-2-n", x: t(66.95), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },'),
    # fence-3-n spans 92.6..96.2 → clips door tile 92.
    # Door column is tile 92. New center x = 93.15 + 1.8 = 94.95.
    ('{ id: "fence-3-n", x: t(94.4), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-3-n", x: t(94.95), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },'),
]
for old, new in repls:
    assert src.count(old) == 1, old[:60]
    src = src.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(src)
print("fences shifted clear of door tiles")
