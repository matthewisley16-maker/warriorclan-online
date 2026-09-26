#!/usr/bin/env python3
"""Patch 13: behavior test uses doorAt metadata."""
import io

p = 'scripts/check-pounce-doors.ts'
src = io.open(p, encoding='utf-8').read()
old = """const door = allObjects.find((o) => o.id === "smudge-door")!;
const room = interiors["smudge-house"];
const gw = room.walls[0].length;
const gh = room.walls.length;
// stand right at the doorstep (inside the walk-in trigger radius)
const doorstep = { x: door.x, y: door.y + 14 };"""
new = """const house = allObjects.find((o) => o.id === "smudge-house")!;
const room = interiors["smudge-house"];
const gw = room.walls[0].length;
const gh = room.walls.length;
// door point: the doorway gap on the house's south face
const doorX = house.x + (house.doorAt?.dx ?? 0) * 32;
const doorY = house.y + house.h / 2 + (house.doorAt?.dy ?? 0) * 32;
// stand right at the doorstep (inside the walk-in trigger radius)
const doorstep = { x: doorX, y: doorY + 14 };"""
assert src.count(old) == 1, "test block"
src = src.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(src)
print("test uses doorAt")
