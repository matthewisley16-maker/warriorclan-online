#!/usr/bin/env python3
"""Patch 7: fix yard fences blocking houses 2 & 3 front doors; align gates."""
import io
import re

p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

repls = [
    # house-2 yard (house at x=64, door at x=64, y=139.4):
    # the north fence spanned 62..68 at y=140, directly in front of the door.
    # Shift it north behind the yard's flowerbed column and move the gate onto
    # the door column; the side fence shifts west off the door approach.
    ('{ id: "fence-2-n", x: t(62), y: t(140), w: t(6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-2-n", x: t(66.4), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },'),
    ('{ id: "fence-2-e", x: t(64), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-2-e", x: t(61.6), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },'),
    ('{ id: "gate-2", x: t(64), y: t(145.4), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },',
     '{ id: "gate-2", x: t(64), y: t(141.6), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },'),
    # house-3 yard (house at x=92, door at x=92, y=139.4): same treatment —
    # north fence shifted east, side fence west, gate aligned to the door.
    ('{ id: "fence-3-n", x: t(90), y: t(140), w: t(6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-3-n", x: t(94.4), y: t(140), w: t(3.6), h: t(0.8), label: "Garden fence", style: "fence", solid: true },'),
    ('{ id: "fence-3-w", x: t(90), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },',
     '{ id: "fence-3-w", x: t(89.6), y: t(140), w: t(0.8), h: t(6), label: "Garden fence", style: "fence", solid: true },'),
    ('{ id: "gate-3", x: t(92), y: t(145.4), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },',
     '{ id: "gate-3", x: t(92), y: t(141.6), w: t(1.6), h: t(0.8), label: "Garden gate", style: "fence" },'),
]
for old, new in repls:
    assert src.count(old) == 1, old[:50]
    src = src.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(src)
print("fences fixed around houses 2 & 3; gates aligned to doors")
